class CombatUnit {
    isPlayer;
    isStunned = false;
    stunExpireTime = null;
    isBlinded = false;
    blindExpireTime = null;
    isSilenced = false;
    silenceExpireTime = null;

    isOutOfMana = false;

    // Base levels which don't change after initialization
    staminaLevel = 1;
    intelligenceLevel = 1;
    attackLevel = 1;
    meleeLevel = 1;
    defenseLevel = 1;
    rangedLevel = 1;
    magicLevel = 1;

    experience = 0;
    experienceRate = 0;
    enrageTime = 0;

    abilities = [null, null, null, null];
    food = [null, null, null];
    drinks = [null, null, null];
    houseRooms = [];
    achievements = null;
    dropTable = [];
    rareDropTable = [];
    abilityManaCosts = new Map();

    // Calculated combat stats including temporary buffs
    combatDetails = {
        staminaLevel: 1,
        intelligenceLevel: 1,
        attackLevel: 1,
        meleeLevel: 1,
        defenseLevel: 1,
        rangedLevel: 1,
        magicLevel: 1,
        maxHitpoints: 110,
        currentHitpoints: 110,
        maxManapoints: 110,
        currentManapoints: 110,
        stabAccuracyRating: 11,
        slashAccuracyRating: 11,
        smashAccuracyRating: 11,
        rangedAccuracyRating: 11,
        magicAccuracyRating: 11,
        stabMaxDamage: 11,
        slashMaxDamage: 11,
        smashMaxDamage: 11,
        rangedMaxDamage: 11,
        magicMaxDamage: 11,
        stabEvasionRating: 11,
        slashEvasionRating: 11,
        smashEvasionRating: 11,
        rangedEvasionRating: 11,
        magicEvasionRating: 11,
        defensiveMaxDamage: 0,
        totalArmor: 0.2,
        totalWaterResistance: 0.4,
        totalNatureResistance: 0.4,
        totalFireResistance: 0.4,
        abilityHaste: 0,
        tenacity: 0,
        totalThreat: 100,
        combatStats: {
            combatStyleHrid: "/combat_styles/smash",
            damageType: "/damage_types/physical",
            attackInterval: 3000000000,
            autoAttackDamage: 0,
            abilityDamage: 0,
            criticalRate: 0,
            criticalDamage: 0,
            stabAccuracy: 0,
            slashAccuracy: 0,
            smashAccuracy: 0,
            rangedAccuracy: 0,
            magicAccuracy: 0,
            stabDamage: 0,
            slashDamage: 0,
            smashDamage: 0,
            rangedDamage: 0,
            magicDamage: 0,
            defensiveDamage: 0,
            taskDamage: 0,
            physicalAmplify: 0,
            waterAmplify: 0,
            natureAmplify: 0,
            fireAmplify: 0,
            healingAmplify: 0,
            physicalThorns: 0,
            elementalThorns: 0,
            maxHitpoints: 0,
            maxManapoints: 0,
            stabEvasion: 0,
            slashEvasion: 0,
            smashEvasion: 0,
            rangedEvasion: 0,
            magicEvasion: 0,
            armor: 0,
            waterResistance: 0,
            natureResistance: 0,
            fireResistance: 0,
            lifeSteal: 0,
            hpRegenPer10: 0.01,
            mpRegenPer10: 0.01,
            combatDropRate: 0,
            combatDropQuantity: 0,
            combatRareFind: 0,
            combatExperience: 0,
            foodSlots: 1,
            drinkSlots: 1,
            armorPenetration: 0,
            waterPenetration: 0,
            naturePenetration: 0,
            firePenetration: 0,
            manaLeech: 0,
            castSpeed: 0,
            threat: 100,
            parry: 0,
            mayhem: 0,
            pierce: 0,
            curse: 0,
            ripple: 0,
            bloom: 0,
            blaze: 0,
            weaken: 0,
            fury: 0,
            foodHaste: 0,
            drinkConcentration: 0,
            damageTaken: 0,
            attackSpeed: 0,
            armorDamageRatio: 0,
            hpDrainRatio: 0,
            primaryTraining: "",
            focusTraining: "",
            staminaExperience: 0,
            intelligenceExperience: 0,
            attackExperience: 0,
            defenseExperience: 0,
            meleeExperience: 0,
            rangedExperience: 0,
            magicExperience: 0,
            retaliation: 0,
            maxHitpointsRatio: 0,
            maxManapointsRatio: 0,
        },
    };
    combatBuffs = {};
    permanentBuffs = {};
    zoneBuffs = {};
    extraBuffs = {};

    constructor() { }

    // Cache for buff boosts to avoid repeated calculations
    _buffBoostCache = new Map();
    _buffBoostsCacheValid = false;

    _invalidateBuffCache() {
        this._buffBoostsCacheValid = false;
        this._buffBoostCache.clear();
    }

    updateCombatDetails() {
        // 一次性预计算所有 buff 聚合值，避免重复遍历
        const buffAggregates = this._precomputeBuffAggregates();

        if (this.isPlayer) {
            if (this.combatDetails.combatStats.hpRegenPer10 === 0) {
                this.combatDetails.combatStats.hpRegenPer10 = 0.01;
            } else {
                this.combatDetails.combatStats.hpRegenPer10 = 0.01 + this.combatDetails.combatStats.hpRegenPer10;
            }
            if (this.combatDetails.combatStats.mpRegenPer10 === 0) {
                this.combatDetails.combatStats.mpRegenPer10 = 0.01;
            } else {
                this.combatDetails.combatStats.mpRegenPer10 = 0.01 + this.combatDetails.combatStats.mpRegenPer10;
            }
        }

        // 使用预计算的 buff 聚合值
        const statTypes = ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"];
        for (let i = 0; i < statTypes.length; i++) {
            const stat = statTypes[i];
            this.combatDetails[stat + "Level"] = this[stat + "Level"];
            const boost = buffAggregates["/buff_types/" + stat + "_level"];
            if (boost) {
                this.combatDetails[stat + "Level"] += (this[stat + "Level"] * boost.ratioBoost);
                this.combatDetails[stat + "Level"] += boost.flatBoost;
            }
        }

        this.combatDetails.maxHitpoints = Math.floor(
            (10 * (10 + this.combatDetails.staminaLevel) + this.combatDetails.combatStats.maxHitpoints)
            * (1 + this.combatDetails.combatStats.maxHitpointsRatio)
        );
        this.combatDetails.maxManapoints = Math.floor(
            (10 * (10 + this.combatDetails.intelligenceLevel) + this.combatDetails.combatStats.maxManapoints)
            * (1 + this.combatDetails.combatStats.maxManapointsRatio)
        );

        const accuracyRatioBoostFromFury = buffAggregates["/buff_types/fury_accuracy"]?.ratioBoost || 0;
        const damageRatioBoostFromFury = buffAggregates["/buff_types/fury_damage"]?.ratioBoost || 0;
        const accuracyRatioBoost = buffAggregates["/buff_types/accuracy"]?.ratioBoost || 0;
        const damageRatioBoost = buffAggregates["/buff_types/damage"]?.ratioBoost || 0;
        const evasionBoost = buffAggregates["/buff_types/evasion"] || { flatBoost: 0, ratioBoost: 0 };

        const meleeStyles = ["stab", "slash", "smash"];
        for (let i = 0; i < meleeStyles.length; i++) {
            const style = meleeStyles[i];
            this.combatDetails[style + "AccuracyRating"] =
                (10 + this.combatDetails.attackLevel) *
                (1 + this.combatDetails.combatStats[style + "Accuracy"]) *
                (1 + accuracyRatioBoost) *
                (1 + accuracyRatioBoostFromFury);
            this.combatDetails[style + "MaxDamage"] =
                (10 + this.combatDetails.meleeLevel) *
                (1 + this.combatDetails.combatStats[style + "Damage"]) *
                (1 + damageRatioBoost) *
                (1 + damageRatioBoostFromFury);
            const baseEvasion = (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats[style + "Evasion"]);
            this.combatDetails[style + "EvasionRating"] = baseEvasion + evasionBoost.flatBoost + baseEvasion * evasionBoost.ratioBoost;
        }

        this.combatDetails.defensiveMaxDamage =
            (10 + this.combatDetails.defenseLevel) *
            (1 + this.combatDetails.combatStats.defensiveDamage) *
            (1 + damageRatioBoost) *
            (1 + damageRatioBoostFromFury);

        // when equiped bulwark
        if (this.equipment?.['/equipment_types/two_hand']?.hrid.includes("bulwark")) {
            this.combatDetails.smashMaxDamage += this.combatDetails.defensiveMaxDamage;
        }

        this.combatDetails.rangedAccuracyRating =
            (10 + this.combatDetails.attackLevel) *
            (1 + this.combatDetails.combatStats.rangedAccuracy) *
            (1 + accuracyRatioBoost) *
            (1 + accuracyRatioBoostFromFury);
        this.combatDetails.rangedMaxDamage =
            (10 + this.combatDetails.rangedLevel) *
            (1 + this.combatDetails.combatStats.rangedDamage) *
            (1 + damageRatioBoost) *
            (1 + damageRatioBoostFromFury);

        const baseRangedEvasion = (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats.rangedEvasion);
        this.combatDetails.rangedEvasionRating = baseRangedEvasion + evasionBoost.flatBoost + baseRangedEvasion * evasionBoost.ratioBoost;

        this.combatDetails.combatStats.damageTaken = buffAggregates["/buff_types/damage_taken"]?.flatBoost || 0;

        this.combatDetails.magicAccuracyRating =
            (10 + this.combatDetails.attackLevel) *
            (1 + this.combatDetails.combatStats.magicAccuracy) *
            (1 + accuracyRatioBoost) *
            (1 + accuracyRatioBoostFromFury);
        this.combatDetails.magicMaxDamage =
            (10 + this.combatDetails.magicLevel) *
            (1 + this.combatDetails.combatStats.magicDamage) *
            (1 + damageRatioBoost) *
            (1 + damageRatioBoostFromFury);

        const baseMagicEvasion = (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats.magicEvasion);
        this.combatDetails.magicEvasionRating = baseMagicEvasion + evasionBoost.flatBoost + baseMagicEvasion * evasionBoost.ratioBoost;

        this.combatDetails.combatStats.physicalAmplify += buffAggregates["/buff_types/physical_amplify"]?.flatBoost || 0;
        this.combatDetails.combatStats.waterAmplify += buffAggregates["/buff_types/water_amplify"]?.flatBoost || 0;
        this.combatDetails.combatStats.natureAmplify += buffAggregates["/buff_types/nature_amplify"]?.flatBoost || 0;
        this.combatDetails.combatStats.fireAmplify += buffAggregates["/buff_types/fire_amplify"]?.flatBoost || 0;
        this.combatDetails.combatStats.healingAmplify += buffAggregates["/buff_types/healing_amplify"]?.flatBoost || 0;

        this.combatDetails.combatStats.attackInterval /= (1 + (this.combatDetails.attackLevel / 2000));

        const baseAttackSpeed = this.combatDetails.combatStats.attackSpeed;
        this.combatDetails.combatStats.attackInterval /= (1 + baseAttackSpeed);
        const attackSpeedBoost = buffAggregates["/buff_types/attack_speed"] || { ratioBoost: 0 };
        this.combatDetails.combatStats.attackInterval /= (1 + attackSpeedBoost.ratioBoost);

        const baseArmor = 0.2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.armor;
        const armorBoost = buffAggregates["/buff_types/armor"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.totalArmor = baseArmor + armorBoost.flatBoost + baseArmor * armorBoost.ratioBoost;

        const baseWaterResistance = 0.2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.waterResistance;
        const waterResistanceBoost = buffAggregates["/buff_types/water_resistance"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.totalWaterResistance = baseWaterResistance + waterResistanceBoost.flatBoost + baseWaterResistance * waterResistanceBoost.ratioBoost;

        const baseNatureResistance = 0.2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.natureResistance;
        const natureResistanceBoost = buffAggregates["/buff_types/nature_resistance"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.totalNatureResistance = baseNatureResistance + natureResistanceBoost.flatBoost + baseNatureResistance * natureResistanceBoost.ratioBoost;

        const baseFireResistance = 0.2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.fireResistance;
        const fireResistanceBoost = buffAggregates["/buff_types/fire_resistance"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.totalFireResistance = baseFireResistance + fireResistanceBoost.flatBoost + baseFireResistance * fireResistanceBoost.ratioBoost;

        const hpRegenBoost = buffAggregates["/buff_types/hp_regen"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.combatStats.hpRegenPer10 += this.combatDetails.combatStats.hpRegenPer10 * hpRegenBoost.ratioBoost;
        this.combatDetails.combatStats.hpRegenPer10 += hpRegenBoost.flatBoost;

        const mpRegenBoost = buffAggregates["/buff_types/mp_regen"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.combatStats.mpRegenPer10 += this.combatDetails.combatStats.mpRegenPer10 * mpRegenBoost.ratioBoost;
        this.combatDetails.combatStats.mpRegenPer10 += mpRegenBoost.flatBoost;

        this.combatDetails.combatStats.lifeSteal += buffAggregates["/buff_types/life_steal"]?.flatBoost || 0;
        this.combatDetails.combatStats.physicalThorns += buffAggregates["/buff_types/physical_thorns"]?.flatBoost || 0;
        this.combatDetails.combatStats.elementalThorns += buffAggregates["/buff_types/elemental_thorns"]?.flatBoost || 0;
        this.combatDetails.combatStats.combatExperience += buffAggregates["/buff_types/wisdom"]?.flatBoost || 0;
        this.combatDetails.combatStats.criticalRate += buffAggregates["/buff_types/critical_rate"]?.flatBoost || 0;
        this.combatDetails.combatStats.criticalDamage += buffAggregates["/buff_types/critical_damage"]?.flatBoost || 0;

        this.combatDetails.combatStats.castSpeed += buffAggregates["/buff_types/cast_speed"]?.flatBoost || 0;
        this.combatDetails.combatStats.castSpeed += this.combatDetails["attackLevel"] / 2000;

        const combatDropRateBoost = buffAggregates["/buff_types/combat_drop_rate"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.combatStats.combatDropRate += (1 + this.combatDetails.combatStats.combatDropRate) * combatDropRateBoost.ratioBoost;
        this.combatDetails.combatStats.combatDropRate += combatDropRateBoost.flatBoost;

        const rareFindBoost = buffAggregates["/buff_types/rare_find"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.combatStats.combatRareFind += (1 + this.combatDetails.combatStats.combatRareFind) * rareFindBoost.ratioBoost;
        this.combatDetails.combatStats.combatRareFind += rareFindBoost.flatBoost;

        const combatDropQuantityBoost = buffAggregates["/buff_types/combat_drop_quantity"] || { flatBoost: 0, ratioBoost: 0 };
        this.combatDetails.combatStats.combatDropQuantity += (1 + this.combatDetails.combatStats.combatDropQuantity) * combatDropQuantityBoost.ratioBoost;
        this.combatDetails.combatStats.combatDropQuantity += combatDropQuantityBoost.flatBoost;

        const baseThreat = 100 + this.combatDetails.combatStats.threat;
        this.combatDetails.totalThreat = baseThreat;
        const threatBoost = buffAggregates["/buff_types/threat"] || { flatBoost: 0, ratioBoost: 0 };
        if (threatBoost.ratioBoost !== 0) {
            this.combatDetails.combatStats.threat += baseThreat * threatBoost.ratioBoost;
        } else {
            this.combatDetails.combatStats.threat = baseThreat;
        }
        this.combatDetails.combatStats.threat += threatBoost.flatBoost;

        this.combatDetails.combatStats.retaliation += buffAggregates["/buff_types/retaliation"]?.flatBoost || 0;
        this.combatDetails.combatStats.tenacity += buffAggregates["/buff_types/tenacity"]?.flatBoost || 0;
    }

    // 一次性遍历所有 buffs，预计算所有类型的聚合值
    _precomputeBuffAggregates() {
        const aggregates = {};
        const buffs = this.combatBuffs;

        for (const key in buffs) {
            const buff = buffs[key];
            const typeHrid = buff.typeHrid;

            if (!aggregates[typeHrid]) {
                aggregates[typeHrid] = { ratioBoost: 0, flatBoost: 0 };
            }
            aggregates[typeHrid].ratioBoost += buff.ratioBoost || 0;
            aggregates[typeHrid].flatBoost += buff.flatBoost || 0;
        }

        return aggregates;
    }

    addBuffs(buffs, currentTime) {
        buffs.forEach(buff => buff.startTime = currentTime);

        let needUpdate = false;
        for (const buff of buffs) {
            if (!this.combatBuffs[buff.uniqueHrid] || this.combatBuffs[buff.uniqueHrid].ratioBoost != buff.ratioBoost || this.combatBuffs[buff.uniqueHrid].flatBoost != buff.flatBoost) {
                needUpdate = true;
            }
            this.combatBuffs[buff.uniqueHrid] = buff;
        }

        if (needUpdate) {
            this.updateCombatDetails();
        }
    }

    addBuff(buff, currentTime) {
        buff.startTime = currentTime;

        let needUpdate = true;
        if (this.combatBuffs[buff.uniqueHrid] && this.combatBuffs[buff.uniqueHrid].ratioBoost === buff.ratioBoost && this.combatBuffs[buff.uniqueHrid].flatBoost === buff.flatBoost) {
            needUpdate = false;
        }

        this.combatBuffs[buff.uniqueHrid] = buff;

        if (needUpdate) {
            this.updateCombatDetails();
        }
    }

    removeBuffs(buffs) {
        let needUpdate = false;
        buffs.forEach(buff => {
            if (!this.combatBuffs[buff.uniqueHrid]) {
                return;
            }
            delete this.combatBuffs[buff.uniqueHrid];
            needUpdate = true;
        });

        if (needUpdate) {
            this.updateCombatDetails();
        }
    }

    removeBuff(buff) {
        if (!this.combatBuffs[buff.uniqueHrid]) {
            return;
        }
        delete this.combatBuffs[buff.uniqueHrid];

        this.updateCombatDetails();
    }

    addPermanentBuff(buff) {
        if (this.permanentBuffs[buff.typeHrid]) {
            this.permanentBuffs[buff.typeHrid].flatBoost += buff.flatBoost;
            this.permanentBuffs[buff.typeHrid].ratioBoost += buff.ratioBoost;
        } else {
            this.permanentBuffs[buff.typeHrid] = {
                uniqueHrid: buff.uniqueHrid,
                typeHrid: buff.typeHrid,
                flatBoost: buff.flatBoost,
                ratioBoost: buff.ratioBoost,
                duration: buff.duration
            };
        }
    }

    generatePermanentBuffs() {
        for (let i = 0; i < this.houseRooms.length; i++) {
            const houseRoom = this.houseRooms[i];
            houseRoom.buffs.forEach(buff => {
                this.addPermanentBuff(buff);
            });
        }

        if (this.achievements) {
            this.achievements.buffs.forEach(buff => {
                this.addPermanentBuff(buff);
            });
        }
        if (this.zoneBuffs) {
            this.zoneBuffs.forEach(buff => {
                this.addPermanentBuff(buff);
            });
        }
        if (this.extraBuffs) {
            this.extraBuffs.forEach(buff => {
                this.addPermanentBuff(buff);
            });
        }
    }

    removeExpiredBuffs(currentTime) {
        let expiredBuffs = Object.values(this.combatBuffs).filter(
            (buff) => buff.startTime + buff.duration <= currentTime
        );
        expiredBuffs.forEach((buff) => {
            delete this.combatBuffs[buff.uniqueHrid];
        });

        this.updateCombatDetails();
    }

    clearBuffs() {
        // Shallow copy is sufficient since buff objects are not mutated after creation
        this.combatBuffs = Object.assign({}, this.permanentBuffs);
        this.updateCombatDetails();
    }

    clearCCs() {
        this.isStunned = false;
        this.stunExpireTime = null;
        this.isSilenced = false;
        this.silenceExpireTime = null;
        this.isBlinded = false;
        this.blindExpireTime = null;
        this.combatDetails.combatStats.damageTaken = 0;
    }

    getBuffBoosts(type) {
        const boosts = [];
        const buffs = this.combatBuffs;
        for (const key in buffs) {
            const buff = buffs[key];
            if (buff.typeHrid === type) {
                boosts.push({ ratioBoost: buff.ratioBoost, flatBoost: buff.flatBoost });
            }
        }
        return boosts;
    }

    getBuffBoost(type) {
        // Check cache first
        const cached = this._buffBoostCache.get(type);
        if (cached !== undefined) {
            return cached;
        }

        let ratioBoost = 0;
        let flatBoost = 0;
        const buffs = this.combatBuffs;

        for (const key in buffs) {
            const buff = buffs[key];
            if (buff.typeHrid === type) {
                ratioBoost += buff.ratioBoost || 0;
                flatBoost += buff.flatBoost || 0;
            }
        }

        const result = { ratioBoost, flatBoost };
        this._buffBoostCache.set(type, result);
        return result;
    }

    reset(currentTime = 0) {
        this.clearCCs();
        
        // 只有玩家在地下城团灭重开时保留buff和CD，敌人始终完全重置
        if (currentTime == 0 || !this.isPlayer) {
            // 首次战斗开始 或 敌人重置：完全重置
            this.clearBuffs();
            // updateCombatDetails() 在后续 addBuff/addBuffs 时会被调用
            this.resetCooldowns(currentTime);
        } else {
            // 地下城团灭重开（仅玩家）：只移除过期buff，保留CD
            this.removeExpiredBuffs(currentTime);
            // updateCombatDetails() 在后续 addBuff/addBuffs 时会被调用
        }

        this.combatDetails.currentHitpoints = this.combatDetails.maxHitpoints;
        this.combatDetails.currentManapoints = this.combatDetails.maxManapoints;
    }

    resetCooldowns(currentTime = 0) {
        this.food.filter((food) => food != null).forEach((food) => (food.lastUsed = Number.MIN_SAFE_INTEGER));
        this.drinks.filter((drink) => drink != null).forEach((drink) => (drink.lastUsed = Number.MIN_SAFE_INTEGER));

        let haste = this.combatDetails.combatStats.abilityHaste;

        this.abilities
            .filter((ability) => ability != null)
            .forEach((ability) => {
                if (this.isPlayer) {
                    ability.lastUsed = Number.MIN_SAFE_INTEGER;
                } else {
                    let cooldownDuration = ability.cooldownDuration;
                    if (haste > 0) {
                        cooldownDuration = cooldownDuration * 100 / (100 + haste);
                    }
                    ability.lastUsed = currentTime - Math.floor(cooldownDuration * 0.5) + Math.floor(Math.random() * cooldownDuration * 0.5);
                }
            });
    }

    addHitpoints(hitpoints) {
        let hitpointsAdded = 0;

        if (this.combatDetails.currentHitpoints >= this.combatDetails.maxHitpoints) {
            return hitpointsAdded;
        }

        let newHitpoints = Math.min(this.combatDetails.currentHitpoints + hitpoints, this.combatDetails.maxHitpoints);
        hitpointsAdded = newHitpoints - this.combatDetails.currentHitpoints;
        this.combatDetails.currentHitpoints = newHitpoints;

        return hitpointsAdded;
    }

    addManapoints(manapoints) {
        let manapointsAdded = 0;

        if (this.combatDetails.currentManapoints >= this.combatDetails.maxManapoints) {
            return manapointsAdded;
        }

        let newManapoints = Math.min(
            this.combatDetails.currentManapoints + manapoints,
            this.combatDetails.maxManapoints
        );
        manapointsAdded = newManapoints - this.combatDetails.currentManapoints;
        this.combatDetails.currentManapoints = newManapoints;

        return manapointsAdded;
    }
}

export default CombatUnit;
