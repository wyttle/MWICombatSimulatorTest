import { cloneTeamState, getTriggers, setTriggers } from "./teamState.js";
import { comparePaired } from "./stats.js";

function checkAbort(signal) {
    if (signal?.aborted) {
        const error = new Error("模拟已中止");
        error.name = "AbortError";
        throw error;
    }
}

function variableState(teamState, variable) {
    const player = teamState.players.find((entry) => String(entry.id) === String(variable.playerId));
    if (!player) throw new Error("队员不存在: " + variable.playerId);
    return player.state;
}

function withValues(teamState, variables, values) {
    const result = cloneTeamState(teamState);
    for (let index = 0; index < variables.length; index++) {
        const variable = variables[index];
        const state = variableState(result, variable);
        const triggers = getTriggers(state, variable.abilityHrid);
        triggers[variable.triggerIndex].value = values[index];
        setTriggers(state, variable.abilityHrid, triggers);
    }
    return result;
}

// 一级网格里每个阈值最多试这么多个取值。粗级先定方向，细级只在峰值邻域展开，
// 这样用户填的步长可以当成最终分辨率，而不必自己先手工粗扫一遍。
const MAX_POINTS_PER_LEVEL = 9;

function align(value, origin, step) {
    // 所有候选值都对齐到「用户步长」的整数倍，细级才落得回原始网格上。
    return Number((origin + Math.round((value - origin) / step) * step).toPrecision(15));
}

// 每级的步长：最粗一级保证整段区间不超过 MAX_POINTS_PER_LEVEL 个点，随后逐级减半到用户步长。
function stepLadder(variable) {
    const span = variable.max - variable.min;
    const steps = Math.max(1, Math.round(span / variable.step));
    const ladder = [];
    let multiplier = 1;
    while (steps / multiplier > MAX_POINTS_PER_LEVEL - 1) multiplier *= 2;
    while (multiplier >= 1) {
        ladder.push(Number((variable.step * multiplier).toPrecision(15)));
        multiplier /= 2;
    }
    return ladder;
}

// 某一级的候选值：粗级铺满整段区间，细级只覆盖当前最优值 ± 上一级步长。
function* levelValues(variable, current, step, previousStep) {
    const lo = previousStep === null ? variable.min : Math.max(variable.min, current - previousStep);
    const hi = previousStep === null ? variable.max : Math.min(variable.max, current + previousStep);
    const seen = new Set([current]);
    yield current;
    for (let value = align(lo, variable.min, step); value <= hi; value = Number((value + step).toPrecision(15))) {
        if (value < lo || seen.has(value)) continue;
        seen.add(value);
        yield value;
    }
    // 区间端点本身未必落在步长网格上，但它们是有意义的极端取值。
    for (const edge of [lo, hi]) {
        if (!seen.has(edge)) {
            seen.add(edge);
            yield edge;
        }
    }
}

// 跑完全部级别所需评估次数的上界：最粗级铺满区间，其余各级只覆盖上一级步长的邻域，
// 最细级多跑一轮。故意取保守值——预算是上限，估低了会让扫描半途截断。
export function estimateScanBudget(variables) {
    if (!Array.isArray(variables) || !variables.length) return 0;
    let total = 1;
    for (const variable of variables) {
        if (![variable.min, variable.max, variable.step].every(Number.isFinite) ||
            variable.min > variable.max || variable.step <= 0) return 0;
        const ladder = stepLadder(variable);
        const coarsePoints = Math.floor((variable.max - variable.min) / ladder[0]) + 1;
        // 每个细级在邻域里最多新增 4 个点，最细级再多跑一轮。
        total += coarsePoints + ladder.length * 4;
    }
    return total;
}

export async function scanThresholds({ teamState, variables, evaluate, seeds, maxEvaluations, signal, onProgress }) {
    if (!Array.isArray(variables) || !variables.length) throw new Error("没有可扫描的触发条件");
    if (!Number.isInteger(maxEvaluations) || maxEvaluations < 1) throw new Error("最大评估次数必须是正整数");
    if (!Array.isArray(seeds) || !seeds.length || new Set(seeds).size !== seeds.length ||
        seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
        throw new Error("seed 必须是互不相同的 uint32 整数");
    }
    const targets = new Set();
    const originalValues = variables.map((variable) => {
        if (![variable.min, variable.max, variable.step].every(Number.isFinite) ||
            variable.min > variable.max || variable.step <= 0 ||
            !Number.isSafeInteger(Math.floor((variable.max - variable.min) / variable.step))) {
            throw new Error("扫描范围或步长无效");
        }
        const key = JSON.stringify([String(variable.playerId), variable.abilityHrid, variable.triggerIndex]);
        if (targets.has(key)) throw new Error("同一技能的触发条件变量重复");
        targets.add(key);
        const triggers = getTriggers(variableState(teamState, variable), variable.abilityHrid);
        if (!Number.isInteger(variable.triggerIndex) || variable.triggerIndex < 0 || !triggers[variable.triggerIndex]) {
            throw new Error("触发条件索引无效");
        }
        const value = Number(triggers[variable.triggerIndex].value);
        if (!Number.isFinite(value)) throw new Error("触发条件数值无效");
        return value;
    });
    const expectedSeeds = new Set(seeds);
    const run = async (state) => {
        checkAbort(signal);
        const samples = await evaluate(state);
        checkAbort(signal);
        if (!Array.isArray(samples) || samples.length !== seeds.length ||
            samples.some((sample) => !expectedSeeds.has(sample.seed))) throw new Error("扫描样本 seed 不匹配");
        return samples;
    };
    const original = cloneTeamState(teamState);
    const baseline = await run(cloneTeamState(original));
    const initialComparison = comparePaired(baseline, baseline);
    let evaluations = 1;
    let bestValues = [...originalValues];
    let bestDps = initialComparison.candidateDps;
    const cache = new Map([[JSON.stringify(bestValues), initialComparison]]);
    const curve = [{
        playerId: variables[0].playerId,
        abilityHrid: variables[0].abilityHrid,
        triggerIndex: variables[0].triggerIndex,
        value: originalValues[0],
        step: variables[0].step,
        comparison: initialComparison,
    }];
    const report = (entry) => onProgress?.({ evaluations, maxEvaluations, entry, bestValues: [...bestValues] });
    report(null);
    // 由粗到细：每个阈值先在整段区间上用放大的步长找方向，再逐级减半、
    // 只在当前最优值的邻域展开，最后一级正好落在用户填的步长上。
    // 最细一级跑两轮，让先调的阈值有机会跟随后调的阈值修正。
    const ladders = variables.map(stepLadder);
    const levels = Math.max(...ladders.map((ladder) => ladder.length));
    for (let level = 0; level < levels; level++) {
        const finest = level === levels - 1;
        for (let round = 0; round < (finest ? 2 : 1); round++) {
            for (let index = 0; index < variables.length; index++) {
                const variable = variables[index];
                const ladder = ladders[index];
                // 阶梯短的阈值直接停在自己的最细步长上，不跟着更长的阶梯重复扫。
                const offset = levels - ladder.length;
                if (level < offset) continue;
                const rung = level - offset;
                const step = ladder[rung];
                const previousStep = rung === 0 && round === 0 ? null : ladder[Math.max(0, rung - 1)];
                const fixedValues = [...bestValues];
                for (const value of levelValues(variable, fixedValues[index], step, previousStep)) {
                    checkAbort(signal);
                    const values = [...fixedValues];
                    values[index] = value;
                    const key = JSON.stringify(values);
                    let comparison = cache.get(key);
                    if (!comparison) {
                        if (evaluations >= maxEvaluations) {
                            return {
                                bestTeamState: withValues(original, variables, bestValues),
                                bestValues, curve, evaluations, truncated: true,
                            };
                        }
                        const samples = await run(withValues(original, variables, values));
                        comparison = comparePaired(baseline, samples);
                        cache.set(key, comparison);
                        evaluations++;
                        const entry = {
                            playerId: variable.playerId,
                            abilityHrid: variable.abilityHrid,
                            triggerIndex: variable.triggerIndex,
                            value,
                            step,
                            comparison,
                        };
                        curve.push(entry);
                        if (comparison.candidateDps > bestDps) {
                            bestValues = values;
                            bestDps = comparison.candidateDps;
                        }
                        report(entry);
                    } else if (comparison.candidateDps > bestDps) {
                        bestValues = values;
                        bestDps = comparison.candidateDps;
                    }
                }
            }
        }
    }
    return {
        bestTeamState: withValues(original, variables, bestValues),
        bestValues, curve, evaluations, truncated: false,
    };
}
