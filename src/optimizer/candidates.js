import itemDetailMap from "../combatsimulator/data/itemDetailMap.json";
import houseRoomDetailMap from "../combatsimulator/data/houseRoomDetailMap.json";
import enhancementLevelTotalBonusMultiplierTable from "../combatsimulator/data/enhancementLevelTotalBonusMultiplierTable.json";
import { cloneTeamState, getTriggers, setTriggers } from "./teamState.js";
import { isTriggerListValid } from "../triggerEditor.js";

const COMBAT_SKILLS = ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"];
const MAX_ENHANCEMENT = enhancementLevelTotalBonusMultiplierTable.length - 1;
const EQUIPMENT_SLOTS = new Set(Object.values(itemDetailMap)
    .filter((item) => item.equipmentDetail)
    .map((item) => item.equipmentDetail.type));

function copy(value) {
    return value == null ? null : structuredClone(value);
}

function getState(teamState, playerId) {
    const entry = teamState.players.find((player) => String(player.id) === String(playerId));
    if (!entry) throw new Error("队员不存在: " + playerId);
    return entry.state;
}

function locationFor(slot) {
    if (typeof slot !== "string" || !slot.startsWith("/equipment_types/")) throw new Error("装备槽位无效");
    return slot.replace("/equipment_types/", "/item_locations/");
}

function meetsRequirements(state, detail) {
    return (detail.equipmentDetail.levelRequirements || []).every(({ skillHrid, level }) => {
        const skill = skillHrid.replace("/skills/", "");
        let actual;
        if (skill === "total_level") {
            const explicit = state.player.totalLevel;
            // 缺少生活技能数据时只用已知战斗等级之和作为总等级下界，绝不假定达标。
            actual = Number.isFinite(explicit) ? explicit : COMBAT_SKILLS.reduce((sum, name) => {
                const value = Number(state.player[name + "Level"]);
                return sum + (Number.isFinite(value) && value >= 0 ? value : 0);
            }, 0);
        } else {
            actual = Number(state.player[skill + "Level"]);
        }
        return Number.isFinite(actual) && Number.isFinite(level) && actual >= level;
    });
}

function hasHandConflict(equipment) {
    const locations = new Set(equipment.filter((item) => item.itemHrid).map((item) => item.itemLocationHrid));
    return locations.has("/item_locations/two_hand") &&
        (locations.has("/item_locations/main_hand") || locations.has("/item_locations/off_hand"));
}

export function listEquipmentCandidates(state, { slot, playerId }) {
    if (state.players) state = getState(state, playerId);
    const location = locationFor(slot);
    const equipment = state.player.equipment || [];
    return Object.values(itemDetailMap)
        .filter((item) => item.equipmentDetail?.type === slot && meetsRequirements(state, item))
        .filter((item) => !hasHandConflict([
            ...equipment.filter((equipped) => equipped.itemLocationHrid !== location),
            { itemHrid: item.hrid, itemLocationHrid: location },
        ]))
        .sort((a, b) => a.sortIndex - b.sortIndex);
}

export function buildChange(teamState, spec) {
    const { kind, playerId } = spec;
    const state = getState(teamState, playerId);
    if (kind === "equipment") {
        const { slot, itemHrid } = spec;
        const itemLocationHrid = locationFor(slot);
        return {
            kind, playerId, slot,
            before: copy((state.player.equipment || []).find((item) => item.itemLocationHrid === itemLocationHrid)),
            after: itemHrid ? { itemHrid, itemLocationHrid, enhancementLevel: Number(spec.enhancementLevel ?? 0) } : null,
        };
    }
    if (kind === "house") {
        return {
            kind, playerId, roomHrid: spec.roomHrid,
            before: Number(state.houseRooms?.[spec.roomHrid] ?? 0),
            after: Number(spec.level),
        };
    }
    if (kind === "trigger") {
        return {
            kind, playerId, abilityHrid: spec.abilityHrid,
            before: copy(getTriggers(state, spec.abilityHrid)),
            after: copy(spec.triggers),
        };
    }
    throw new Error("未知改动类型: " + kind);
}

function applyOne(state, change) {
    if (change.kind === "equipment") {
        const location = locationFor(change.slot);
        state.player.equipment = (state.player.equipment || []).filter((item) => item.itemLocationHrid !== location);
        if (change.after) state.player.equipment.push(copy(change.after));
    } else if (change.kind === "house") {
        state.houseRooms ||= {};
        state.houseRooms[change.roomHrid] = change.after;
    } else if (change.kind === "trigger") {
        setTriggers(state, change.abilityHrid, copy(change.after));
    }
}

export function validateChanges(teamState, changes) {
    const errors = [];
    const targets = new Set();
    const touched = new Set();
    const result = cloneTeamState(teamState);
    for (const change of changes) {
        try {
            const state = getState(result, change.playerId);
            const target = JSON.stringify([String(change.playerId), change.kind, change.slot ?? change.roomHrid ?? change.abilityHrid]);
            if (targets.has(target)) throw new Error("同一候选重复修改相同目标");
            targets.add(target);
            if (change.kind === "equipment") {
                const location = locationFor(change.slot);
                if (!EQUIPMENT_SLOTS.has(change.slot)) {
                    throw new Error("装备槽位不存在");
                }
                if (change.after) {
                    const item = itemDetailMap[change.after.itemHrid];
                    if (!item || item.equipmentDetail?.type !== change.slot || change.after.itemLocationHrid !== location) {
                        throw new Error("装备与槽位不匹配");
                    }
                    if (!meetsRequirements(state, item)) throw new Error("装备等级需求未满足或总等级未知");
                    if (!Number.isInteger(change.after.enhancementLevel) || change.after.enhancementLevel < 0 || change.after.enhancementLevel > MAX_ENHANCEMENT) {
                        throw new Error("强化等级无效");
                    }
                }
            } else if (change.kind === "house") {
                const room = houseRoomDetailMap[change.roomHrid];
                const before = Number(state.houseRooms?.[change.roomHrid] ?? 0);
                if (!room || !Number.isInteger(before) || before < 0 || !Number.isInteger(change.after) || change.after < before) {
                    throw new Error("房间升级等级无效");
                }
                for (let level = before + 1; level <= change.after; level++) {
                    if (!room.upgradeCostsMap?.[String(level)]) throw new Error("房间等级超出可升级范围");
                }
            } else if (change.kind === "trigger") {
                if (!(state.abilities || []).some((ability) => ability?.abilityHrid === change.abilityHrid)) {
                    throw new Error("队员未配置该技能");
                }
                if (!isTriggerListValid(change.after)) throw new Error("触发条件无效");
            } else {
                throw new Error("未知改动类型");
            }
            applyOne(state, change);
            touched.add(String(change.playerId));
        } catch (error) {
            errors.push(error.message);
        }
    }
    for (const playerId of touched) {
        if (hasHandConflict(getState(result, playerId).player.equipment || [])) {
            errors.push("双手装备不能与主手或副手装备同时使用: " + playerId);
        }
    }
    return { valid: errors.length === 0, errors };
}

export function applyChanges(teamState, changes) {
    const validation = validateChanges(teamState, changes);
    if (!validation.valid) throw new Error(validation.errors.join("；"));
    const result = cloneTeamState(teamState);
    for (const change of changes) applyOne(getState(result, change.playerId), change);
    return result;
}

export function generateUpgradeCandidates(teamState, playerId) {
    const state = getState(teamState, playerId);
    const candidates = [];
    for (const item of state.player.equipment || []) {
        if (!item.itemHrid) continue;
        const slot = item.itemLocationHrid.replace("/item_locations/", "/equipment_types/");
        const change = buildChange(teamState, {
            kind: "equipment", playerId, slot, itemHrid: item.itemHrid,
            enhancementLevel: Number(item.enhancementLevel ?? 0) + 1,
        });
        if (validateChanges(teamState, [change]).valid) candidates.push([change]);
    }
    for (const room of Object.values(houseRoomDetailMap).sort((a, b) => a.sortIndex - b.sortIndex)) {
        if (!room.usableInActionTypeMap?.["/action_types/combat"]) continue;
        const change = buildChange(teamState, {
            kind: "house", playerId, roomHrid: room.hrid,
            level: Number(state.houseRooms?.[room.hrid] ?? 0) + 1,
        });
        if (validateChanges(teamState, [change]).valid) candidates.push([change]);
    }
    return candidates;
}
