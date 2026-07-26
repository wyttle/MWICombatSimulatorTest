import Ability from "./ability";
import CombatUnit from "./combatUnit";
import Consumable from "./consumable";
import Equipment from "./equipment";
import HouseRoom from "./houseRoom";
import Achievement from "./achievement";

class Player extends CombatUnit {
    equipment = {
        "/equipment_types/head": null,
        "/equipment_types/body": null,
        "/equipment_types/legs": null,
        "/equipment_types/feet": null,
        "/equipment_types/hands": null,
        "/equipment_types/main_hand": null,
        "/equipment_types/two_hand": null,
        "/equipment_types/off_hand": null,
        "/equipment_types/pouch": null,
        "/equipment_types/back": null,
    };

    constructor() {
        super();

        this.isPlayer = true;
        this.hrid = "player";
    }

    static createFromDTO(dto) {
        let player = new Player();

        player.staminaLevel = dto.staminaLevel;
        player.intelligenceLevel = dto.intelligenceLevel;
        player.attackLevel = dto.attackLevel;
        player.meleeLevel = dto.meleeLevel;
        player.defenseLevel = dto.defenseLevel;
        player.rangedLevel = dto.rangedLevel;
        player.magicLevel = dto.magicLevel;

        player.hrid = dto.hrid;

        for (const [key, value] of Object.entries(dto.equipment)) {
            player.equipment[key] = value ? Equipment.createFromDTO(value) : null;
        }

        player.food = dto.food.map((food) => (food ? Consumable.createFromDTO(food) : null));
        player.drinks = dto.drinks.map((drink) => (drink ? Consumable.createFromDTO(drink) : null));
        player.abilities = dto.abilities.map((ability) => (ability ? Ability.createFromDTO(ability) : null));
        Object.entries(dto.houseRooms).forEach(houseRoom => {
            if (houseRoom[1] > 0) {
                player.houseRooms.push(new HouseRoom(houseRoom[0], houseRoom[1]))
            }
        });

        player.achievements = new Achievement(dto.achievements);

        player.debuffOnLevelGap = dto.debuffOnLevelGap;
        if (Object.hasOwn(dto, "guildShrineLevels")) {
            player.guildShrineLevels = dto.guildShrineLevels;
        }

        return player;
    }

    static _equipStatNames = [
        "stabAccuracy","slashAccuracy","smashAccuracy","rangedAccuracy","magicAccuracy",
        "stabDamage","slashDamage","smashDamage","rangedDamage","magicDamage",
        "defensiveDamage","taskDamage",
        "physicalAmplify","waterAmplify","natureAmplify","fireAmplify","healingAmplify",
        "stabEvasion","slashEvasion","smashEvasion","rangedEvasion","magicEvasion",
        "armor","waterResistance","natureResistance","fireResistance",
        "maxHitpoints","maxManapoints","lifeSteal","hpRegenPer10","mpRegenPer10",
        "physicalThorns","elementalThorns",
        "combatDropRate","combatRareFind","combatDropQuantity","combatExperience",
        "criticalRate","criticalDamage",
        "armorPenetration","waterPenetration","naturePenetration","firePenetration",
        "abilityHaste","tenacity","manaLeech","castSpeed","threat",
        "parry","mayhem","pierce","curse","fury","weaken","ripple","bloom","blaze",
        "attackSpeed","foodHaste","drinkConcentration",
        "autoAttackDamage","abilityDamage",
        "staminaExperience","intelligenceExperience","attackExperience",
        "defenseExperience","meleeExperience","rangedExperience","magicExperience",
        "retaliation"
    ];

    _buildEquipmentCache() {
        const names = Player._equipStatNames;
        const cache = {};
        const equips = [];
        for (const key in this.equipment) {
            if (this.equipment[key] != null) equips.push(this.equipment[key]);
        }
        for (let i = 0; i < names.length; i++) {
            let sum = 0;
            for (let j = 0; j < equips.length; j++) sum += equips[j].getCombatStat(names[i]);
            cache[names[i]] = sum;
        }

        if (this.equipment["/equipment_types/main_hand"]) {
            const w = this.equipment["/equipment_types/main_hand"];
            cache._combatStyleHrid = w.getCombatStyle();
            cache._damageType = w.getDamageType();
            cache._attackInterval = w.getCombatStat("attackInterval");
            cache._primaryTraining = w.getPrimaryTraining();
        } else if (this.equipment["/equipment_types/two_hand"]) {
            const w = this.equipment["/equipment_types/two_hand"];
            cache._combatStyleHrid = w.getCombatStyle();
            cache._damageType = w.getDamageType();
            cache._attackInterval = w.getCombatStat("attackInterval");
            cache._primaryTraining = w.getPrimaryTraining();
        } else {
            cache._combatStyleHrid = "/combat_styles/smash";
            cache._damageType = "/damage_types/physical";
            cache._attackInterval = 3000000000;
            cache._primaryTraining = "/skills/melee";
        }

        cache._focusTraining = this.equipment["/equipment_types/charm"]
            ? this.equipment["/equipment_types/charm"].getFocusTraining() : "";

        if (this.equipment["/equipment_types/pouch"]) {
            cache._foodSlots = 1 + this.equipment["/equipment_types/pouch"].getCombatStat("foodSlots");
            cache._drinkSlots = 1 + this.equipment["/equipment_types/pouch"].getCombatStat("drinkSlots");
        } else {
            cache._foodSlots = 1;
            cache._drinkSlots = 1;
        }

        this._equipCache = cache;
        this._equipCacheDirty = false;
    }

    updateCombatDetails() {
        if (!this._equipCache || this._equipCacheDirty) this._buildEquipmentCache();
        const cache = this._equipCache;
        const stats = this.combatDetails.combatStats;
        const names = Player._equipStatNames;

        stats.combatStyleHrid = cache._combatStyleHrid;
        stats.damageType = cache._damageType;
        stats.attackInterval = cache._attackInterval;
        stats.primaryTraining = cache._primaryTraining;
        stats.focusTraining = cache._focusTraining;

        for (let i = 0; i < names.length; i++) stats[names[i]] = cache[names[i]];

        stats.foodSlots = cache._foodSlots;
        stats.drinkSlots = cache._drinkSlots;

        super.updateCombatDetails();
    }
}

export default Player;
