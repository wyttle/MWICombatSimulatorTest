const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = __dirname;
const importerPath = path.join(projectRoot, "MWI-Importer-Wyttle.user.js");
const source = fs.readFileSync(importerPath, "utf8");
const testableSource = source.replace(
    /\}\)\(\);\s*$/,
    "globalThis.__mwiImporterTest = { getGuildShrineLevelsFromCombatBuffMap, getGuildShrineLevelsFromSource, constructImportJsonObj_team }; })();"
);
const storage = new Map();

class FakeWebSocket {
    constructor(url) {
        this.url = url;
    }
}

class FakeMessageEvent {
    constructor(data, currentTarget) {
        this._data = data;
        this.currentTarget = currentTarget;
    }

    get data() {
        return this._data;
    }
}

const context = vm.createContext({
    console,
    document: { URL: "https://www.milkywayidle.com/game" },
    navigator: { language: "en-US" },
    localStorage: { getItem: () => null, setItem: () => {} },
    MessageEvent: FakeMessageEvent,
    WebSocket: FakeWebSocket,
    LZString: { decompressFromUTF16: () => null },
    GM_getValue: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
    GM_setValue: (key, value) => storage.set(key, value),
    GM_listValues: () => [...storage.keys()],
    GM_deleteValue: (key) => storage.delete(key),
});

vm.runInContext(testableSource, context, { filename: importerPath });

const socket = new FakeWebSocket("wss://api.milkywayidle.com/ws");
const send = (payload) => new FakeMessageEvent(JSON.stringify(payload), socket).data;
const levels = () => storage.get("wyttleGuildShrineLevels");

send({
    type: "guild_updated",
    guildShrineMap: {
        "/guild_shrines/force": { level: 7 },
        tempo_shrine: { guildBuildingHrid: "tempo_shrine", buildingLevel: 3 },
    },
});
assert.deepStrictEqual(
    { ...levels() },
    { force: 7, tempo: 3, spirit: 0, rarity: 0, scholar: 0 },
    "Guild shrine/building maps should be normalized"
);

send({
    type: "guild_buff_updated",
    characterGuildBuffMap: {
        "/guild_buffs/spirit_combat": { currentLevel: 9 },
        "/guild_buffs/scholar_skilling": 4,
    },
});
assert.deepStrictEqual(
    { ...levels() },
    { force: 7, tempo: 3, spirit: 9, rarity: 0, scholar: 4 },
    "Guild buff maps should merge with the cached shrine levels"
);

send({
    type: "guild_updated",
    nested: {
        guildBuildingLevels: [
            { guildBuildingHrid: "/guild_shrines/rarity", level: 99 },
            { shrineHrid: "/guild_shrines/tempo", level: -4 },
        ],
    },
});
assert.deepStrictEqual(
    { ...levels() },
    { force: 7, tempo: 0, spirit: 9, rarity: 20, scholar: 4 },
    "Levels should be clamped to the simulator's 0-20 range"
);

send({ type: "unrelated", profile: { name: "force", level: 18 } });
assert.deepStrictEqual(
    { ...levels() },
    { force: 7, tempo: 0, spirit: 9, rarity: 20, scholar: 4 },
    "Unrelated level records must not be treated as guild shrines"
);

const battlePayload = {
    type: "new_battle",
    players: [
        {
            name: "Player One",
            character: { id: 101, name: "Player One" },
            combatBuffMap: {
                "/buff_uniques/damage_guild_buff": { ratioBoost: 0.018000000000000002 },
                "/buff_uniques/attack_speed_guild_buff": { ratioBoost: 0.008 },
                "/buff_uniques/cast_speed_guild_buff": { flatBoost: 0.008 },
                "/buff_uniques/max_hitpoints_guild_buff": { ratioBoost: 0.03 },
                "/buff_uniques/max_manapoints_guild_buff": { ratioBoost: 0.03 },
                "/buff_uniques/rare_find_guild_buff": { flatBoost: 0.04 },
                "/buff_uniques/wisdom_guild_buff": { flatBoost: 0.025 },
            },
        },
        {
            name: "Player Two",
            character: { id: 202, name: "Player Two" },
            combatBuffMap: {
                "/buff_uniques/damage_guild_buff": { ratioBoost: 0.003 },
            },
        },
    ],
};
send(battlePayload);
const storedBattle = JSON.parse(storage.get("team_battle_Player One"));
assert.strictEqual(storedBattle.players[0].character.id, 101, "Battle players should retain character IDs");
const inferLevels = context.__mwiImporterTest.getGuildShrineLevelsFromCombatBuffMap;
assert.deepStrictEqual(
    { ...inferLevels(battlePayload.players[0].combatBuffMap) },
    { force: 6, tempo: 2, spirit: 3, rarity: 4, scholar: 5 },
    "All five Guild Shrine levels should be inferred from their battle buffs"
);
assert.deepStrictEqual(
    { ...inferLevels(battlePayload.players[1].combatBuffMap) },
    { force: 1, tempo: 0, spirit: 0, rarity: 0, scholar: 0 },
    "Missing Guild Buffs should remain zero for that player instead of inheriting another player's levels"
);
assert.strictEqual(inferLevels(null), null, "Missing combatBuffMap should not fabricate Guild Shrine data");
assert.deepStrictEqual(
    { ...inferLevels({}) },
    { force: 0, tempo: 0, spirit: 0, rarity: 0, scholar: 0 },
    "An explicit empty combatBuffMap should mean that the player has no active Guild Shrine buffs"
);

const selfProfile = {
    character: { id: 101, name: "Player One" },
    characterSkills: [],
    characterItems: [],
    actionTypeFoodSlotsMap: { "/action_types/combat": [] },
    actionTypeDrinkSlotsMap: { "/action_types/combat": [] },
    combatUnit: { combatAbilities: [] },
    abilityCombatTriggersMap: {},
    consumableCombatTriggersMap: {},
    characterHouseRoomMap: {},
    characterAchievements: [],
    characterActions: [{ actionHrid: "/actions/combat/planet_of_the_eyes" }],
};
const teammateProfile = {
    profile: {
        sharableCharacter: { id: 202, name: "Player Two" },
        characterSkills: [],
        wearableItemMap: {},
        combatConsumables: [],
        equippedAbilities: [],
        abilityCombatTriggersMap: {},
        consumableCombatTriggersMap: {},
        characterHouseRoomMap: {},
        characterAchievements: [],
    },
};
storage.set("profile_Player One", JSON.stringify(selfProfile));
storage.set("init_character_data", JSON.stringify(selfProfile));
storage.set("profile_character_202", JSON.stringify(teammateProfile));
storage.set("Player Two", JSON.stringify({ profile: { sharableCharacter: { id: 999, name: "Player Two" } } }));
const importedParty = context.__mwiImporterTest.constructImportJsonObj_team(battlePayload, "Player One");
assert.deepStrictEqual(
    { ...importedParty.players[0].guildShrineLevels },
    { force: 6, tempo: 2, spirit: 3, rarity: 4, scholar: 5 },
    "The local player should use their own battle Guild Shrine buffs instead of stale cached levels"
);
assert.deepStrictEqual(
    { ...importedParty.players[1].guildShrineLevels },
    { force: 1, tempo: 0, spirit: 0, rarity: 0, scholar: 0 },
    "A teammate should use only their own battle Guild Shrine buffs"
);
assert.strictEqual(
    importedParty.players[1].player.equipment.length,
    0,
    "The teammate profile should be selected by character ID before the legacy name key"
);
assert.match(
    source,
    /getGuildShrineLevelsFromCombatBuffMap\(source\.combatBuffMap\)/,
    "Battle player Guild Shrine levels should be inferred from combatBuffMap"
);
assert.match(source, /"profile_character_" \+ obj\.profile\.sharableCharacter\.id/);
assert.match(source, /"profile_character_" \+ characterID/);
assert.match(source, /obj\.players\[player_num\]\.character\.id==init_character_obj\.character\.id/);
assert.match(source, /constructSelfPlayerExportObjFromInitCharacterData\(obj\.players\[player_num\]\)/);
assert.match(source, /damage_guild_buff[\s\S]*?perLevel: 0\.003/);
assert.match(source, /attack_speed_guild_buff[\s\S]*?perLevel: 0\.004/);
assert.match(source, /max_hitpoints_guild_buff[\s\S]*?perLevel: 0\.01/);
assert.match(source, /rare_find_guild_buff[\s\S]*?perLevel: 0\.01/);
assert.match(source, /wisdom_guild_buff[\s\S]*?perLevel: 0\.005/);

assert.match(source, /@match\s+https:\/\/wyttle\.github\.io\/MWICombatSimulatorTest\/\*/);
assert.match(source, /playerObj\.guildShrineLevels = getGuildShrineLevels\(\)/);
assert.doesNotMatch(
    source,
    /function constructPlayerExportObjFromProfile\(profile\)[\s\S]*?playerObj\.guildShrineLevels = getGuildShrineLevels\(\)/,
    "A teammate profile must not inherit the local character's Guild Shrine levels"
);
assert.match(
    source,
    /getGuildShrineLevelsFromSource\(profile\)/,
    "A teammate should only receive Guild Shrine levels extracted from their own data"
);
assert.doesNotMatch(
    source,
    /exportObj\.guildShrineLevels = getGuildShrineLevels\(\)/,
    "A party envelope must not make teammates inherit the local character's Guild Shrine levels"
);
assert.match(source, /equipmentSet\.guildShrineLevels = loadoutData\.guildShrineLevels \|\| getGuildShrineLevels\(\)/);

console.log("MWI Importer validation passed.");
