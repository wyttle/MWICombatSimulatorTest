function abortError() {
    const error = new Error("模拟已中止");
    error.name = "AbortError";
    return error;
}

function toSample(seed, result) {
    const simulatedTime = result.simulatedTime;
    if (!Number.isFinite(simulatedTime) || simulatedTime <= 0) {
        throw new Error("模拟时间必须大于零");
    }
    let damage = 0;
    let deaths = 0;
    for (const [hrid, targets] of Object.entries(result.attacks || {})) {
        if (!hrid.startsWith("player")) continue;
        for (const abilities of Object.values(targets)) {
            for (const attack of Object.values(abilities)) {
                if (!Number.isFinite(attack.totalDamage)) throw new Error("模拟伤害数据无效");
                damage += attack.totalDamage;
            }
        }
    }
    for (const [hrid, count] of Object.entries(result.deaths || {})) {
        if (!hrid.startsWith("player")) continue;
        if (!Number.isFinite(count) || count < 0) throw new Error("模拟死亡数据无效");
        deaths += count;
    }
    const completed = result.dungeonsCompleted;
    const failed = result.dungeonsFailed;
    if (![completed, failed].every((value) => Number.isInteger(value) && value >= 0)) {
        throw new Error("地下城次数数据无效");
    }
    return {
        seed,
        dps: damage / (simulatedTime / 1e9),
        completed,
        failed,
        deaths,
        simulatedTime,
        consumablesUsed: result.consumablesUsed || {},
    };
}

export class EvaluationRunner {
    constructor({ concurrency }) {
        if (!Number.isInteger(concurrency) || concurrency < 1) {
            throw new RangeError("并行线程数必须是正整数");
        }
        this.concurrency = concurrency;
        this.workers = [];
        this.cancel = null;
        this.disposed = false;
    }

    async evaluate(players, { zone, extra, guildShrineLevels, dungeonCount, seeds, signal, onProgress }) {
        if (this.disposed) throw new Error("模拟器已释放");
        if (this.cancel) throw new Error("模拟正在运行");
        if (signal?.aborted) throw abortError();
        if (!Number.isInteger(dungeonCount) || dungeonCount < 1) {
            throw new RangeError("地下城次数必须是正整数");
        }
        if (!Array.isArray(seeds) || !seeds.length || new Set(seeds).size !== seeds.length ||
            seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
            throw new Error("seed 必须是互不相同的 uint32 整数");
        }
        return new Promise((resolve, reject) => {
            const samples = new Array(seeds.length);
            const fractions = new Array(seeds.length).fill(0);
            let next = 0;
            let finished = 0;
            let settled = false;
            const cleanup = () => {
                signal?.removeEventListener("abort", cancel);
                this.cancel = null;
                for (const worker of this.workers) {
                    worker.onmessage = null;
                    worker.onerror = null;
                    worker.onmessageerror = null;
                }
            };
            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                this.terminateWorkers();
                reject(error);
            };
            const cancel = () => fail(abortError());
            this.cancel = cancel;
            signal?.addEventListener("abort", cancel, { once: true });
            const report = (index, completed, failed) => {
                onProgress?.({
                    finished,
                    total: seeds.length,
                    seed: seeds[index],
                    progress: fractions.reduce((sum, value) => sum + value, 0) / seeds.length,
                    completed,
                    failed,
                });
            };
            const launch = (worker) => {
                if (settled || next >= seeds.length) return;
                const index = next++;
                worker.onmessage = ({ data }) => {
                    if (settled) return;
                    try {
                        if (data.type === "simulation_error") {
                            fail(new Error(String(data.error)));
                        } else if (data.type === "simulation_progress") {
                            if (Number.isFinite(data.progress)) fractions[index] = Math.max(0, Math.min(1, data.progress));
                            report(index, data.completed, data.failed);
                        } else if (data.type === "simulation_result") {
                            samples[index] = toSample(seeds[index], data.simResult);
                            fractions[index] = 1;
                            finished++;
                            report(index, samples[index].completed, samples[index].failed);
                            if (settled) return;
                            if (finished === seeds.length) {
                                settled = true;
                                cleanup();
                                resolve(samples);
                            } else {
                                launch(worker);
                            }
                        }
                    } catch (error) {
                        fail(error);
                    }
                };
                worker.onerror = (event) => fail(new Error(event.message || "模拟线程错误"));
                worker.onmessageerror = () => fail(new Error("模拟线程消息无法解析"));
                worker.postMessage({
                    type: "start_dungeon_by_count",
                    players,
                    zone,
                    extra,
                    guildShrineLevels,
                    targetCount: dungeonCount,
                    seed: seeds[index],
                });
            };
            try {
                const count = Math.min(this.concurrency, seeds.length);
                while (this.workers.length < count) {
                    this.workers.push(new Worker(new URL("../worker.js", import.meta.url)));
                }
                for (let index = 0; index < count; index++) launch(this.workers[index]);
            } catch (error) {
                fail(error);
            }
        });
    }

    terminateWorkers() {
        for (const worker of this.workers) worker.terminate();
        this.workers.length = 0;
    }

    dispose() {
        this.disposed = true;
        this.cancel?.();
        this.terminateWorkers();
    }
}
