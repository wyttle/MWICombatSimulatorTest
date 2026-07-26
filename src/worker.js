import CombatSimulator from "./combatsimulator/combatSimulator";
import Player from "./combatsimulator/player";
import Zone from "./combatsimulator/zone";
import Labyrinth from "./combatsimulator/labyrinth";
import { createGuildShrineBuffs } from "./combatsimulator/guildShrine";

// 创建 extraBuffs 的辅助函数
function createExtraBuffs(extra) {
    let extraBuffs = [];
    if (extra.mooPass) {
        const mooPassBuff = {
            "uniqueHrid": "/buff_uniques/experience_moo_pass_buff",
            "typeHrid": "/buff_types/wisdom",
            "ratioBoost": 0,
            "ratioBoostLevelBonus": 0,
            "flatBoost": 0.05,
            "flatBoostLevelBonus": 0,
            "startTime": "0001-01-01T00:00:00Z",
            "duration": 0
        };
        extraBuffs.push(mooPassBuff);
    }
    if (extra.comExp > 0) {
        const comExpBuff = {
            "uniqueHrid": "/buff_uniques/experience_community_buff",
            "typeHrid": "/buff_types/wisdom",
            "ratioBoost": 0,
            "ratioBoostLevelBonus": 0,
            "flatBoost": 0.005 * (extra.comExp - 1) + 0.2,
            "flatBoostLevelBonus": 0,
            "startTime": "0001-01-01T00:00:00Z",
            "duration": 0
        };
        extraBuffs.push(comExpBuff);
    }
    if (extra.comDrop > 0) {
        const comDropBuff = {
            "uniqueHrid": "/buff_uniques/combat_community_buff",
            "typeHrid": "/buff_types/combat_drop_quantity",
            "ratioBoost": 0,
            "ratioBoostLevelBonus": 0,
            "flatBoost": 0.005 * (extra.comDrop - 1) + 0.2,
            "flatBoostLevelBonus": 0,
            "startTime": "0001-01-01T00:00:00Z",
            "duration": 0
        };
        extraBuffs.push(comDropBuff);
    }
    if (extra.personalBuffs) {
        const personalBuffDefs = {
            "/items/seal_of_attack_speed": {
                "uniqueHrid": "/buff_uniques/personal_attack_speed",
                "typeHrid": "/buff_types/attack_speed",
                "ratioBoost": 0.15, "ratioBoostLevelBonus": 0,
                "flatBoost": 0, "flatBoostLevelBonus": 0,
                "startTime": "0001-01-01T00:00:00Z", "duration": 0
            },
            "/items/seal_of_cast_speed": {
                "uniqueHrid": "/buff_uniques/personal_cast_speed",
                "typeHrid": "/buff_types/cast_speed",
                "ratioBoost": 0, "ratioBoostLevelBonus": 0,
                "flatBoost": 0.15, "flatBoostLevelBonus": 0,
                "startTime": "0001-01-01T00:00:00Z", "duration": 0
            },
            "/items/seal_of_combat_drop": {
                "uniqueHrid": "/buff_uniques/personal_combat_drop",
                "typeHrid": "/buff_types/combat_drop_quantity",
                "ratioBoost": 0, "ratioBoostLevelBonus": 0,
                "flatBoost": 0.15, "flatBoostLevelBonus": 0,
                "startTime": "0001-01-01T00:00:00Z", "duration": 0
            },
            "/items/seal_of_critical_rate": {
                "uniqueHrid": "/buff_uniques/personal_critical_rate",
                "typeHrid": "/buff_types/critical_rate",
                "ratioBoost": 0, "ratioBoostLevelBonus": 0,
                "flatBoost": 0.1, "flatBoostLevelBonus": 0,
                "startTime": "0001-01-01T00:00:00Z", "duration": 0
            },
            "/items/seal_of_damage": {
                "uniqueHrid": "/buff_uniques/personal_damage",
                "typeHrid": "/buff_types/damage",
                "ratioBoost": 0.08, "ratioBoostLevelBonus": 0,
                "flatBoost": 0, "flatBoostLevelBonus": 0,
                "startTime": "0001-01-01T00:00:00Z", "duration": 0
            },
            "/items/seal_of_rare_find": {
                "uniqueHrid": "/buff_uniques/personal_rare_find",
                "typeHrid": "/buff_types/rare_find",
                "ratioBoost": 0, "ratioBoostLevelBonus": 0,
                "flatBoost": 0.6, "flatBoostLevelBonus": 0,
                "startTime": "0001-01-01T00:00:00Z", "duration": 0
            },
            "/items/seal_of_wisdom": {
                "uniqueHrid": "/buff_uniques/personal_wisdom",
                "typeHrid": "/buff_types/wisdom",
                "ratioBoost": 0, "ratioBoostLevelBonus": 0,
                "flatBoost": 0.2, "flatBoostLevelBonus": 0,
                "startTime": "0001-01-01T00:00:00Z", "duration": 0
            }
        };
        for (let buff of extra.personalBuffs) {
            if (personalBuffDefs[buff]) {
                extraBuffs.push(personalBuffDefs[buff]);
            }
        }
    }
    return extraBuffs;
}

onmessage = async function (event) {
    switch (event.data.type) {
        case "start_simulation": {
            let extraBuffs = createExtraBuffs(event.data.extra);
            let guildShrineBuffs = createGuildShrineBuffs(event.data.guildShrineLevels);

            let playersData = event.data.players;
            let players = [];
            let zone = null;
            if (event.data.zone) {
                zone = new Zone(event.data.zone.zoneHrid, event.data.zone.difficultyTier);
            }
            let labyrinth = null;
            if (event.data.labyrinth) {
                labyrinth = new Labyrinth(event.data.labyrinth.labyrinthHrid, event.data.labyrinth.roomLevel, event.data.labyrinth.crates);
            }
            for (let i = 0; i < playersData.length; i++) {
                let currentPlayer = Player.createFromDTO(structuredClone(playersData[i]));
                currentPlayer.zoneBuffs = zone?.buffs || labyrinth?.buffs || [];
                currentPlayer.extraBuffs = extraBuffs;
                currentPlayer.guildShrineBuffs = guildShrineBuffs;
                players.push(currentPlayer);
            }
            let simulationTimeLimit = event.data.simulationTimeLimit;
            let enableHpMpVisualization = event.data.extra.enableHpMpVisualization || false;
            let combatSimulator = new CombatSimulator(players, zone, labyrinth, { enableHpMpVisualization });
            combatSimulator.addEventListener("progress", (event) => {
                this.postMessage({
                    type: "simulation_progress",
                    progress: event.detail.progress,
                    zone: event.detail.zone,
                    difficultyTier: event.detail.difficultyTier,
                    labyrinth: event.detail.labyrinth,
                    roomLevel: event.detail.roomLevel,
                    timeSeriesDelta: event.detail.timeSeriesDelta
                });
            });

            try {
                let simResult = await combatSimulator.simulate(simulationTimeLimit);
                this.postMessage({ type: "simulation_result", simResult: simResult });
            } catch (e) {
                console.log(e);
                this.postMessage({ type: "simulation_error", error: e });
            }
            break;
        }

        case "start_dungeon_by_count": {
            // 按次数模拟地下城
            let extraBuffs = createExtraBuffs(event.data.extra);
            let guildShrineBuffs = createGuildShrineBuffs(event.data.guildShrineLevels);

            let playersData = event.data.players;
            let players = [];
            let zone = new Zone(event.data.zone.zoneHrid, event.data.zone.difficultyTier);
            for (let i = 0; i < playersData.length; i++) {
                let currentPlayer = Player.createFromDTO(structuredClone(playersData[i]));
                currentPlayer.zoneBuffs = zone.buffs;
                currentPlayer.extraBuffs = extraBuffs;
                currentPlayer.guildShrineBuffs = guildShrineBuffs;
                players.push(currentPlayer);
            }

            let targetCount = event.data.targetCount;
            let combatSimulator = new CombatSimulator(players, zone, null, { enableHpMpVisualization: false });

            const outer_worker = this;
            try {
                let simResult = await combatSimulator.simulateDungeonByCount(targetCount, (progressData) => {
                    outer_worker.postMessage({
                        type: "simulation_progress",
                        progress: progressData.progress,
                        zone: progressData.zone,
                        difficultyTier: progressData.difficultyTier
                    });
                });
                this.postMessage({ type: "simulation_result", simResult: simResult });
            } catch (e) {
                console.log(e);
                this.postMessage({ type: "simulation_error", error: e.message || e });
            }
            break;
        }
    }
};
