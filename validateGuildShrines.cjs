const assert = require("assert");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const shrineMap = require(path.join(projectRoot, "src", "combatsimulator", "data", "guildShrineDetailMap.json"));
const buffMap = require(path.join(projectRoot, "src", "combatsimulator", "data", "guildBuffDetailMap.json"));
const mainSource = fs.readFileSync(path.join(projectRoot, "src", "main.js"), "utf8");

async function loadGuildShrineModule() {
    const modulePath = path.join(projectRoot, "src", "combatsimulator", "guildShrine.js");
    let source = fs.readFileSync(modulePath, "utf8");
    source = source
        .replace(
            'import Buff from "./buff";',
            "class Buff { constructor(buff, level = 1) { this.uniqueHrid = buff.uniqueHrid; this.typeHrid = buff.typeHrid; this.ratioBoost = buff.ratioBoost + (level - 1) * buff.ratioBoostLevelBonus; this.flatBoost = buff.flatBoost + (level - 1) * buff.flatBoostLevelBonus; this.duration = buff.duration; } }"
        )
        .replace(
            'import guildShrineDetailMap from "./data/guildShrineDetailMap.json";',
            `const guildShrineDetailMap = ${JSON.stringify(shrineMap)};`
        )
        .replace(
            'import guildBuffDetailMap from "./data/guildBuffDetailMap.json";',
            `const guildBuffDetailMap = ${JSON.stringify(buffMap)};`
        );

    return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

async function loadCombatUnit() {
    const modulePath = path.join(projectRoot, "src", "combatsimulator", "combatUnit.js");
    const source = fs.readFileSync(modulePath, "utf8");
    return (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).default;
}

assert.deepStrictEqual(
    Object.keys(shrineMap).sort(),
    ["force", "tempo", "spirit", "rarity", "scholar"].map((name) => `/guild_shrines/${name}`).sort()
);

for (const shrine of Object.values(shrineMap)) {
    assert.strictEqual(shrine.maxLevel, 20);
}

const combatBuffs = Object.values(buffMap).filter((detail) => detail.isCombat === true);
assert.strictEqual(combatBuffs.length, 5);
assert.match(
    mainSource,
    new RegExp('type:\\s*"start_simulation_all_zones"[\\s\\S]{0,700}new Worker\\(new URL\\("multiWorker\\.js"[\\s\\S]{0,200}onmessage = onMultiWorkerMessage')
);
assert.doesNotMatch(mainSource, /mainWorkerOnMessage/);
assert.doesNotMatch(
    mainSource,
    /if \(zoneHrid === "all"\)[\s\S]{0,300}simAllZonesToggle/
);
assert.match(
    mainSource,
    /Object\.values\(groupImport\)[\s\S]{0,500}guildShrineLevels/
);

const spirit = combatBuffs.find((detail) => detail.shrineHrid === "/guild_shrines/spirit");
assert(spirit);
assert.deepStrictEqual(
    spirit.buffs.map((buff) => buff.typeHrid).sort(),
    ["/buff_types/max_hitpoints", "/buff_types/max_manapoints"].sort()
);

for (const buff of spirit.buffs) {
    const level20Ratio = buff.ratioBoost + 19 * buff.ratioBoostLevelBonus;
    assert.strictEqual(level20Ratio, 0.2);
}

(async () => {
    const { createGuildShrineBuffs, normalizeGuildShrineLevels } = await loadGuildShrineModule();
    const normalized = normalizeGuildShrineLevels([20.9, -2, "7", 99, "invalid"]);
    assert.deepStrictEqual(normalized, {
        "/guild_shrines/force": 20,
        "/guild_shrines/tempo": 0,
        "/guild_shrines/spirit": 7,
        "/guild_shrines/rarity": 20,
        "/guild_shrines/scholar": 0
    });

    const shrineBuffs = createGuildShrineBuffs({ force: 20, tempo: 20, spirit: 20, rarity: 20, scholar: 20 });
    assert.strictEqual(shrineBuffs.length, 7);
    assert(!shrineBuffs.some((buff) => ["/buff_types/efficiency", "/buff_types/action_speed"].includes(buff.typeHrid)));

    const CombatUnit = await loadCombatUnit();
    const unit = new CombatUnit();
    unit.guildShrineBuffs = shrineBuffs.filter((buff) => buff.typeHrid.startsWith("/buff_types/max_"));
    unit.generatePermanentBuffs();
    unit.clearBuffs();
    assert.strictEqual(unit.combatDetails.maxHitpoints, 132);
    assert.strictEqual(unit.combatDetails.maxManapoints, 132);

    unit.updateCombatDetails();
    assert.strictEqual(unit.combatDetails.maxHitpoints, 132);
    assert.strictEqual(unit.combatDetails.maxManapoints, 132);

    console.log("Guild shrine validation passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
