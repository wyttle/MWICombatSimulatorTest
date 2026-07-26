import Buff from "./buff";
import guildShrineDetailMap from "./data/guildShrineDetailMap.json";
import guildBuffDetailMap from "./data/guildBuffDetailMap.json";

const SHRINE_NAMES = ["force", "tempo", "spirit", "rarity", "scholar"];

function getInputLevel(levels, shrineName, shrineHrid, index) {
    if (Array.isArray(levels)) {
        return levels[index];
    }
    if (!levels || typeof levels !== "object") {
        return 0;
    }
    return levels[shrineName] ?? levels[shrineHrid] ?? 0;
}

function normalizeLevel(value, maxLevel) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }
    return Math.min(maxLevel, Math.max(0, Math.trunc(numericValue)));
}

export function normalizeGuildShrineLevels(levels) {
    const normalized = {};

    SHRINE_NAMES.forEach((shrineName, index) => {
        const shrineHrid = `/guild_shrines/${shrineName}`;
        const shrine = guildShrineDetailMap[shrineHrid];
        normalized[shrineHrid] = normalizeLevel(
            getInputLevel(levels, shrineName, shrineHrid, index),
            shrine.maxLevel
        );
    });

    return normalized;
}

export function createGuildShrineBuffs(levels) {
    const normalizedLevels = normalizeGuildShrineLevels(levels);
    const buffs = [];

    for (const guildBuff of Object.values(guildBuffDetailMap)) {
        if (guildBuff.isCombat !== true) {
            continue;
        }

        const level = normalizedLevels[guildBuff.shrineHrid] || 0;
        if (level === 0) {
            continue;
        }

        for (const buffDefinition of guildBuff.buffs) {
            buffs.push(new Buff(buffDefinition, level));
        }
    }

    return buffs;
}
