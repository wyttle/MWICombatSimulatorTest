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

const MAX_POINTS_PER_LEVEL = 9;
const MAX_BASINS = 3;
const MAX_SWEEPS = 2;

function validRange(variable) {
    return [variable.min, variable.max, variable.step].every(Number.isFinite) &&
        variable.min <= variable.max && variable.step > 0 &&
        Number.isSafeInteger(Math.floor((variable.max - variable.min) / variable.step));
}

function gridValue(variable, index, step = variable.step) {
    return Number((variable.min + index * step).toPrecision(15));
}

// 粗级覆盖整个定义域；后续步长只按二倍递减，最后一级始终是用户步长。
function stepLadder(variable) {
    const intervals = (variable.max - variable.min) / variable.step;
    let multiplier = 1;
    while (intervals / multiplier > MAX_POINTS_PER_LEVEL - 1) multiplier *= 2;
    const ladder = [];
    while (multiplier >= 1) {
        ladder.push(variable.step * multiplier);
        multiplier /= 2;
    }
    return ladder;
}

function coarseValues(variable, step) {
    const values = new Set([variable.min, variable.max]);
    const count = Math.floor((variable.max - variable.min) / step);
    for (let index = 0; index <= count; index++) values.add(gridValue(variable, index, step));
    for (const value of variable.suggestedPoints ?? []) {
        if (!Number.isFinite(value) || value < variable.min || value > variable.max) continue;
        values.add(gridValue(variable, Math.round((value - variable.min) / variable.step)));
    }
    return [...values].filter((value) => value >= variable.min && value <= variable.max).sort((a, b) => a - b);
}

function refinementValues(variable, centers, step) {
    const values = new Set();
    for (const center of centers) {
        values.add(center);
        const position = (center - variable.min) / step;
        // 非网格端点两侧取相邻网格点，不能把端点当成另一个网格原点。
        const lower = Math.ceil(position) - 1;
        const upper = Math.floor(position) + 1;
        values.add(gridValue(variable, lower, step));
        values.add(gridValue(variable, upper, step));
    }
    return [...values].filter((value) => value >= variable.min && value <= variable.max).sort((a, b) => a - b);
}

// 只在同一组固定坐标里比较局部峰值；保留不同区域，平峰优先分散取点。
function selectBasins(points, variable, spacing) {
    const ordered = [...points.values()]
        .filter((entry) => entry.value >= variable.min && entry.value <= variable.max)
        .sort((a, b) => a.value - b.value);
    const peaks = ordered.filter((entry, index) =>
        (index === 0 || entry.score >= ordered[index - 1].score) &&
        (index === ordered.length - 1 || entry.score >= ordered[index + 1].score));
    const selected = [];
    while (selected.length < MAX_BASINS && peaks.length) {
        const distance = (entry) => selected.length
            ? Math.min(...selected.map((value) => Math.abs(entry.value - value)))
            : 0;
        peaks.sort((a, b) => b.score - a.score || distance(b) - distance(a) || a.value - b.value);
        const next = peaks.shift();
        if (selected.every((value) => Math.abs(next.value - value) >= spacing)) selected.push(next.value);
    }
    return selected;
}

// 单变量的细级中心已缓存，每个区域最多新增两点；多变量上下文变化时最多新增三点。
// 两轮全域粗扫给前面的坐标一次跟随后面坐标变化的机会，不把无改进误称为全局收敛。
export function estimateScanBudget(variables) {
    if (!Array.isArray(variables) || !variables.length || variables.some((variable) => !validRange(variable))) return 0;
    const sweeps = variables.length === 1 ? 1 : MAX_SWEEPS;
    let total = 1;
    for (const variable of variables) {
        const ladder = stepLadder(variable);
        const refinementBound = MAX_BASINS * (variables.length === 1 ? 2 : 3);
        total += sweeps * (coarseValues(variable, ladder[0]).length + (ladder.length - 1) * refinementBound);
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
        if (!validRange(variable)) throw new Error("扫描范围或步长无效");
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
            new Set(samples.map((sample) => sample.seed)).size !== seeds.length ||
            samples.some((sample) => !expectedSeeds.has(sample.seed))) throw new Error("扫描样本 seed 不匹配");
        return samples;
    };
    const original = cloneTeamState(teamState);
    const baseline = await run(cloneTeamState(original));
    const initialComparison = comparePaired(baseline, baseline);
    const history = [{
        id: "evaluation-0", values: [...originalValues], samples: baseline, comparison: initialComparison,
        contextId: null, variableIndex: null, value: null, step: null,
    }];
    const cache = new Map([[JSON.stringify(originalValues), history[0]]]);
    let best = history[0];
    const contexts = [];
    const contextCache = new Map();
    const curve = [{
        ...history[0], samples: undefined,
        variableIndex: 0, playerId: variables[0].playerId,
        abilityHrid: variables[0].abilityHrid, triggerIndex: variables[0].triggerIndex,
        value: originalValues[0], step: variables[0].step, accepted: false, baseline: true,
        historyId: history[0].id,
    }];
    const report = (entry, historyEntry, context) => onProgress?.({
        evaluations: history.length, maxEvaluations, entry, historyEntry, context, bestValues: [...best.values],
    });
    report(curve[0], history[0], null);
    const finish = (stopReason) => ({
        bestTeamState: withValues(original, variables, best.values),
        bestValues: [...best.values], curve, history, contexts,
        evaluations: history.length, truncated: stopReason === "budget", stopReason,
        // 搜索样本选出的整套方案仅供探索，不是独立验证通过的收益承诺。
        alternatives: [...history].sort((a, b) => b.comparison.candidateDps - a.comparison.candidateDps)
            .slice(0, 5).map((entry) => ({
                id: entry.id, values: [...entry.values],
                teamState: withValues(original, variables, entry.values), comparison: entry.comparison,
            })),
    });
    const ladders = variables.map(stepLadder);
    const levels = Math.max(...ladders.map((ladder) => ladder.length));
    const sweeps = variables.length === 1 ? 1 : MAX_SWEEPS;
    for (let sweep = 0; sweep < sweeps; sweep++) {
        const basins = variables.map(() => []);
        // 先让所有坐标完成粗级，再细化，避免前几个坐标提前吃光共享预算。
        for (let level = 0; level < levels; level++) {
            for (let index = 0; index < variables.length; index++) {
                checkAbort(signal);
                const ladder = ladders[index];
                if (level >= ladder.length) continue;
                const variable = variables[index];
                const step = ladder[level];
                const fixedValues = [...best.values];
                const contextKey = JSON.stringify([index, fixedValues.map((value, other) => other === index ? null : value)]);
                let context = contextCache.get(contextKey);
                if (!context) {
                    context = { id: `context-${contexts.length}`, values: fixedValues, variableIndex: index, step };
                    contextCache.set(contextKey, context);
                    contexts.push(context);
                } else {
                    context.step = Math.min(context.step, step);
                }
                const candidates = level === 0
                    ? coarseValues(variable, step)
                    : refinementValues(variable, basins[index], step);
                const points = new Map();
                // 原始阈值即使不在指定网格上也保留为对照，不生成越界的新阈值。
                for (const value of new Set([fixedValues[index], ...candidates])) {
                    checkAbort(signal);
                    const values = [...fixedValues];
                    values[index] = value;
                    const key = JSON.stringify(values);
                    let evaluation = cache.get(key);
                    let historyEntry = null;
                    if (!evaluation) {
                        if (history.length >= maxEvaluations) return finish("budget");
                        const samples = await run(withValues(original, variables, values));
                        evaluation = {
                            id: `evaluation-${history.length}`, values, samples,
                            comparison: comparePaired(baseline, samples),
                            contextId: context.id, variableIndex: index, value, step,
                        };
                        history.push(evaluation);
                        cache.set(key, evaluation);
                        historyEntry = evaluation;
                    }
                    const accepted = evaluation.comparison.candidateDps > best.comparison.candidateDps;
                    if (accepted) best = evaluation;
                    const entry = {
                        id: evaluation.id, historyId: evaluation.id,
                        contextId: context.id, values: evaluation.values, variableIndex: index,
                        playerId: variable.playerId, abilityHrid: variable.abilityHrid,
                        triggerIndex: variable.triggerIndex, value, step, accepted,
                        baseline: evaluation === history[0], reused: historyEntry === null,
                        comparison: evaluation.comparison,
                    };
                    curve.push(entry);
                    points.set(value, { value, score: evaluation.comparison.candidateDps });
                    report(entry, historyEntry, context);
                }
                basins[index] = selectBasins(points, variable, step);
            }
        }
    }
    checkAbort(signal);
    return finish("resolution");
}
