const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = __dirname;
const importerPath = path.join(projectRoot, "MWI-Importer-Wyttle.user.js");
const source = fs.readFileSync(importerPath, "utf8");
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

vm.runInContext(source, context, { filename: importerPath });

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
