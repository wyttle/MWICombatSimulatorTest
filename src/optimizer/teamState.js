import Player from "../combatsimulator/player.js";
import Ability from "../combatsimulator/ability.js";
import Consumable from "../combatsimulator/consumable.js";
import abilitySlotsLevelRequirementList from "../combatsimulator/data/abilitySlotsLevelRequirementList.json";
import { defaultTriggersFor } from "../triggerEditor.js";

const COMBAT_ACTION = "/action_types/combat";
const LEVEL_FIELDS = ["staminaLevel", "intelligenceLevel", "attackLevel", "meleeLevel", "defenseLevel", "rangedLevel", "magicLevel"];

export function parseTeamStates(playerDataMap, ids) {
    return { players: ids.map((id) => ({ id: String(id), state: JSON.parse(playerDataMap[id]) })) };
}

export function cloneTeamState(teamState) {
    return structuredClone(teamState);
}

export function teamStateToPlayerDataMap(teamState) {
    return Object.fromEntries(teamState.players.map(({ id, state }) => [id, JSON.stringify(state)]));
}

export function listAbilitySlots(state) {
    return (state.abilities ?? []).flatMap((ability, slotIndex) => ability?.abilityHrid
        ? [{ slotIndex, abilityHrid: ability.abilityHrid, level: Number(ability.level) }]
        : []);
}

export function getTriggers(state, abilityHrid) {
    return state.triggerMap?.[abilityHrid] ?? defaultTriggersFor(abilityHrid);
}

export function setTriggers(state, abilityHrid, triggers) {
    state.triggerMap ??= {};
    // 原始数据按 HRID 保存，同一队员重复装备该技能的所有槽位共享这些条件。
    state.triggerMap[abilityHrid] = structuredClone(triggers);
}

export function teamStateToDTOs(teamState) {
    const players = teamState.players.map(({ id, state }) => {
        const equipment = Object.fromEntries(state.player.equipment.map((item) => [
            item.itemLocationHrid.replace("/item_locations/", "/equipment_types/"),
            { hrid: item.itemHrid, enhancementLevel: Number(item.enhancementLevel) },
        ]));
        const levels = Object.fromEntries(LEVEL_FIELDS.map((field) => [field, Number(state.player[field])]));
        const player = Player.createFromDTO({
            ...levels,
            hrid: "player" + id,
            equipment,
            food: [],
            drinks: [],
            abilities: [],
            houseRooms: state.houseRooms ?? {},
            achievements: state.achievements ?? {},
            guildShrineLevels: state.guildShrineLevels ?? {},
            debuffOnLevelGap: 0,
        });
        player.updateCombatDetails();

        // 保留空槽的位置，不把被装备槽位数量限制的消耗品向前挪动。
        player.food = Array.from({ length: 3 }, (_, index) => {
            const hrid = state.food?.[COMBAT_ACTION]?.[index]?.itemHrid;
            return hrid && index < player.combatDetails.combatStats.foodSlots
                ? new Consumable(hrid, getTriggers(state, hrid)) : null;
        });
        player.drinks = Array.from({ length: 3 }, (_, index) => {
            const hrid = state.drinks?.[COMBAT_ACTION]?.[index]?.itemHrid;
            return hrid && index < player.combatDetails.combatStats.drinkSlots
                ? new Consumable(hrid, getTriggers(state, hrid)) : null;
        });
        player.abilities = Array.from({ length: 5 }, (_, index) => {
            const ability = state.abilities?.[index];
            return ability?.abilityHrid && player.intelligenceLevel >= abilitySlotsLevelRequirementList[index + 1]
                ? new Ability(ability.abilityHrid, Number(ability.level), getTriggers(state, ability.abilityHrid)) : null;
        });
        player.combatLevel = 0.1 * (player.staminaLevel + player.intelligenceLevel + player.attackLevel
            + player.defenseLevel + Math.max(player.meleeLevel, player.rangedLevel, player.magicLevel))
            + 0.5 * Math.max(player.attackLevel, player.defenseLevel, player.meleeLevel, player.rangedLevel, player.magicLevel);

        // Worker 会再次调用 createFromDTO，房间和成就必须仍是原始配置映射。
        player.houseRooms = state.houseRooms ?? {};
        player.achievements = state.achievements ?? {};
        return structuredClone(player);
    });

    const maxCombatLevel = players.reduce((maximum, player) => Math.max(maximum, player.combatLevel), 1);
    for (const player of players) {
        const ratio = maxCombatLevel / player.combatLevel;
        player.debuffOnLevelGap = ratio > 1.2 ? -Math.min(0.9, 3 * (ratio - 1.2)) : 0;
    }
    return players;
}
