import combatStyleDetailMap from "./data/combatStyleDetailMap.json"

class SimResult {
    constructor(zone, labyrinth, numberOfPlayers) {
        this.deaths = {};
        this.experienceGained = {};
        this.encounters = 0;
        this.attacks = {};
        this.consumablesUsed = {};
        this.hitpointsGained = {};
        this.manapointsGained = {};
        this.debuffOnLevelGap = {};
        this.dropRateMultiplier = {};
        this.rareFindMultiplier = {};
        this.combatDropQuantity = {};
        this.playerRanOutOfMana = {
            "player1": false,
            "player2": false,
            "player3": false,
            "player4": false,
            "player5": false
        };
        this.playerRanOutOfManaTime = {};
        this.manaUsed = {};
        this.timeSpentAlive = [];
        this.bossSpawns = [];
        this.hitpointsSpent = {};
        this.zoneName = zone?.hrid;
        this.difficultyTier = zone?.difficultyTier;
        this.labyrinthName = labyrinth?.monsterHrid;
        this.roomLevel = labyrinth?.roomLevel;
        this.isDungeon = false;
        this.isLabyrinth = labyrinth ? true : false;
        this.dungeonsCompleted = 0;
        this.dungeonsFailed = 0;
        this.maxWaveReached = 0;
        this.numberOfPlayers = numberOfPlayers;
        this.maxEnrageStack = 0;
        this.minDungenonTime = 0;
        this.maxDungenonTime = 0;
        this.dungeonCompletionTimeCount = 0;
        this.dungeonCompletionTimeMean = 0;
        this.dungeonCompletionTimeM2 = 0;
        this.labyAttemptCount = 0;
        this.lastDungeonFinishTime = 0;
        this.lastEncounterFinishTime = 0;

        this.wipeEvents = [];
        
        // 时间序列数据用于图表显示
        this.timeSeriesData = {
            timestamps: [],
            players: {}
        };
        this._lastSentIndex = 0;
    }

    addWipeEvent(logs, simulationTime, wave) {
        if (this.wipeEvents.length >= 50) {
            this.wipeEvents.shift();
        }
        this.wipeEvents.push({
            simulationTime: simulationTime,
            logs: logs,
            wave: wave,
            timestamp: new Date().toISOString()
        });
    }
    
    addDeath(unit) {
        if (!this.deaths[unit.hrid]) {
            this.deaths[unit.hrid] = 0;
        }

        this.deaths[unit.hrid] += 1;
    }

    updateTimeSpentAlive(name, alive, time) {
        const i = this.timeSpentAlive.findIndex(e => e.name === name);
        if (alive) {
            if (i !== -1) {
                this.timeSpentAlive[i].alive = true;
                this.timeSpentAlive[i].spawnedAt = time;
            } else {
                this.timeSpentAlive.push({ name: name, timeSpentAlive: 0, spawnedAt: time, alive: true, count: 0 });
            }
        } else {
            const timeAlive = time - this.timeSpentAlive[i].spawnedAt;
            this.timeSpentAlive[i].alive = false;
            this.timeSpentAlive[i].timeSpentAlive += timeAlive;
            this.timeSpentAlive[i].count += 1;
        }
    }

    updateDungenonFinish(beginFlag, finishTime) {
        const i = this.timeSpentAlive.findIndex(e => e.name === beginFlag); 
        if (i == -1) {
            return;
        }

        const currentDungenonTime = finishTime - this.timeSpentAlive[i].spawnedAt;

        this.dungeonCompletionTimeCount += 1;
        const delta = currentDungenonTime - this.dungeonCompletionTimeMean;
        this.dungeonCompletionTimeMean += delta / this.dungeonCompletionTimeCount;
        const deltaFromUpdatedMean = currentDungenonTime - this.dungeonCompletionTimeMean;
        this.dungeonCompletionTimeM2 += delta * deltaFromUpdatedMean;

        if (this.minDungenonTime == 0 || this.minDungenonTime > currentDungenonTime) {
            this.minDungenonTime = currentDungenonTime;
        }

        if (this.maxDungenonTime < currentDungenonTime) {
            this.maxDungenonTime = currentDungenonTime;
        }
    }

    addExperienceGain(unit, experience) {
        if (!unit.isPlayer) {
            return;
        }

        if (!this.experienceGained[unit.hrid]) {
            this.experienceGained[unit.hrid] = {
                stamina: 0,
                intelligence: 0,
                attack: 0,
                melee: 0,
                defense: 0,
                ranged: 0,
                magic: 0,
            };
        }

        let experienceGainedRate = {
            "stamina": 0,
            "intelligence": 0,
            "attack": 0,
            "melee": 0,
            "defense": 0,
            "ranged": 0,
            "magic": 0,
        };

        const primaryTraining = unit.combatDetails.combatStats.primaryTraining;
        experienceGainedRate[primaryTraining.split("/")[2]] = .3;

        const skillExpMap = combatStyleDetailMap[unit.combatDetails.combatStats.combatStyleHrid].skillExpMap;
        const skillExpMapLength = Object.keys(skillExpMap).length;

        const focusTraining = unit.combatDetails.combatStats.focusTraining;
        if (focusTraining && skillExpMap[focusTraining]) {
            experienceGainedRate[focusTraining.split("/")[2]] += .7;
        } else {
            Object.keys(skillExpMap).forEach(skillHrid => {
                experienceGainedRate[skillHrid.split("/")[2]] += .7 / skillExpMapLength;
            });
        }

        for (const [type, rate] of Object.entries(experienceGainedRate)) {
            if (rate <= 0) continue;

            const skillExperience = rate * (1 + unit.combatDetails.combatStats[type + "Experience"]);

            this.experienceGained[unit.hrid][type] += (
                experience
                * (1 + unit.combatDetails.combatStats.combatExperience)
                * skillExperience
                * (1 + unit.debuffOnLevelGap)

            );
        }
    }

    addEncounterEnd() {
        this.encounters++;
    }

    addAttack(source, target, ability, hit) {
        if (!this.attacks[source.hrid]) {
            this.attacks[source.hrid] = {};
        }
        if (!this.attacks[source.hrid][target.hrid]) {
            this.attacks[source.hrid][target.hrid] = {};
        }
        if (!this.attacks[source.hrid][target.hrid][ability]) {
            this.attacks[source.hrid][target.hrid][ability] = { casts: 0, misses: 0, totalDamage: 0 };
        }

        const stats = this.attacks[source.hrid][target.hrid][ability];
        stats.casts += 1;
        if (hit === "miss") {
            stats.misses += 1;
        } else {
            stats.totalDamage += hit;
        }
    }

    addConsumableUse(unit, consumable) {
        if (!this.consumablesUsed[unit.hrid]) {
            this.consumablesUsed[unit.hrid] = {};
        }
        if (!this.consumablesUsed[unit.hrid][consumable.hrid]) {
            this.consumablesUsed[unit.hrid][consumable.hrid] = 0;
        }

        this.consumablesUsed[unit.hrid][consumable.hrid] += 1;
    }

    addHitpointsGained(unit, source, amount) {
        if (!this.hitpointsGained[unit.hrid]) {
            this.hitpointsGained[unit.hrid] = {};
        }
        if (!this.hitpointsGained[unit.hrid][source]) {
            this.hitpointsGained[unit.hrid][source] = 0;
        }

        this.hitpointsGained[unit.hrid][source] += amount;
    }

    addManapointsGained(unit, source, amount) {
        if (!this.manapointsGained[unit.hrid]) {
            this.manapointsGained[unit.hrid] = {};
        }
        if (!this.manapointsGained[unit.hrid][source]) {
            this.manapointsGained[unit.hrid][source] = 0;
        }

        this.manapointsGained[unit.hrid][source] += amount;
    }

    setDropRateMultipliers(unit) {
        if (!this.dropRateMultiplier[unit.hrid]) {
            this.dropRateMultiplier[unit.hrid] = {};
        }
        this.dropRateMultiplier[unit.hrid] = 1 + unit.combatDetails.combatStats.combatDropRate;

        if (!this.rareFindMultiplier[unit.hrid]) {
            this.rareFindMultiplier[unit.hrid] = {};
        }
        this.rareFindMultiplier[unit.hrid] = 1 + unit.combatDetails.combatStats.combatRareFind;

        if (!this.combatDropQuantity[unit.hrid]) {
            this.combatDropQuantity[unit.hrid] = {};
        }
        this.combatDropQuantity[unit.hrid] = unit.combatDetails.combatStats.combatDropQuantity;

        if (!this.debuffOnLevelGap[unit.hrid]) {
            this.debuffOnLevelGap[unit.hrid] = {};
        }
        this.debuffOnLevelGap[unit.hrid] = unit.debuffOnLevelGap;
    }

    setManaUsed(unit) {
        this.manaUsed[unit.hrid] = {};
        for (let [key, value] of unit.abilityManaCosts.entries()) {
            this.manaUsed[unit.hrid][key] = value;
        }
    }

    addHitpointsSpent(unit, source, amount) {
        if (!this.hitpointsSpent[unit.hrid]) {
            this.hitpointsSpent[unit.hrid] = {};
        }
        if (!this.hitpointsSpent[unit.hrid][source]) {
            this.hitpointsSpent[unit.hrid][source] = 0;
        }

        this.hitpointsSpent[unit.hrid][source] += amount;
    }

    addRanOutOfManaCount(unit, isOutOfMana, time) {
        if (isOutOfMana) this.playerRanOutOfMana[unit.hrid] = true;

        if (!this.playerRanOutOfManaTime[unit.hrid]) {
            this.playerRanOutOfManaTime[unit.hrid] = {isOutOfMana: false, startTimeForOutOfMana:0, totalTimeForOutOfMana:0};
        }

        if (isOutOfMana) {
            if (!this.playerRanOutOfManaTime[unit.hrid].isOutOfMana) {
                this.playerRanOutOfManaTime[unit.hrid].isOutOfMana = true;
                this.playerRanOutOfManaTime[unit.hrid].startTimeForOutOfMana = time;
            }
        } else {
            if (this.playerRanOutOfManaTime[unit.hrid].isOutOfMana) {
                this.playerRanOutOfManaTime[unit.hrid].isOutOfMana = false;
                this.playerRanOutOfManaTime[unit.hrid].totalTimeForOutOfMana += time - this.playerRanOutOfManaTime[unit.hrid].startTimeForOutOfMana;
            }
        }
    }

    // 添加时间序列数据点（上限 5000 点，防止内存溢出）
    addTimeSeriesSnapshot(time, players) {
        if (this.timeSeriesData.timestamps.length >= 5000) {
            return;
        }

        this.timeSeriesData.timestamps.push(time);

        players.forEach(player => {
            if (!this.timeSeriesData.players[player.hrid]) {
                this.timeSeriesData.players[player.hrid] = {
                    hp: [],
                    mp: [],
                    maxHp: [],
                    maxMp: []
                };
            }

            const playerData = this.timeSeriesData.players[player.hrid];
            playerData.hp.push(player.combatDetails.currentHitpoints);
            playerData.mp.push(player.combatDetails.currentManapoints);
            playerData.maxHp.push(player.combatDetails.maxHitpoints);
            playerData.maxMp.push(player.combatDetails.maxManapoints);
        });
    }

    // 获取自上次发送以来的增量数据
    getTimeSeriesDelta() {
        const startIdx = this._lastSentIndex;
        const endIdx = this.timeSeriesData.timestamps.length;

        if (endIdx <= startIdx) return null;

        const delta = {
            timestamps: this.timeSeriesData.timestamps.slice(startIdx, endIdx),
            players: {}
        };

        for (const [playerId, playerData] of Object.entries(this.timeSeriesData.players)) {
            delta.players[playerId] = {
                hp: playerData.hp.slice(startIdx, endIdx),
                mp: playerData.mp.slice(startIdx, endIdx),
                maxHp: playerData.maxHp.slice(startIdx, endIdx),
                maxMp: playerData.maxMp.slice(startIdx, endIdx),
            };
        }

        this._lastSentIndex = endIdx;
        return delta;
    }

    // 合并另一个 SimResult 的数据（用于并行模拟结果合并）
    merge(other) {
        // 合并 deaths
        for (const [key, value] of Object.entries(other.deaths)) {
            this.deaths[key] = (this.deaths[key] || 0) + value;
        }

        // 合并 experienceGained
        for (const [playerHrid, expData] of Object.entries(other.experienceGained)) {
            if (!this.experienceGained[playerHrid]) {
                this.experienceGained[playerHrid] = {
                    stamina: 0, intelligence: 0, attack: 0,
                    melee: 0, defense: 0, ranged: 0, magic: 0
                };
            }
            for (const [stat, value] of Object.entries(expData)) {
                this.experienceGained[playerHrid][stat] += value;
            }
        }

        // 合并 encounters
        this.encounters += other.encounters;

        // 合并 attacks
        for (const [sourceHrid, targets] of Object.entries(other.attacks)) {
            if (!this.attacks[sourceHrid]) {
                this.attacks[sourceHrid] = {};
            }
            for (const [targetHrid, abilities] of Object.entries(targets)) {
                if (!this.attacks[sourceHrid][targetHrid]) {
                    this.attacks[sourceHrid][targetHrid] = {};
                }
                for (const [ability, stats] of Object.entries(abilities)) {
                    if (!this.attacks[sourceHrid][targetHrid][ability]) {
                        this.attacks[sourceHrid][targetHrid][ability] = { casts: 0, misses: 0, totalDamage: 0 };
                    }
                    const existing = this.attacks[sourceHrid][targetHrid][ability];
                    existing.casts += stats.casts;
                    existing.misses += stats.misses;
                    existing.totalDamage += stats.totalDamage;
                }
            }
        }

        // 合并 consumablesUsed
        for (const [unitHrid, consumables] of Object.entries(other.consumablesUsed)) {
            if (!this.consumablesUsed[unitHrid]) {
                this.consumablesUsed[unitHrid] = {};
            }
            for (const [consumableHrid, count] of Object.entries(consumables)) {
                this.consumablesUsed[unitHrid][consumableHrid] =
                    (this.consumablesUsed[unitHrid][consumableHrid] || 0) + count;
            }
        }

        // 合并 hitpointsGained
        for (const [unitHrid, sources] of Object.entries(other.hitpointsGained)) {
            if (!this.hitpointsGained[unitHrid]) {
                this.hitpointsGained[unitHrid] = {};
            }
            for (const [source, amount] of Object.entries(sources)) {
                this.hitpointsGained[unitHrid][source] =
                    (this.hitpointsGained[unitHrid][source] || 0) + amount;
            }
        }

        // 合并 manapointsGained
        for (const [unitHrid, sources] of Object.entries(other.manapointsGained)) {
            if (!this.manapointsGained[unitHrid]) {
                this.manapointsGained[unitHrid] = {};
            }
            for (const [source, amount] of Object.entries(sources)) {
                this.manapointsGained[unitHrid][source] =
                    (this.manapointsGained[unitHrid][source] || 0) + amount;
            }
        }

        // 合并 hitpointsSpent
        for (const [unitHrid, sources] of Object.entries(other.hitpointsSpent)) {
            if (!this.hitpointsSpent[unitHrid]) {
                this.hitpointsSpent[unitHrid] = {};
            }
            for (const [source, amount] of Object.entries(sources)) {
                this.hitpointsSpent[unitHrid][source] =
                    (this.hitpointsSpent[unitHrid][source] || 0) + amount;
            }
        }

        // 合并 manaUsed
        for (const [unitHrid, abilities] of Object.entries(other.manaUsed)) {
            if (!this.manaUsed[unitHrid]) {
                this.manaUsed[unitHrid] = {};
            }
            for (const [abilityHrid, amount] of Object.entries(abilities)) {
                this.manaUsed[unitHrid][abilityHrid] =
                    (this.manaUsed[unitHrid][abilityHrid] || 0) + amount;
            }
        }

        // 合并地下城统计
        this.dungeonsCompleted += other.dungeonsCompleted;
        this.dungeonsFailed += other.dungeonsFailed;
        this.simulatedTime = (this.simulatedTime || 0) + (other.simulatedTime || 0);

        // 合并 maxWaveReached (取最大值)
        this.maxWaveReached = Math.max(this.maxWaveReached, other.maxWaveReached);

        // 合并 maxEnrageStack (取最大值)
        this.maxEnrageStack = Math.max(this.maxEnrageStack, other.maxEnrageStack);

        // 合并 minDungenonTime (取最小非零值)
        if (other.minDungenonTime > 0) {
            if (this.minDungenonTime === 0 || other.minDungenonTime < this.minDungenonTime) {
                this.minDungenonTime = other.minDungenonTime;
            }
        }

        // 合并 maxDungenonTime (取最大值)
        this.maxDungenonTime = Math.max(this.maxDungenonTime, other.maxDungenonTime || 0);

        // 合并 Welford 在线统计量，避免纳秒平方和的大数消减误差
        const otherCompletionCount = other.dungeonCompletionTimeCount || 0;
        if (otherCompletionCount > 0) {
            const currentCompletionCount = this.dungeonCompletionTimeCount;
            const combinedCompletionCount = currentCompletionCount + otherCompletionCount;
            const meanDelta = other.dungeonCompletionTimeMean - this.dungeonCompletionTimeMean;
            this.dungeonCompletionTimeMean += meanDelta * otherCompletionCount / combinedCompletionCount;
            this.dungeonCompletionTimeM2 += (other.dungeonCompletionTimeM2 || 0)
                + meanDelta * meanDelta * currentCompletionCount * otherCompletionCount / combinedCompletionCount;
            this.dungeonCompletionTimeCount = combinedCompletionCount;
        }

        // 合并 labyAttemptCount
        this.labyAttemptCount = (this.labyAttemptCount || 0) + (other.labyAttemptCount || 0);

        // 合并 lastDungeonFinishTime (累加，因为多worker按次数模拟时各自有独立时间轴)
        this.lastDungeonFinishTime += other.lastDungeonFinishTime;

        // 合并 lastEncounterFinishTime (累加，因为多worker按次数模拟时各自有独立时间轴)
        this.lastEncounterFinishTime += other.lastEncounterFinishTime;

        // 合并 timeSpentAlive
        for (const otherEntry of other.timeSpentAlive) {
            const existingIndex = this.timeSpentAlive.findIndex(e => e.name === otherEntry.name);
            if (existingIndex !== -1) {
                this.timeSpentAlive[existingIndex].timeSpentAlive += otherEntry.timeSpentAlive;
                this.timeSpentAlive[existingIndex].count += otherEntry.count;
            } else {
                this.timeSpentAlive.push({ ...otherEntry });
            }
        }

        // 合并 wipeEvents
        this.wipeEvents = this.wipeEvents.concat(other.wipeEvents);

        // 合并 playerRanOutOfMana (任一为 true 则为 true)
        for (const [playerHrid, value] of Object.entries(other.playerRanOutOfMana)) {
            if (value) {
                this.playerRanOutOfMana[playerHrid] = true;
            }
        }

        // 合并 playerRanOutOfManaTime
        for (const [playerHrid, data] of Object.entries(other.playerRanOutOfManaTime)) {
            if (!this.playerRanOutOfManaTime[playerHrid]) {
                this.playerRanOutOfManaTime[playerHrid] = {
                    isOutOfMana: false,
                    startTimeForOutOfMana: 0,
                    totalTimeForOutOfMana: 0
                };
            }
            this.playerRanOutOfManaTime[playerHrid].totalTimeForOutOfMana += data.totalTimeForOutOfMana;
        }

        // 保留第一个结果的 dropRateMultiplier, rareFindMultiplier, combatDropQuantity, debuffOnLevelGap
        // 这些值在同一配置下应该相同，不需要合并
        if (Object.keys(this.dropRateMultiplier).length === 0) {
            this.dropRateMultiplier = other.dropRateMultiplier;
            this.rareFindMultiplier = other.rareFindMultiplier;
            this.combatDropQuantity = other.combatDropQuantity;
            this.debuffOnLevelGap = other.debuffOnLevelGap;
        }

        // bossSpawns 只需保留一份（相同配置下应该相同）
        if (this.bossSpawns.length === 0) {
            this.bossSpawns = other.bossSpawns;
        }
    }
}

export default SimResult;
