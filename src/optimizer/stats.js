// 用不完全贝塔函数反求 Student-t 分位数，避免把小样本当作正态分布。
const LANCZOS = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
];

function logGamma(value) {
    const z = value - 1;
    let sum = 0.9999999999998099;
    for (let index = 0; index < LANCZOS.length; index++) sum += LANCZOS[index] / (z + index + 1);
    const t = z + LANCZOS.length - 0.5;
    return 0.9189385332046727 + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

function betaFraction(a, b, x) {
    const tiny = 1e-300;
    const protect = (value) => Math.abs(value) < tiny ? (value < 0 ? -tiny : tiny) : value;
    let c = 1;
    let d = 1 / protect(1 - (a + b) * x / (a + 1));
    let result = d;
    for (let m = 1; m <= 300; m++) {
        let coefficient = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
        d = 1 / protect(1 + coefficient * d);
        c = protect(1 + coefficient / c);
        result *= d * c;
        coefficient = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
        d = 1 / protect(1 + coefficient * d);
        c = protect(1 + coefficient / c);
        const delta = d * c;
        result *= delta;
        if (Math.abs(delta - 1) < 1e-13) return result;
    }
    throw new Error("Student-t 区间计算未收敛");
}

function regularizedBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    return x < (a + 1) / (a + b + 2)
        ? factor * betaFraction(a, b, x) / a
        : 1 - factor * betaFraction(b, a, 1 - x) / b;
}

function criticalT(degrees) {
    let low = 0;
    let high = 16;
    for (let index = 0; index < 70; index++) {
        const middle = (low + high) / 2;
        const tail = regularizedBeta(degrees / (degrees + middle * middle), degrees / 2, 0.5) / 2;
        if (tail > 0.025) low = middle;
        else high = middle;
    }
    return (low + high) / 2;
}

function sampleMap(samples) {
    if (!Array.isArray(samples) || samples.length === 0) throw new Error("配对样本不能为空");
    const result = new Map();
    for (const sample of samples) {
        if (!Number.isInteger(sample.seed) || sample.seed < 0 || sample.seed > 0xffffffff || result.has(sample.seed)) {
            throw new Error("样本 seed 无效或重复");
        }
        for (const key of ["dps", "deaths", "completed", "failed", "simulatedTime"]) {
            if (!Number.isFinite(sample[key]) || sample[key] < 0) throw new Error("样本数据无效: " + key);
        }
        result.set(sample.seed, sample);
    }
    return result;
}

function rate(sample, kind) {
    const denominator = kind === "wipe" ? sample.completed + sample.failed : sample.simulatedTime / 3.6e12;
    if (denominator === 0) return null;
    const numerator = kind === "wipe" ? sample.failed : kind === "deaths" ? sample.deaths : sample.completed;
    return numerator / denominator;
}

export function comparePaired(baseline, candidate) {
    const baselineMap = sampleMap(baseline);
    const candidateMap = sampleMap(candidate);
    if (baselineMap.size !== candidateMap.size) throw new Error("配对 seed 不匹配");
    const n = baseline.length;
    let baselineDps = 0;
    let candidateDps = 0;
    let deltaDps = 0;
    let m2 = 0;
    let index = 0;
    const rateDeltas = { deaths: 0, wipe: 0, clears: 0 };
    for (const [seed, before] of baselineMap) {
        const after = candidateMap.get(seed);
        if (!after) throw new Error("配对 seed 不匹配");
        index++;
        baselineDps += (before.dps - baselineDps) / index;
        candidateDps += (after.dps - candidateDps) / index;
        const difference = after.dps - before.dps;
        const shift = difference - deltaDps;
        deltaDps += shift / index;
        m2 += shift * (difference - deltaDps);
        for (const kind of Object.keys(rateDeltas)) {
            const beforeRate = rate(before, kind);
            const afterRate = rate(after, kind);
            if (beforeRate === null || afterRate === null) rateDeltas[kind] = null;
            else if (rateDeltas[kind] !== null) rateDeltas[kind] += (afterRate - beforeRate) / n;
        }
    }
    let ciLow = null;
    let ciHigh = null;
    let status = "inconclusive";
    if (n >= 2) {
        const margin = criticalT(n - 1) * Math.sqrt(Math.max(0, m2) / (n - 1) / n);
        ciLow = deltaDps - margin;
        ciHigh = deltaDps + margin;
        if (ciLow > 0) status = "better";
        else if (ciHigh < 0) status = "worse";
    }
    return {
        baselineDps, candidateDps, deltaDps,
        deltaPercent: baselineDps === 0 ? null : deltaDps / baselineDps * 100,
        ciLow, ciHigh, n, status,
        deathsPerHourDelta: rateDeltas.deaths,
        wipeRateDelta: rateDeltas.wipe,
        clearsPerHourDelta: rateDeltas.clears,
    };
}

export function seedList(masterSeed, count) {
    if (!Number.isInteger(masterSeed) || !Number.isInteger(count) || count < 1 || count > 0x100000000) {
        throw new RangeError("主 seed 必须是整数，样本数必须在 uint32 容量内");
    }
    // 奇数步进与可逆混洗组成 uint32 置换，在完整周期内不会重复。
    const seeds = new Array(count);
    let state = masterSeed >>> 0;
    for (let index = 0; index < count; index++) {
        state = (state + 0x9e3779b9) >>> 0;
        let mixed = state ^ (state >>> 16);
        mixed = Math.imul(mixed, 0x21f0aaad);
        mixed ^= mixed >>> 15;
        mixed = Math.imul(mixed, 0x735a2d97);
        seeds[index] = (mixed ^ (mixed >>> 15)) >>> 0;
    }
    return seeds;
}
