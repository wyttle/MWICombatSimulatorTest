import { cloneTeamState, getTriggers, setTriggers } from "./teamState.js";
import { comparePaired } from "./stats.js";

// 高斯过程贝叶斯优化：所有勾选阈值作为一个整体建模，候选可以同时改多个阈值，
// 因此能发现「单独改哪个都变差、一起改才变好」的联动。目标是相对搜索起点的配对 ΔDPS。

const SQRT5 = Math.sqrt(5);
const MAX_FIT_POINTS = 150;
const MAX_BATCH = 8;
const SLICE_POINTS = 80;

function checkAbort(signal) {
    if (signal?.aborted) {
        const error = new Error("模拟已中止");
        error.name = "AbortError";
        throw error;
    }
}

function yieldToEventLoop() {
    return new Promise((resolve) => setTimeout(resolve, 0));
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

function validRange(variable) {
    return [variable.min, variable.max, variable.step].every(Number.isFinite) &&
        variable.min <= variable.max && variable.step > 0 &&
        Number.isSafeInteger(Math.floor((variable.max - variable.min) / variable.step));
}

// mulberry32：由 seed 列表派生，页面关闭后按同一计划重放时选点完全一致。
function createRandom(seeds) {
    let state = 0x9e3779b9;
    for (const seed of seeds) state = Math.imul(state ^ seed, 0x85ebca6b) ^ (state >>> 13);
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function gaussian(random) {
    const u = Math.max(random(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

// 输入扭曲：以自动推导的断点（怪物 HP、技能伤害尺度等）为节点做分段线性映射，每段占相同宽度。
// 自动范围可达 -100～129100，而关键结构集中在几千以内；不扭曲的话平稳核会把这些区域压成一个点。
function createAxis(variable) {
    const inside = (value) => Number.isFinite(value) && value > variable.min && value < variable.max;
    const knots = [...new Set([variable.min, variable.max, ...(variable.warpPoints ?? variable.suggestedPoints ?? []).filter(inside)])].sort((a, b) => a - b);
    const segments = Math.max(1, knots.length - 1);
    const gridCount = Math.floor((variable.max - variable.min) / variable.step);
    const gridValue = (index) => Number((variable.min + index * variable.step).toPrecision(15));
    return {
        forward(value) {
            if (knots.length < 2 || value <= knots[0]) return 0;
            if (value >= knots[knots.length - 1]) return 1;
            let low = 0;
            let high = knots.length - 1;
            while (high - low > 1) {
                const middle = (low + high) >> 1;
                if (knots[middle] <= value) low = middle;
                else high = middle;
            }
            const width = knots[low + 1] - knots[low];
            return (low + (width > 0 ? (value - knots[low]) / width : 0)) / segments;
        },
        inverse(position) {
            if (knots.length < 2) return variable.min;
            const scaled = Math.min(1, Math.max(0, position)) * segments;
            const index = Math.min(segments - 1, Math.floor(scaled));
            return knots[index] + (scaled - index) * (knots[index + 1] - knots[index]);
        },
        // 对齐到用户网格；区间上界不在网格上时也作为合法端点。
        snap(value) {
            const index = Math.min(gridCount, Math.max(0, Math.round((value - variable.min) / variable.step)));
            const grid = gridValue(index);
            return Math.abs(variable.max - value) < Math.abs(grid - value) ? variable.max : grid;
        },
        shift(value, steps) {
            const index = Math.min(gridCount, Math.max(0, Math.round((value - variable.min) / variable.step) + steps));
            return gridValue(index);
        },
    };
}

function matern(r2) {
    const r = Math.sqrt(r2);
    return (1 + SQRT5 * r + 5 * r2 / 3) * Math.exp(-SQRT5 * r);
}

function scaledDistance(a, b, inverseSquares) {
    let sum = 0;
    for (let index = 0; index < a.length; index++) {
        const delta = a[index] - b[index];
        sum += delta * delta * inverseSquares[index];
    }
    return sum;
}

// 行主序下三角 Cholesky；失败返回 false，由调用方加抖动重试。
function cholesky(matrix, size) {
    for (let j = 0; j < size; j++) {
        const rowJ = j * size;
        let diagonal = matrix[rowJ + j];
        for (let k = 0; k < j; k++) diagonal -= matrix[rowJ + k] * matrix[rowJ + k];
        if (!(diagonal > 0)) return false;
        const pivot = Math.sqrt(diagonal);
        matrix[rowJ + j] = pivot;
        for (let i = j + 1; i < size; i++) {
            const rowI = i * size;
            let sum = matrix[rowI + j];
            for (let k = 0; k < j; k++) sum -= matrix[rowI + k] * matrix[rowJ + k];
            matrix[rowI + j] = sum / pivot;
        }
    }
    return true;
}

function forwardSolve(lower, size, vector) {
    const result = new Float64Array(size);
    for (let i = 0; i < size; i++) {
        const row = i * size;
        let sum = vector[i];
        for (let k = 0; k < i; k++) sum -= lower[row + k] * result[k];
        result[i] = sum / lower[row + i];
    }
    return result;
}

function backSolve(lower, size, vector) {
    const result = new Float64Array(size);
    for (let i = size - 1; i >= 0; i--) {
        let sum = vector[i];
        for (let k = i + 1; k < size; k++) sum -= lower[k * size + i] * result[k];
        result[i] = sum / lower[i * size + i];
    }
    return result;
}

// noiseScale[i]：该观测相对完整 seed 评估的噪声倍数（只跑了 1/4 的 seed 就是 4），分级评估靠它区分点的可信度。
function factorize(points, params, noiseScale) {
    const size = points.length;
    const inverseSquares = params.lengthscales.map((scale) => 1 / (scale * scale));
    let jitter = 1e-9;
    for (let attempt = 0; attempt < 8; attempt++, jitter *= 10) {
        const matrix = new Float64Array(size * size);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j <= i; j++) {
                const value = params.signal * matern(scaledDistance(points[i], points[j], inverseSquares));
                matrix[i * size + j] = value;
                matrix[j * size + i] = value;
            }
            matrix[i * size + i] += params.noise * (noiseScale ? noiseScale[i] : 1) + jitter * params.signal;
        }
        if (cholesky(matrix, size)) return { lower: matrix, size, inverseSquares };
    }
    throw new Error("高斯过程协方差矩阵无法分解");
}

function buildModel(points, targets, params, noiseScale) {
    const { lower, size, inverseSquares } = factorize(points, params, noiseScale);
    const alpha = backSolve(lower, size, forwardSolve(lower, size, targets));
    return { points, lower, size, inverseSquares, alpha, params, targets, noiseScale };
}

function predict(model, point, withVariance = true) {
    const { points, size, inverseSquares, alpha, params } = model;
    const cross = new Float64Array(size);
    let mean = 0;
    for (let i = 0; i < size; i++) {
        cross[i] = params.signal * matern(scaledDistance(point, points[i], inverseSquares));
        mean += cross[i] * alpha[i];
    }
    if (!withVariance) return { mean, sd: 0 };
    const solved = forwardSolve(model.lower, size, cross);
    let reduction = 0;
    for (let i = 0; i < size; i++) reduction += solved[i] * solved[i];
    return { mean, sd: Math.sqrt(Math.max(1e-12 * params.signal, params.signal - reduction)) };
}

// 带先验的负对数边际似然（MAP）：点数少时防止长度尺度或噪声跑到退化值。
function negativeLogPosterior(theta, points, targets, noiseScale, noisePrior) {
    const dimensions = points[0].length;
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
    const logScales = theta.slice(0, dimensions).map((value) => clamp(value, Math.log(0.01), Math.log(20)));
    const logSignal = clamp(theta[dimensions], Math.log(1e-4), Math.log(100));
    const logNoise = clamp(theta[dimensions + 1], Math.log(1e-6), Math.log(10));
    let factor;
    try {
        factor = factorize(points, { lengthscales: logScales.map(Math.exp), signal: Math.exp(logSignal), noise: Math.exp(logNoise) }, noiseScale);
    } catch {
        return Number.POSITIVE_INFINITY;
    }
    const { lower, size } = factor;
    const solved = forwardSolve(lower, size, targets);
    let value = 0;
    for (let i = 0; i < size; i++) value += 0.5 * solved[i] * solved[i] + Math.log(lower[i * size + i]);
    for (const logScale of logScales) value += 0.5 * ((logScale - Math.log(0.25)) / 1.2) ** 2;
    value += 0.5 * (logSignal / 1.5) ** 2;
    value += 0.5 * ((logNoise - Math.log(noisePrior)) / 0.7) ** 2;
    // 越界部分额外惩罚，让单纯形退回可行域。
    for (let index = 0; index < theta.length; index++) {
        const bounded = index < dimensions ? logScales[index] : index === dimensions ? logSignal : logNoise;
        value += 10 * (theta[index] - bounded) ** 2;
    }
    return value;
}

async function nelderMead(objective, start, { maxEvaluations, step, signal }) {
    const size = start.length;
    let simplex = [start.slice()];
    for (let index = 0; index < size; index++) {
        const vertex = start.slice();
        vertex[index] += step;
        simplex.push(vertex);
    }
    let values = simplex.map(objective);
    let evaluations = simplex.length;
    while (evaluations < maxEvaluations) {
        if (evaluations % 40 < 4) {
            await yieldToEventLoop();
            checkAbort(signal);
        }
        const order = values.map((_, index) => index).sort((a, b) => values[a] - values[b]);
        simplex = order.map((index) => simplex[index]);
        values = order.map((index) => values[index]);
        if (Math.abs(values[size] - values[0]) < 1e-7 * (1 + Math.abs(values[0]))) break;
        const centroid = new Array(size).fill(0);
        for (let vertex = 0; vertex < size; vertex++) {
            for (let index = 0; index < size; index++) centroid[index] += simplex[vertex][index] / size;
        }
        const worst = simplex[size];
        const along = (factor) => centroid.map((value, index) => value + factor * (value - worst[index]));
        const reflected = along(1);
        const reflectedValue = objective(reflected);
        evaluations++;
        if (reflectedValue < values[0]) {
            const expanded = along(2);
            const expandedValue = objective(expanded);
            evaluations++;
            [simplex[size], values[size]] = expandedValue < reflectedValue ? [expanded, expandedValue] : [reflected, reflectedValue];
        } else if (reflectedValue < values[size - 1]) {
            simplex[size] = reflected;
            values[size] = reflectedValue;
        } else {
            const contracted = reflectedValue < values[size] ? along(0.5) : along(-0.5);
            const contractedValue = objective(contracted);
            evaluations++;
            if (contractedValue < Math.min(reflectedValue, values[size])) {
                simplex[size] = contracted;
                values[size] = contractedValue;
            } else {
                for (let vertex = 1; vertex <= size; vertex++) {
                    simplex[vertex] = simplex[vertex].map((value, index) => simplex[0][index] + 0.5 * (value - simplex[0][index]));
                    values[vertex] = objective(simplex[vertex]);
                    evaluations++;
                }
            }
        }
    }
    let best = 0;
    for (let index = 1; index < values.length; index++) if (values[index] < values[best]) best = index;
    return simplex[best];
}

function normalCdf(value) {
    // Abramowitz-Stegun 7.1.26，误差 < 1.5e-7。
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
}

function expectedImprovement(mean, sd, incumbent) {
    const gain = mean - incumbent;
    if (sd < 1e-12) return Math.max(0, gain);
    const z = gain / sd;
    return gain * normalCdf(z) + sd * Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

// 配对差值均值的方差：同 seed 相减后剩下的噪声，作为观测噪声的先验中心。
function pairedVariance(baseline, samples) {
    const before = new Map(baseline.map((sample) => [sample.seed, sample.dps]));
    const differences = samples.map((sample) => sample.dps - before.get(sample.seed));
    const count = differences.length;
    if (count < 2) return null;
    const mean = differences.reduce((sum, value) => sum + value, 0) / count;
    const variance = differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1);
    return variance / count;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// 线程按「配置 × seed」排队：选一批配置数，使最后一波空转的线程尽量少。
export function batchSizeFor(concurrency, seedCount) {
    if (!(concurrency >= 1) || !(seedCount >= 1)) return 1;
    let best = 1;
    let bestUtilization = 0;
    for (let size = 1; size <= MAX_BATCH; size++) {
        const tasks = size * seedCount;
        const utilization = tasks / (concurrency * Math.ceil(tasks / concurrency));
        if (utilization >= 0.9) return size;
        if (utilization > bestUtilization + 1e-9) {
            best = size;
            bestUtilization = utilization;
        }
    }
    return best;
}

export function estimateBayesBudget(variables) {
    if (!Array.isArray(variables) || !variables.length || variables.some((variable) => !validRange(variable))) return 0;
    return Math.min(500, 12 * variables.length + 12);
}

// 分级评估：seed 足够多时，候选先只跑一半的 seed，模型认为仍有机会超过当前最优的才补跑其余 seed。
function stageSplit(seeds) {
    if (seeds.length < 4) return { first: seeds, rest: [] };
    const count = Math.ceil(seeds.length / 2);
    return { first: seeds.slice(0, count), rest: seeds.slice(count) };
}

export async function optimizeThresholds({ teamState, variables, evaluateBatch, seeds, maxEvaluations, batchSize = 1, concurrency = null, signal, onProgress }) {
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
    const { first: stageSeeds, rest: restSeeds } = stageSplit(seeds);
    const racing = restSeeds.length > 0;
    const checkSamples = (samples, expected) => {
        const wanted = new Set(expected);
        if (!Array.isArray(samples) || samples.length !== expected.length ||
            new Set(samples.map((sample) => sample.seed)).size !== expected.length ||
            samples.some((sample) => !wanted.has(sample.seed))) throw new Error("扫描样本 seed 不匹配");
        return samples;
    };
    const batch = Math.max(1, Math.min(MAX_BATCH, Math.floor(batchSize) || 1));
    // 第一阶段每个候选只占少量线程，一批可以多提几个候选把线程填满。
    const stageBatch = racing && concurrency ? batchSizeFor(concurrency, stageSeeds.length) : batch;
    const random = createRandom(seeds);
    const axes = variables.map(createAxis);
    const dimensions = variables.length;
    const original = cloneTeamState(teamState);
    const encode = (values) => values.map((value, index) => axes[index].forward(value));

    const history = [];
    const cache = new Set();
    let baseline = null;
    // 预算按 seed 场次折算成评估次数：只跑 4/16 个 seed 的候选计 0.25 次。
    let spent = 0;
    const spentRounded = () => Math.round(spent * 100) / 100;
    const baselineFor = (samples) => {
        const wanted = new Set(samples.map((sample) => sample.seed));
        return baseline.filter((sample) => wanted.has(sample.seed));
    };
    const isFull = (entry) => entry.samples.length === seeds.length;
    const rawBest = () => history.reduce((best, entry) => isFull(entry) && entry.comparison.deltaDps > best.comparison.deltaDps ? entry : best, history[0]);
    const report = (historyEntry, updatedEntry) => onProgress?.({
        evaluations: spentRounded(), maxEvaluations, entry: null, historyEntry, updatedEntry, context: null,
        bestValues: [...rawBest().values],
    });

    // 同一批配置并行评估，结果按提交顺序写入历史，保证续跑重放时编号一致。
    // existing 给定时是补跑：新样本并入已有记录，配对比较按全部样本重算。
    const evaluateAll = async (configs, phase, subset = seeds, existing = null) => {
        checkAbort(signal);
        const completed = new Array(configs.length);
        const created = [];
        let cursor = 0;
        const flush = () => {
            while (cursor < configs.length && completed[cursor]) {
                const fresh = completed[cursor];
                let entry;
                if (existing) {
                    entry = existing[cursor];
                    entry.samples = [...entry.samples, ...fresh];
                    entry.comparison = comparePaired(baselineFor(entry.samples), entry.samples);
                    entry.phase = phase;
                } else {
                    if (!baseline) baseline = fresh;
                    entry = {
                        id: `evaluation-${history.length}`, values: configs[cursor], samples: fresh,
                        comparison: comparePaired(baselineFor(fresh), fresh),
                        contextId: null, variableIndex: null, value: null, step: null, phase,
                    };
                    history.push(entry);
                    created.push(entry);
                    cache.add(JSON.stringify(configs[cursor]));
                }
                spent += subset.length / seeds.length;
                report(existing ? null : entry, entry);
                cursor++;
            }
        };
        const results = await evaluateBatch(configs.map((values) => withValues(original, variables, values)), (index, samples) => {
            completed[index] = checkSamples(samples, subset);
            flush();
        }, subset);
        checkAbort(signal);
        if (!Array.isArray(results) || results.length !== configs.length) throw new Error("批量评估结果数量不匹配");
        results.forEach((samples, index) => { completed[index] ??= checkSamples(samples, subset); });
        flush();
        return created;
    };

    await evaluateAll([originalValues], "baseline", seeds);

    // 初始设计：在扭曲空间做拉丁超立方，覆盖每个阈值的各个尺度区段。
    const initialCount = Math.min(maxEvaluations - 1, Math.max(Math.min(2 * dimensions, 20), Math.min(6, maxEvaluations - 1)));
    const initial = [];
    if (initialCount > 0) {
        const strata = axes.map(() => {
            const order = Array.from({ length: initialCount }, (_, index) => index);
            for (let index = order.length - 1; index > 0; index--) {
                const swap = Math.floor(random() * (index + 1));
                [order[index], order[swap]] = [order[swap], order[index]];
            }
            return order;
        });
        for (let row = 0; row < initialCount; row++) {
            const values = axes.map((axis, dimension) => axis.snap(axis.inverse((strata[dimension][row] + random()) / initialCount)));
            const key = JSON.stringify(values);
            if (cache.has(key) || initial.some((entry) => JSON.stringify(entry) === key)) continue;
            initial.push(values);
        }
    }
    let params = null;
    let fittedAt = 0;
    let model = null;
    let scale = { mean: 0, sd: 1 };

    // 第一阶段结束后：与当前最优（只看完整评估过的配置）比较后验，明显更差的不再补跑。
    // 不能盲目补跑一批中的最好者：整批都远差于最优时补跑纯属浪费。
    const promote = async (entries) => {
        if (!racing || !entries.length) return;
        await refit(false);
        const incumbent = history.filter(isFull)
            .map((entry) => predict(model, encode(entry.values)))
            .reduce((best, item) => item.mean > best.mean ? item : best);
        const scored = entries.map((entry) => ({ entry, ...predict(model, encode(entry.values)) }))
            .sort((a, b) => b.mean - a.mean);
        const chosen = [];
        scored.forEach((item, rank) => {
            const z = (item.mean - incumbent.mean) / Math.sqrt(item.sd * item.sd + incumbent.sd * incumbent.sd + 1e-12);
            if (z > -1 || (rank === 0 && z > -2)) chosen.push(item.entry);
        });
        const affordable = Math.floor((maxEvaluations - spent) * seeds.length / restSeeds.length + 1e-9);
        const promoted = chosen.slice(0, Math.max(0, affordable));
        if (promoted.length) await evaluateAll(promoted.map((entry) => entry.values), "promotion", restSeeds, promoted);
    };

    const observations = () => {
        const deltas = history.map((entry) => entry.comparison.deltaDps);
        const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
        const variance = deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, deltas.length - 1);
        const sd = variance > 1e-12 ? Math.sqrt(variance) : 1;
        // 配对方差折算成完整 seed 数下的均值方差，作为噪声先验；部分评估的点按 seed 数放大噪声。
        const variances = history.slice(1)
            .map((entry) => {
                const value = pairedVariance(baselineFor(entry.samples), entry.samples);
                return value === null ? null : value * entry.samples.length / seeds.length;
            })
            .filter((value) => value !== null);
        const pooled = variances.length ? median(variances) : 0;
        return {
            points: history.map((entry) => encode(entry.values)),
            targets: Float64Array.from(deltas, (value) => (value - mean) / sd),
            noiseScale: history.map((entry) => seeds.length / entry.samples.length),
            scale: { mean, sd },
            noisePrior: Math.max(1e-6, pooled / (sd * sd)),
        };
    };

    // 超参数按点数几何增长重拟合；两次之间只重新分解协方差矩阵。
    const refit = async (force) => {
        const data = observations();
        scale = data.scale;
        const count = data.points.length;
        if (force || !params || count < 30 || count >= fittedAt * 1.2) {
            let fitPoints = data.points;
            let fitTargets = data.targets;
            let fitNoise = data.noiseScale;
            if (count > MAX_FIT_POINTS) {
                // 拟合只用子集：最好的一部分加按序号均匀抽取的其余点，确定性选择以便重放。
                const ranked = [...data.targets.keys()].sort((a, b) => data.targets[b] - data.targets[a]);
                const chosen = new Set(ranked.slice(0, 50));
                const rest = ranked.slice(50).sort((a, b) => a - b);
                const stride = rest.length / (MAX_FIT_POINTS - 50);
                for (let index = 0; chosen.size < MAX_FIT_POINTS && index < rest.length; index++) chosen.add(rest[Math.floor(index * stride)]);
                const indices = [...chosen].sort((a, b) => a - b);
                fitPoints = indices.map((index) => data.points[index]);
                fitTargets = Float64Array.from(indices, (index) => data.targets[index]);
                fitNoise = indices.map((index) => data.noiseScale[index]);
            }
            const objective = (theta) => negativeLogPosterior(theta, fitPoints, fitTargets, fitNoise, data.noisePrior);
            const defaults = [...new Array(dimensions).fill(Math.log(0.25)), 0, Math.log(data.noisePrior)];
            const starts = params ? [[...params.lengthscales.map(Math.log), Math.log(params.signal), Math.log(params.noise)], defaults] : [defaults];
            let best = null;
            let bestValue = Number.POSITIVE_INFINITY;
            for (const start of starts) {
                const theta = await nelderMead(objective, start, { maxEvaluations: 60 * (dimensions + 2), step: 0.7, signal });
                const value = objective(theta);
                if (value < bestValue) {
                    best = theta;
                    bestValue = value;
                }
            }
            const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
            params = {
                lengthscales: best.slice(0, dimensions).map((value) => Math.exp(clamp(value, Math.log(0.01), Math.log(20)))),
                signal: Math.exp(clamp(best[dimensions], Math.log(1e-4), Math.log(100))),
                noise: Math.exp(clamp(best[dimensions + 1], Math.log(1e-6), Math.log(10))),
            };
            fittedAt = count;
        }
        model = buildModel(data.points, data.targets, params, data.noiseScale);
    };

    const posteriorRanking = () => history
        .map((entry, index) => ({ entry, index, ...predict(model, model.points[index]) }))
        .sort((a, b) => b.mean - a.mean || a.index - b.index);

    if (initial.length) await promote(await evaluateAll(initial, "initial", stageSeeds));

    // 候选池：全局随机 + 围绕后验最优点的局部扰动（按相关性挑维度，同时改 1～3 个阈值）+ 最优点逐维 ±1/±2 网格。
    const candidatePool = (size, exclude) => {
        const ranking = posteriorRanking();
        const centers = ranking.slice(0, 5).map((item) => item.entry.values);
        const relevance = params.lengthscales.map((scale) => 1 / (scale * scale));
        const total = relevance.reduce((sum, value) => sum + value, 0);
        const pickDimension = () => {
            if (random() < 0.2) return Math.floor(random() * dimensions);
            let threshold = random() * total;
            for (let index = 0; index < dimensions; index++) {
                threshold -= relevance[index];
                if (threshold <= 0) return index;
            }
            return dimensions - 1;
        };
        const pool = [];
        const seen = new Set(exclude);
        const add = (values) => {
            const key = JSON.stringify(values);
            if (seen.has(key)) return;
            seen.add(key);
            pool.push(values);
        };
        for (let dimension = 0; dimension < dimensions; dimension++) {
            for (const steps of [-2, -1, 1, 2]) {
                const values = [...centers[0]];
                values[dimension] = axes[dimension].shift(values[dimension], steps);
                add(values);
            }
        }
        for (let attempt = 0; pool.length < size && attempt < size * 4; attempt++) {
            if (random() < 0.3) {
                add(axes.map((axis) => axis.snap(axis.inverse(random()))));
                continue;
            }
            const center = random() < 0.5 ? centers[0] : centers[Math.floor(random() * centers.length)];
            const values = [...center];
            const draw = random();
            const changes = Math.min(dimensions, draw < 0.5 ? 1 : draw < 0.8 ? 2 : 3);
            for (let change = 0; change < changes; change++) {
                const dimension = pickDimension();
                const axis = axes[dimension];
                if (random() < 0.4) {
                    const steps = (random() < 0.5 ? -1 : 1) * 2 ** Math.floor(random() * 4);
                    values[dimension] = axis.shift(values[dimension], steps);
                } else {
                    const spread = 0.5 * Math.min(1, params.lengthscales[dimension]);
                    const position = Math.min(1, Math.max(0, axis.forward(values[dimension]) + spread * gaussian(random)));
                    values[dimension] = axis.snap(axis.inverse(position));
                }
            }
            add(values);
        }
        return pool;
    };

    let stopReason = "bayesBudget";
    const stageCost = stageSeeds.length / seeds.length;
    while (spent + stageCost <= maxEvaluations + 1e-9) {
        checkAbort(signal);
        await refit(false);
        const count = Math.min(stageBatch, Math.floor((maxEvaluations - spent) / stageCost + 1e-9));
        const chosen = [];
        const fantasyPoints = [...model.points];
        const fantasyTargets = Array.from(model.targets);
        const fantasyNoise = [...model.noiseScale];
        let fantasyModel = model;
        const pool = candidatePool(Math.max(300, Math.min(2000, Math.floor(6e7 / (model.size * model.size + 1)))), cache);
        if (!pool.length) {
            stopReason = "bayesExhausted";
            break;
        }
        for (let pick = 0; pick < count && pool.length; pick++) {
            const incumbent = Math.max(...fantasyPoints.map((point) => predict(fantasyModel, point, false).mean));
            let bestIndex = -1;
            let bestScore = -1;
            for (let index = 0; index < pool.length; index++) {
                const { mean, sd } = predict(fantasyModel, encode(pool[index]));
                const score = expectedImprovement(mean, sd, incumbent);
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = index;
                }
            }
            const [values] = pool.splice(bestIndex, 1);
            chosen.push(values);
            if (pick + 1 < count) {
                // 克里金信念：假设已选点的结果等于后验均值，压低其附近的不确定性，避免同一批扎堆。
                const point = encode(values);
                fantasyPoints.push(point);
                fantasyTargets.push(predict(fantasyModel, point, false).mean);
                fantasyNoise.push(1);
                fantasyModel = buildModel(fantasyPoints, Float64Array.from(fantasyTargets), params, fantasyNoise);
                await yieldToEventLoop();
                checkAbort(signal);
            }
        }
        await promote(await evaluateAll(chosen, "acquisition", stageSeeds));
    }

    checkAbort(signal);
    await refit(true);
    // 只在完整评估过的配置里选：部分评估的点噪声更大，不能当最优方案交付。
    const ranking = posteriorRanking().filter((item) => isFull(item.entry));
    const toDelta = (value) => value * scale.sd + scale.mean;
    // 取后验均值最高的已评估配置，而不是样本均值最高者：减轻从大量带噪候选中择优的高估。
    const best = ranking[0].entry;
    const bestValues = [...best.values];
    const modelSlices = variables.map((variable, variableIndex) => {
        const values = new Set([bestValues[variableIndex]]);
        for (let index = 0; index <= SLICE_POINTS; index++) values.add(axes[variableIndex].snap(axes[variableIndex].inverse(index / SLICE_POINTS)));
        const points = [...values].sort((a, b) => a - b).map((value) => {
            const vector = [...bestValues];
            vector[variableIndex] = value;
            const { mean, sd } = predict(model, encode(vector));
            return { value, mean: toDelta(mean), sd: sd * scale.sd };
        });
        return { variableIndex, fixedValues: [...bestValues], points };
    });
    const alternatives = [];
    for (const item of ranking) {
        if (alternatives.length >= 5) break;
        alternatives.push({
            id: item.entry.id, values: [...item.entry.values],
            teamState: withValues(original, variables, item.entry.values), comparison: item.entry.comparison,
            posteriorMean: toDelta(item.mean), posteriorSd: item.sd * scale.sd,
        });
    }
    const inverseSquares = params.lengthscales.map((value) => 1 / (value * value));
    const maxRelevance = Math.max(...inverseSquares);
    return {
        method: "bayes",
        bestTeamState: withValues(original, variables, bestValues),
        bestValues, history, curve: [], contexts: [], modelSlices, alternatives,
        evaluations: spentRounded(), configurations: history.length, seedCount: seeds.length,
        racing: racing ? { stageSeeds: stageSeeds.length, promoted: history.filter((entry) => entry.phase === "promotion").length } : null,
        truncated: false, stopReason,
        // 长度尺度越短，阈值对 DPS 越敏感；归一化到最敏感者为 1，只是模型估计。
        sensitivity: variables.map((_, variableIndex) => ({ variableIndex, relevance: inverseSquares[variableIndex] / maxRelevance })),
        model: {
            lengthscales: params.lengthscales, signal: params.signal * scale.sd * scale.sd,
            noise: params.noise * scale.sd * scale.sd, fittedPoints: fittedAt,
        },
    };
}
