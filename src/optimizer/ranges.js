import Player from "../combatsimulator/player.js";
import Monster from "../combatsimulator/monster.js";
import { createGuildShrineBuffs } from "../combatsimulator/guildShrine.js";
import actionDetailMap from "../combatsimulator/data/actionDetailMap.json";
import conditionDetailMap from "../combatsimulator/data/combatTriggerConditionDetailMap.json";
import { getTriggers, teamStateToDTOs } from "./teamState.js";

const RESOURCE_BUFFS = new Set([
    "/buff_types/stamina_level", "/buff_types/intelligence_level",
    "/buff_types/max_hitpoints", "/buff_types/max_manapoints",
]);
const NUMERIC_CONDITIONS = new Set([
    "current_hp", "current_mp", "missing_hp", "missing_mp",
    "number_of_active_units", "number_of_dead_units", "lowest_hp_percentage",
]);
const SOURCES = [
    "combatsimulator/trigger.js: getDependencyValue/isActiveMultiTarget/compareValue",
    "combatsimulator/zone.js: getNextWave/getRandomEncounter",
    "combatsimulator/monster.js: updateCombatDetails",
    "combatsimulator/combatUnit.js: updateCombatDetails/generatePermanentBuffs",
    "combatsimulator/combatSimulator.js: processConsumableEvent/processAbilityBuffEffect",
    "combatsimulator/combatUtilities.js: processAttack (non-critical pre-mitigation damage)",
    "worker.js: start_dungeon_by_count/createExtraBuffs",
    "combatsimulator/data/actionDetailMap.json",
];

function finite(value, name) {
    if (!Number.isFinite(value)) throw new Error(`${name} 必须是有限数值`);
    return value;
}

function resourceProfile(unit) {
    unit.updateCombatDetails();
    const baseHp = unit.combatDetails.maxHitpoints;
    const baseMp = unit.combatDetails.maxManapoints;
    const permanent = { ...unit.combatBuffs };
    const envelopes = new Map();
    const buffEvidence = [];
    for (const consumable of [...unit.food, ...unit.drinks].filter(Boolean)) {
        const concentration = consumable.catagoryHrid.includes("drink")
            ? 1 + Math.max(0, unit.combatDetails.combatStats.drinkConcentration) : 1;
        for (const buff of consumable.buffs) {
            if (!RESOURCE_BUFFS.has(buff.typeHrid)) continue;
            const flatBoost = finite(buff.flatBoost * concentration, "消耗品加成");
            const ratioBoost = finite(buff.ratioBoost * concentration, "消耗品加成");
            let envelope = envelopes.get(buff.uniqueHrid);
            if (!envelope) {
                envelope = { ...buff, lowFlat: 0, highFlat: 0, lowRatio: 0, highRatio: 0 };
                envelopes.set(buff.uniqueHrid, envelope);
            }
            if (envelope.typeHrid !== buff.typeHrid) throw new Error("同名资源增益类型不一致");
            envelope.lowFlat = Math.min(envelope.lowFlat, flatBoost);
            envelope.highFlat = Math.max(envelope.highFlat, flatBoost);
            envelope.lowRatio = Math.min(envelope.lowRatio, ratioBoost);
            envelope.highRatio = Math.max(envelope.highRatio, ratioBoost);
            buffEvidence.push({ hrid: consumable.hrid, uniqueHrid: buff.uniqueHrid, flatBoost, ratioBoost });
        }
    }
    // 当前数据没有技能修改资源上限；新数据若引入此类效果，不静默返回错误的物理边界。
    for (const ability of unit.abilities.filter(Boolean)) {
        for (const effect of ability.abilityEffects) {
            if (effect.buffs?.some((buff) => RESOURCE_BUFFS.has(buff.typeHrid))) {
                throw new Error(`暂不支持技能改变资源上限的自动范围: ${ability.hrid}`);
            }
        }
    }
    const endpoints = [];
    for (const high of [false, true]) {
        unit.combatBuffs = { ...permanent };
        for (const [key, buff] of envelopes) {
            unit.combatBuffs[key] = {
                ...buff,
                flatBoost: high ? buff.highFlat : buff.lowFlat,
                ratioBoost: high ? buff.highRatio : buff.lowRatio,
            };
        }
        unit.updateCombatDetails();
        endpoints.push({ hp: unit.combatDetails.maxHitpoints, mp: unit.combatDetails.maxManapoints });
    }
    unit.combatBuffs = permanent;
    unit.updateCombatDetails();
    const profile = {
        hrid: unit.hrid,
        baseHp, baseMp,
        minHp: Math.min(baseHp, ...endpoints.map((point) => point.hp)),
        maxHp: Math.max(baseHp, ...endpoints.map((point) => point.hp)),
        minMp: Math.min(baseMp, ...endpoints.map((point) => point.mp)),
        maxMp: Math.max(baseMp, ...endpoints.map((point) => point.mp)),
        buffs: buffEvidence,
    };
    for (const key of ["minHp", "maxHp", "minMp", "maxMp"]) {
        if (finite(profile[key], key) <= 0) throw new Error("自动范围不支持非正的资源上限");
    }
    return profile;
}

function playerProfiles(teamState, action, guildShrineLevels, extra) {
    const dtos = teamStateToDTOs(structuredClone(teamState));
    const legacyLevels = dtos.some((dto) => Object.hasOwn(dto, "guildShrineLevels")) ? undefined : guildShrineLevels;
    return dtos.map((dto) => {
        const player = Player.createFromDTO(dto);
        player.zoneBuffs = action.buffs ?? [];
        player.guildShrineBuffs = createGuildShrineBuffs(dto.guildShrineLevels ?? legacyLevels);
        // 仅复用本模块公式涉及的印章；其他 Worker 额外增益不改变资源或非暴击伤害。
        player.extraBuffs = [];
        if (extra.personalBuffs?.includes("/items/seal_of_damage")) {
            player.extraBuffs.push({ uniqueHrid: "/buff_uniques/personal_damage", typeHrid: "/buff_types/damage", ratioBoost: 0.08, flatBoost: 0, duration: 0 });
        }
        if (extra.personalBuffs?.includes("/items/seal_of_cast_speed")) {
            player.extraBuffs.push({ uniqueHrid: "/buff_uniques/personal_cast_speed", typeHrid: "/buff_types/cast_speed", ratioBoost: 0, flatBoost: 0.15, duration: 0 });
        }
        player.generatePermanentBuffs();
        player.clearBuffs();
        return { player, profile: resourceProfile(player) };
    });
}

function encounterProfiles(action, difficultyTier) {
    const monsters = new Map();
    const groups = [];
    const monsterFor = (spawn) => {
        const tier = finite(spawn.difficultyTier + difficultyTier, "怪物难度");
        const key = `${spawn.combatMonsterHrid}:${tier}`;
        if (!monsters.has(key)) {
            // 不调用 reset/getNextWave：前者随机初始化冷却，后者随机抽取敌人。
            const monster = new Monster(spawn.combatMonsterHrid, tier);
            const profile = resourceProfile(monster);
            monsters.set(key, { ...profile, difficultyTier: tier });
        }
        return monsters.get(key);
    };
    const fixedGroup = (spawns, label) => {
        const profiles = spawns.map(monsterFor);
        groups.push({
            label, type: "fixed", maxCount: profiles.length,
            maxHp: profiles.reduce((sum, profile) => sum + profile.maxHp, 0),
            maxMp: profiles.reduce((sum, profile) => sum + profile.maxMp, 0),
            breakpointsHp: [profiles.reduce((sum, profile) => sum + profile.baseHp, 0)],
            breakpointsMp: [profiles.reduce((sum, profile) => sum + profile.baseMp, 0)],
            spawns: profiles.map(({ hrid, difficultyTier: tier }) => ({ hrid, difficultyTier: tier })),
        });
    };
    const randomGroup = (pool, label) => {
        if (!Number.isSafeInteger(pool.maxSpawnCount) || pool.maxSpawnCount < 0) {
            throw new Error("不支持的怪物生成数量上限");
        }
        const strengthLimit = finite(pool.maxTotalStrength, "怪物总强度上限");
        const spawns = (pool.spawns ?? []).filter((spawn) => spawn.rate >= 0).map((spawn) => {
            if (finite(spawn.strength, "怪物强度") < 0) throw new Error("不支持负怪物强度");
            return { ...spawn, profile: monsterFor(spawn) };
        });
        // 按数量/总强度动态规划，允许有放回抽取，精确遵守两个生成限制。
        let states = new Map([[0, { maxHp: 0, maxMp: 0, minHp: 0, minMp: 0 }]]);
        const group = { label, type: "random", maxCount: 0, maxHp: 0, maxMp: 0,
            maxSpawnCount: pool.maxSpawnCount, maxTotalStrength: strengthLimit,
            breakpointsHp: [], breakpointsMp: [],
            spawns: spawns.map((spawn) => ({ hrid: spawn.combatMonsterHrid,
                difficultyTier: spawn.profile.difficultyTier, strength: spawn.strength, rate: spawn.rate })),
        };
        for (let count = 1; count <= pool.maxSpawnCount; count++) {
            const next = new Map();
            for (const [strength, state] of states) {
                for (const spawn of spawns) {
                    const total = strength + spawn.strength;
                    if (total > strengthLimit) continue;
                    const candidate = {
                        maxHp: state.maxHp + spawn.profile.maxHp, maxMp: state.maxMp + spawn.profile.maxMp,
                        minHp: state.minHp + spawn.profile.minHp, minMp: state.minMp + spawn.profile.minMp,
                    };
                    const previous = next.get(total);
                    if (previous) {
                        for (const key of ["maxHp", "maxMp"]) previous[key] = Math.max(previous[key], candidate[key]);
                        for (const key of ["minHp", "minMp"]) previous[key] = Math.min(previous[key], candidate[key]);
                    } else next.set(total, candidate);
                }
            }
            if (!next.size) break;
            states = next;
            group.maxCount = count;
            const values = [...states.values()];
            for (const resource of ["Hp", "Mp"]) {
                const maximum = Math.max(...values.map((state) => state[`max${resource}`]));
                const minimum = Math.min(...values.map((state) => state[`min${resource}`]));
                group[`max${resource}`] = Math.max(group[`max${resource}`], maximum);
                group[`breakpoints${resource}`].push(minimum, maximum);
            }
        }
        groups.push(group);
    };
    const info = action.combatZoneInfo;
    if (info.isDungeon) {
        const dungeon = info.dungeonInfo;
        const keys = Object.keys(dungeon.randomSpawnInfoMap).map(Number).sort((a, b) => a - b);
        const used = new Set();
        for (let wave = 1; wave <= dungeon.maxWaves; wave++) {
            const fixed = dungeon.fixedSpawnsMap[String(wave)];
            if (fixed) {
                fixedGroup(fixed, `wave:${wave}`);
                continue;
            }
            // 与 Zone 的闭区间选择一致：位于分界点的波次属于前一池。
            let key = wave > keys[keys.length - 1] ? keys[keys.length - 1] : undefined;
            if (key === undefined) {
                key = keys.find((start, index) => wave >= start && wave <= keys[index + 1]);
            }
            if (key === undefined) throw new Error(`地下城第 ${wave} 波没有有效生成池`);
            if (!used.has(key)) {
                randomGroup(dungeon.randomSpawnInfoMap[key], `pool:${key}`);
                used.add(key);
            }
        }
    } else {
        randomGroup(info.fightInfo.randomSpawnInfo, "ordinary");
        if (info.fightInfo.bossSpawns?.length) fixedGroup(info.fightInfo.bossSpawns, "boss");
    }
    if (!groups.length || !monsters.size) throw new Error("区域没有可推导的敌人生成配置");
    return { monsters: [...monsters.values()], groups };
}

function supportFor(condition, dependency, players, encounters, playerIndex) {
    const enemies = dependency === "all_enemies" || dependency === "targeted_enemy";
    const multiple = dependency === "all_enemies" || dependency === "all_allies";
    const profiles = enemies ? encounters.monsters
        : dependency === "self" ? [players[playerIndex].profile] : players.map(({ profile }) => profile);
    const maxCount = enemies ? Math.max(...encounters.groups.map((group) => group.maxCount)) : profiles.length;
    if (condition === "number_of_active_units" || condition === "number_of_dead_units") {
        return { min: 0, max: maxCount, points: Array.from({ length: maxCount + 1 }, (_, index) => index), aggregation: "count" };
    }
    if (condition === "lowest_hp_percentage") {
        // reduce 初始值为 2：无存活单位返回 200，即使临时增益失效使 HP 超过上限也不会超过 200。
        return { min: 0, max: 200, points: [0, 25, 50, 75, 100, 200], aggregation: "minimum_alive_percentage_or_200" };
    }
    const resource = condition.endsWith("hp") ? "Hp" : "Mp";
    const missing = condition.startsWith("missing");
    const maxima = profiles.map((profile) => profile[`max${resource}`]);
    const minima = profiles.map((profile) => Math.min(0, profile[`min${resource}`] - profile[`max${resource}`]));
    let max = Math.max(...maxima);
    let min = missing ? Math.min(...minima) : 0;
    if (multiple) {
        max = enemies ? Math.max(...encounters.groups.map((group) => group[`max${resource}`]))
            : maxima.reduce((sum, value) => sum + value, 0);
        min = missing ? (enemies ? maxCount * Math.min(...minima) : minima.reduce((sum, value) => sum + value, 0)) : 0;
    }
    // 单怪/单人资源刻度保留小怪与残局尺度，避免九等分被最终首领 HP 支配。
    const points = profiles.flatMap((profile) => [profile[`base${resource}`], profile[`max${resource}`]]
        .flatMap((value) => [value / 4, value / 2, value * 3 / 4, value]));
    if (multiple && enemies) points.push(...encounters.groups.flatMap((group) => group[`breakpoints${resource}`]));
    if (multiple && !enemies) {
        let cumulative = 0;
        for (const value of [...maxima].sort((a, b) => a - b)) points.push(cumulative += value);
    }
    return { min, max, points, aggregation: multiple ? "sum_alive_units" : "single_unit" };
}

function abilityGuidance(player, ability) {
    if (!ability) return null;
    const details = player.combatDetails;
    const stats = details.combatStats;
    const effects = [];
    for (const effect of ability.abilityEffects) {
        if (effect.effectType !== "/ability_effect_types/damage") continue;
        const style = effect.combatStyleHrid?.replace("/combat_styles/", "");
        const damageType = effect.damageType?.replace("/damage_types/", "");
        const styleMax = details[`${style}MaxDamage`];
        const amplify = stats[`${damageType}Amplify`];
        if (!Number.isFinite(styleMax) || !Number.isFinite(amplify)) continue;
        const armorTerm = effect.armorDamageRatio * details.totalArmor;
        const multiplier = (1 + amplify) * (1 + stats.taskDamage) * (1 + stats.abilityDamage);
        const minDirect = Math.max(0, multiplier * (1 + effect.damageFlat + armorTerm));
        const maxDirect = Math.max(minDirect, multiplier * (effect.damageRatio * styleMax + effect.damageFlat + armorTerm));
        const meanDirect = (minDirect + maxDirect) / 2;
        const fullDurationDot = meanDirect * Math.max(0, effect.damageOverTimeRatio);
        if (![minDirect, maxDirect, fullDurationDot].every(Number.isFinite)) continue;
        effects.push({ targetType: effect.targetType, minDirect, maxDirect, meanDirect,
            fullDurationDot, damageOverTimeDuration: effect.damageOverTimeDuration });
    }
    const meanDirect = effects.reduce((sum, effect) => sum + effect.meanDirect, 0);
    const fullDurationDamage = effects.reduce((sum, effect) => sum + effect.meanDirect + effect.fullDurationDot, 0);
    const cooldownSeconds = ability.cooldownDuration / (1 + Math.max(0, stats.abilityHaste) / 100) / 1e9;
    const castSeconds = ability.castDuration / (1 + stats.castSpeed) / 1e9;
    const cycleSeconds = Math.max(cooldownSeconds, castSeconds);
    return { meanDirect, fullDurationDamage, effects, cooldownSeconds, castSeconds,
        idealizedCycleDps: cycleSeconds > 0 ? fullDurationDamage / cycleSeconds : null,
        assumptions: "单目标、非暴击、减伤前、命中且持续伤害完整生效；只含常驻增益，不含临时技能/饮料增益、控制、转火、死亡、抗性和目标伤害承受修正。非实际 DPS、非资源上限。" };
}

function strategicPoints({ min, max, step, current, support, guidance, condition, dependency }) {
    const selected = new Set();
    const align = (point) => {
        const value = Number((min + Math.round((point - min) / step) * step).toPrecision(15));
        return Number.isFinite(value) && value >= min && value <= max ? value : null;
    };
    const add = (point) => {
        const value = align(point);
        if (value !== null && selected.size < 16) selected.add(value);
    };
    // 先保留端点、当前配置及相邻点，再保留技能尺度；剩余名额覆盖对数尺度的最大空隙。
    for (const point of [min, max, current, current - step, current + step, 0, support.min, support.max]) add(point);
    if (condition === "current_hp" && (dependency === "all_enemies" || dependency === "targeted_enemy") && guidance) {
        add(guidance.meanDirect);
        add(guidance.fullDurationDamage);
    }
    const candidates = [...new Set(support.points.map(align).filter((value) => value !== null))];
    const scale = (value) => Math.sign(value) * Math.log1p(Math.abs(value) / step);
    while (selected.size < 16) {
        let best = null;
        let gap = -1;
        for (const candidate of candidates) {
            if (selected.has(candidate)) continue;
            const distance = Math.min(...[...selected].map((point) => Math.abs(scale(candidate) - scale(point))));
            if (distance > gap) {
                best = candidate;
                gap = distance;
            }
        }
        if (best === null) break;
        selected.add(best);
    }
    return [...selected].sort((a, b) => a - b);
}

export function resolveScanVariables({ teamState, variables, zone, extra = {}, guildShrineLevels }) {
    if (!Array.isArray(variables)) throw new Error("阈值变量必须是数组");
    if (!variables.length) return [];
    const action = actionDetailMap[zone?.zoneHrid];
    if (!action?.combatZoneInfo) throw new Error("自动范围需要有效战斗区域");
    const difficultyTier = finite(zone.difficultyTier, "区域难度");
    const players = playerProfiles(teamState, action, guildShrineLevels, extra);
    const encounters = encounterProfiles(action, difficultyTier);
    return variables.map((variable) => {
        const playerIndex = teamState.players.findIndex(({ id }) => String(id) === String(variable.playerId));
        if (playerIndex < 0) throw new Error(`队员不存在: ${variable.playerId}`);
        const trigger = getTriggers(teamState.players[playerIndex].state, variable.abilityHrid)[variable.triggerIndex];
        if (!trigger) throw new Error("阈值条件不存在");
        const dependency = trigger.dependencyHrid?.replace("/combat_trigger_dependencies/", "");
        const condition = trigger.conditionHrid?.replace("/combat_trigger_conditions/", "");
        const multiple = dependency === "all_allies" || dependency === "all_enemies";
        const definition = conditionDetailMap[trigger.conditionHrid];
        if (!["self", "targeted_enemy", "all_allies", "all_enemies"].includes(dependency)
            || !NUMERIC_CONDITIONS.has(condition)
            || !definition?.[multiple ? "isMultiTarget" : "isSingleTarget"]
            || !definition.allowedComparatorHrids.includes(trigger.comparatorHrid)) {
            throw new Error(`不支持的数值阈值条件: ${trigger.dependencyHrid} / ${trigger.conditionHrid} / ${trigger.comparatorHrid}`);
        }
        const step = finite(variable.step, "阈值步长");
        if (step <= 0) throw new Error("阈值步长必须大于零");
        const current = finite(Number(trigger.value), "当前阈值");
        const automaticMin = variable.min == null || variable.min === "";
        const automaticMax = variable.max == null || variable.max === "";
        const support = supportFor(condition, dependency, players, encounters, playerIndex);
        let min = automaticMin ? Math.floor(Math.min(support.min - step, current) / step) * step : finite(variable.min, "阈值下界");
        if (automaticMin && !automaticMax) min = Math.min(min, Math.floor(finite(variable.max, "阈值上界") / step) * step);
        const max = automaticMax ? min + Math.ceil((Math.max(support.max + step, current, min) - min) / step) * step
            : finite(variable.max, "阈值上界");
        if (!Number.isFinite(min) || !Number.isFinite(max) || min > max || !Number.isSafeInteger(Math.ceil((max - min) / step))) {
            throw new Error("阈值范围无法表示为有限步长网格");
        }
        const player = players[playerIndex].player;
        const ability = player.abilities.find((entry) => entry?.hrid === variable.abilityHrid);
        const guidance = abilityGuidance(player, ability);
        if ((condition === "current_mp" || condition === "missing_mp") && (dependency === "self" || dependency === "all_allies")) {
            const relevantPlayers = dependency === "self" ? [players[playerIndex]] : players;
            for (const { player, profile } of relevantPlayers) {
                for (const entry of player.abilities.filter(Boolean)) {
                    support.points.push(condition === "current_mp" ? entry.manaCost : profile.baseMp - entry.manaCost);
                }
            }
        }
        return {
            ...variable, min, max, step,
            suggestedPoints: strategicPoints({ min, max, step, current, support, guidance, condition, dependency }),
            rangeInfo: {
                automaticMin, automaticMax, supportMin: support.min, supportMax: support.max,
                gridOrigin: min, currentThreshold: current,
                dependencyHrid: trigger.dependencyHrid, conditionHrid: trigger.conditionHrid,
                comparatorHrid: trigger.comparatorHrid, aggregation: support.aggregation,
                abilityGuidance: guidance,
                sources: SOURCES,
                players: players.map(({ profile }) => profile), monsters: encounters.monsters,
                spawnGroups: encounters.groups,
                ability: ability ? { hrid: ability.hrid, level: ability.level, manaCost: ability.manaCost,
                    cooldownDuration: ability.cooldownDuration, castDuration: ability.castDuration,
                    damageOverTimeDurations: ability.abilityEffects.map((effect) => effect.damageOverTimeDuration).filter((value) => value > 0),
                    buffDurations: ability.abilityEffects.flatMap((effect) => effect.buffs ?? []).map((buff) => buff.duration),
                } : null,
                extraResourceBuffs: false,
                extraOptions: { mooPass: Boolean(extra.mooPass), personalBuffs: [...(extra.personalBuffs ?? [])] },
                limitations: [
                    "范围是引擎资源与生成规则的保守包络，不是最优阈值或收敛证明。",
                    "多目标资源只对存活单位求和；最低 HP 百分比在无存活单位时为 200。",
                    "消耗品同名增益取分量包络，允许不会同时出现的最大值；到期后不夹紧当前资源，缺失量可为负。",
                    ">= 与 <= 均含等号；自动边界跨出物理支持集一个步长。无目标时敌人条件仍为假，其他触发条件仍可阻止施放。",
                    "显式边界不会扩张；候选以 min 为网格原点，非网格当前阈值仅提供相邻候选。",
                    "技能伤害公式仅给出非暴击、减伤前的探索尺度；理想循环 DPS 假定命中和完整持续，不是实际收益，更不限定 HP 支持集。",
                    "最多 16 个候选优先保留边界、当前邻点和技能伤害尺度，其余按资源对数尺度选点；小怪四分位与组资源边界均为启发式，不是最优性证明。",
                    "额外印章不改变资源上限；技能估算复用了 Worker 的伤害与施放速度印章。",
                ],
            },
        };
    });
}
