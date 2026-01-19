// 地下城并行模拟 Worker
// 将地下城模拟任务按次数分配到多个 Worker 并行执行

// 独立的合并函数，用于合并从 Worker 返回的普通对象（非 SimResult 实例）
// 因为 Web Worker 的 postMessage 会将对象序列化为 JSON，丢失类方法
function mergeSimResults(target, source) {
    // 合并 deaths
    for (const [key, value] of Object.entries(source.deaths || {})) {
        target.deaths[key] = (target.deaths[key] || 0) + value;
    }

    // 合并 experienceGained
    for (const [playerHrid, expData] of Object.entries(source.experienceGained || {})) {
        if (!target.experienceGained[playerHrid]) {
            target.experienceGained[playerHrid] = {
                stamina: 0, intelligence: 0, attack: 0,
                melee: 0, defense: 0, ranged: 0, magic: 0
            };
        }
        for (const [stat, value] of Object.entries(expData)) {
            target.experienceGained[playerHrid][stat] += value;
        }
    }

    // 合并 encounters
    target.encounters += source.encounters || 0;

    // 合并 attacks (深度嵌套对象)
    for (const [sourceHrid, targets] of Object.entries(source.attacks || {})) {
        if (!target.attacks[sourceHrid]) {
            target.attacks[sourceHrid] = {};
        }
        for (const [targetHrid, abilities] of Object.entries(targets)) {
            if (!target.attacks[sourceHrid][targetHrid]) {
                target.attacks[sourceHrid][targetHrid] = {};
            }
            for (const [ability, hits] of Object.entries(abilities)) {
                if (!target.attacks[sourceHrid][targetHrid][ability]) {
                    target.attacks[sourceHrid][targetHrid][ability] = {};
                }
                for (const [hit, count] of Object.entries(hits)) {
                    target.attacks[sourceHrid][targetHrid][ability][hit] =
                        (target.attacks[sourceHrid][targetHrid][ability][hit] || 0) + count;
                }
            }
        }
    }

    // 合并 consumablesUsed
    for (const [unitHrid, consumables] of Object.entries(source.consumablesUsed || {})) {
        if (!target.consumablesUsed[unitHrid]) {
            target.consumablesUsed[unitHrid] = {};
        }
        for (const [consumableHrid, count] of Object.entries(consumables)) {
            target.consumablesUsed[unitHrid][consumableHrid] =
                (target.consumablesUsed[unitHrid][consumableHrid] || 0) + count;
        }
    }

    // 合并 hitpointsGained
    for (const [unitHrid, sources] of Object.entries(source.hitpointsGained || {})) {
        if (!target.hitpointsGained[unitHrid]) {
            target.hitpointsGained[unitHrid] = {};
        }
        for (const [src, amount] of Object.entries(sources)) {
            target.hitpointsGained[unitHrid][src] =
                (target.hitpointsGained[unitHrid][src] || 0) + amount;
        }
    }

    // 合并 manapointsGained
    for (const [unitHrid, sources] of Object.entries(source.manapointsGained || {})) {
        if (!target.manapointsGained[unitHrid]) {
            target.manapointsGained[unitHrid] = {};
        }
        for (const [src, amount] of Object.entries(sources)) {
            target.manapointsGained[unitHrid][src] =
                (target.manapointsGained[unitHrid][src] || 0) + amount;
        }
    }

    // 合并 hitpointsSpent
    for (const [unitHrid, sources] of Object.entries(source.hitpointsSpent || {})) {
        if (!target.hitpointsSpent[unitHrid]) {
            target.hitpointsSpent[unitHrid] = {};
        }
        for (const [src, amount] of Object.entries(sources)) {
            target.hitpointsSpent[unitHrid][src] =
                (target.hitpointsSpent[unitHrid][src] || 0) + amount;
        }
    }

    // 合并 manaUsed
    for (const [unitHrid, abilities] of Object.entries(source.manaUsed || {})) {
        if (!target.manaUsed[unitHrid]) {
            target.manaUsed[unitHrid] = {};
        }
        for (const [abilityHrid, amount] of Object.entries(abilities)) {
            target.manaUsed[unitHrid][abilityHrid] =
                (target.manaUsed[unitHrid][abilityHrid] || 0) + amount;
        }
    }

    // 合并地下城统计
    target.dungeonsCompleted += source.dungeonsCompleted || 0;
    target.dungeonsFailed += source.dungeonsFailed || 0;
    target.simulatedTime = (target.simulatedTime || 0) + (source.simulatedTime || 0);

    // 合并 maxWaveReached (取最大值)
    target.maxWaveReached = Math.max(target.maxWaveReached || 0, source.maxWaveReached || 0);

    // 合并 maxEnrageStack (取最大值)
    target.maxEnrageStack = Math.max(target.maxEnrageStack || 0, source.maxEnrageStack || 0);

    // 合并 minDungenonTime (取最小非零值)
    if (source.minDungenonTime > 0) {
        if (target.minDungenonTime === 0 || source.minDungenonTime < target.minDungenonTime) {
            target.minDungenonTime = source.minDungenonTime;
        }
    }

    // 合并 lastDungeonFinishTime (累加，因为多worker按次数模拟时各自有独立时间轴)
    target.lastDungeonFinishTime = (target.lastDungeonFinishTime || 0) + (source.lastDungeonFinishTime || 0);

    // 合并 lastEncounterFinishTime (累加，因为多worker按次数模拟时各自有独立时间轴)
    target.lastEncounterFinishTime = (target.lastEncounterFinishTime || 0) + (source.lastEncounterFinishTime || 0);

    // 合并 timeSpentAlive
    for (const otherEntry of (source.timeSpentAlive || [])) {
        const existingIndex = target.timeSpentAlive.findIndex(e => e.name === otherEntry.name);
        if (existingIndex !== -1) {
            target.timeSpentAlive[existingIndex].timeSpentAlive += otherEntry.timeSpentAlive;
            target.timeSpentAlive[existingIndex].count += otherEntry.count;
        } else {
            target.timeSpentAlive.push({ ...otherEntry });
        }
    }

    // 合并 wipeEvents
    target.wipeEvents = (target.wipeEvents || []).concat(source.wipeEvents || []);

    // 合并 playerRanOutOfMana (任一为 true 则为 true)
    for (const [playerHrid, value] of Object.entries(source.playerRanOutOfMana || {})) {
        if (value) {
            target.playerRanOutOfMana[playerHrid] = true;
        }
    }

    // 合并 playerRanOutOfManaTime
    for (const [playerHrid, data] of Object.entries(source.playerRanOutOfManaTime || {})) {
        if (!target.playerRanOutOfManaTime[playerHrid]) {
            target.playerRanOutOfManaTime[playerHrid] = {
                isOutOfMana: false,
                startTimeForOutOfMana: 0,
                totalTimeForOutOfMana: 0
            };
        }
        target.playerRanOutOfManaTime[playerHrid].totalTimeForOutOfMana += data.totalTimeForOutOfMana || 0;
    }

    // 保留第一个结果的 dropRateMultiplier, rareFindMultiplier, combatDropQuantity, debuffOnLevelGap
    // 这些值在同一配置下应该相同，不需要合并
    if (Object.keys(target.dropRateMultiplier || {}).length === 0) {
        target.dropRateMultiplier = source.dropRateMultiplier;
        target.rareFindMultiplier = source.rareFindMultiplier;
        target.combatDropQuantity = source.combatDropQuantity;
        target.debuffOnLevelGap = source.debuffOnLevelGap;
    }

    // bossSpawns 只需保留一份（相同配置下应该相同）
    if ((target.bossSpawns || []).length === 0) {
        target.bossSpawns = source.bossSpawns;
    }
}

onmessage = async function (event) {
    switch (event.data.type) {
        case "start_dungeon_parallel":
            const {
                players,
                zone,
                extra,
                simulationCount,  // 总模拟次数
                parallelCount     // 并行数量，默认使用 CPU 核心数
            } = event.data;

            const maxWorkers = parallelCount || navigator.hardwareConcurrency || 4;
            console.log("Dungeon parallel simulation with " + maxWorkers + " workers for " + simulationCount + " runs");

            // 计算每个 Worker 的模拟次数
            const baseCountPerWorker = Math.floor(simulationCount / maxWorkers);
            const remainder = simulationCount % maxWorkers;

            try {
                const outer_worker = this;
                const workerProgress = new Array(maxWorkers).fill(0);
                const workerCounts = [];

                // 分配每个 Worker 的任务数量
                for (let i = 0; i < maxWorkers; i++) {
                    // 前 remainder 个 Worker 多分配一次
                    workerCounts.push(baseCountPerWorker + (i < remainder ? 1 : 0));
                }

                // 创建并启动所有 Worker
                const workerPromises = [];

                for (let i = 0; i < maxWorkers; i++) {
                    if (workerCounts[i] === 0) continue; // 跳过没有任务的 Worker

                    const workerPromise = new Promise((resolve, reject) => {
                        const simulationWorker = new Worker(new URL('worker.js', import.meta.url));

                        const workerMessage = {
                            type: "start_dungeon_by_count",
                            players: players,
                            zone: zone,
                            extra: { ...extra, enableHpMpVisualization: false },
                            targetCount: workerCounts[i]
                        };

                        simulationWorker.postMessage(workerMessage);

                        simulationWorker.onmessage = function (workerEvent) {
                            if (workerEvent.data.type === "simulation_result") {
                                simulationWorker.terminate();
                                resolve(workerEvent.data.simResult);
                            } else if (workerEvent.data.type === "simulation_progress") {
                                workerProgress[i] = workerEvent.data.progress;
                                // 计算加权总进度
                                let totalProgress = 0;
                                for (let j = 0; j < maxWorkers; j++) {
                                    totalProgress += workerProgress[j] * workerCounts[j];
                                }
                                totalProgress /= simulationCount;
                                outer_worker.postMessage({
                                    type: "simulation_progress",
                                    progress: totalProgress,
                                    zone: workerEvent.data.zone,
                                    difficultyTier: workerEvent.data.difficultyTier
                                });
                            } else if (workerEvent.data.type === "simulation_error") {
                                simulationWorker.terminate();
                                reject(workerEvent.data.error);
                            }
                        };

                        simulationWorker.onerror = function (error) {
                            simulationWorker.terminate();
                            reject(error);
                        };
                    });

                    workerPromises.push(workerPromise);
                }

                // 等待所有 Worker 完成
                const allResults = await Promise.all(workerPromises);

                // 合并所有结果（使用独立函数，因为 Worker 返回的是普通对象）
                const mergedResult = allResults[0];
                for (let i = 1; i < allResults.length; i++) {
                    mergeSimResults(mergedResult, allResults[i]);
                }

                // 发送合并后的结果
                this.postMessage({
                    type: "simulation_result",
                    simResult: mergedResult
                });

            } catch (e) {
                console.error("Dungeon parallel simulation error:", e);
                this.postMessage({
                    type: "simulation_error",
                    error: e.message || e
                });
            }
            break;
    }
};
