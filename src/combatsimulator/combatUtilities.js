class CombatUtilities {
    // Pre-computed combat style lookup table for faster access
    static _combatStyleMap = {
        "/combat_styles/stab": "stab",
        "/combat_styles/slash": "slash",
        "/combat_styles/smash": "smash",
        "/combat_styles/ranged": "ranged",
        "/combat_styles/magic": "magic"
    };

    // Pre-computed damage type lookup table
    static _damageTypeMap = {
        "/damage_types/physical": {
            amplify: "physicalAmplify",
            resistance: "totalArmor",
            penetration: "armorPenetration",
            thornPower: "physicalThorns",
            thornType: "physicalThorns"
        },
        "/damage_types/water": {
            amplify: "waterAmplify",
            resistance: "totalWaterResistance",
            penetration: "waterPenetration",
            thornPower: "elementalThorns",
            thornType: "elementalThorns"
        },
        "/damage_types/nature": {
            amplify: "natureAmplify",
            resistance: "totalNatureResistance",
            penetration: "naturePenetration",
            thornPower: "elementalThorns",
            thornType: "elementalThorns"
        },
        "/damage_types/fire": {
            amplify: "fireAmplify",
            resistance: "totalFireResistance",
            penetration: "firePenetration",
            thornPower: "elementalThorns",
            thornType: "elementalThorns"
        }
    };

    static _result = {
        damageDone: 0, didHit: false, thornDamageDone: 0, thornType: "",
        retaliationDamageDone: 0, lifeStealHeal: 0, hpDrain: 0, manaLeechMana: 0, isCrit: false
    };

    static getTarget(enemies) {
        if (!enemies) {
            return null;
        }
        let target = enemies.find((enemy) => enemy.combatDetails.currentHitpoints > 0);

        return target ?? null;
    }

    static randomInt(min, max) {
        if (max < min) {
            let temp = min;
            min = max;
            max = temp;
        }

        let minCeil = Math.ceil(min);
        let maxFloor = Math.floor(max);

        if (Math.floor(min) == maxFloor) {
            return Math.floor((min + max) / 2 + Math.random());
        }

        let minTail = -1 * (min - minCeil);
        let maxTail = max - maxFloor;

        let balancedWeight = 2 * minTail + (maxFloor - minCeil);
        let balancedAverage = (maxFloor + minCeil) / 2;
        let average = (max + min) / 2;
        let extraTailWeight = (balancedWeight * (average - balancedAverage)) / (maxFloor + 1 - average);
        let extraTailChance = Math.abs(extraTailWeight / (extraTailWeight + balancedWeight));

        if (Math.random() < extraTailChance) {
            if (maxTail > minTail) {
                return Math.floor(maxFloor + 1);
            } else {
                return Math.floor(minCeil - 1);
            }
        }

        if (maxTail > minTail) {
            return Math.floor(min + Math.random() * (maxFloor + minTail - min + 1));
        } else {
            return Math.floor(minCeil - maxTail + Math.random() * (max - (minCeil - maxTail) + 1));
        }
    }

    static processAttack(source, target, abilityEffect = null) {
        const combatStyle = abilityEffect
            ? abilityEffect.combatStyleHrid
            : source.combatDetails.combatStats.combatStyleHrid;
        const damageType = abilityEffect ? abilityEffect.damageType : source.combatDetails.combatStats.damageType;

        // Use lookup table for combat style
        const styleKey = this._combatStyleMap[combatStyle];
        if (!styleKey) {
            throw new Error("Unknown combat style: " + combatStyle);
        }

        const sourceDetails = source.combatDetails;
        const targetDetails = target.combatDetails;

        const sourceAccuracyKey = styleKey + "AccuracyRating";
        const sourceMaxDamageKey = styleKey + "MaxDamage";
        const targetEvasionKey = styleKey + "EvasionRating";

        let sourceAccuracyRating = sourceDetails[sourceAccuracyKey];
        const sourceAutoAttackMaxDamage = sourceDetails[sourceMaxDamageKey];
        const targetEvasionRating = targetDetails[targetEvasionKey];

        // Use lookup table for damage type
        const damageInfo = this._damageTypeMap[damageType];
        if (!damageInfo) {
            throw new Error("Unknown damage type: " + damageType);
        }

        const sourceDamageMultiplier = 1 + sourceDetails.combatStats[damageInfo.amplify];
        const sourceResistance = sourceDetails[damageInfo.resistance];
        const sourcePenetration = sourceDetails.combatStats[damageInfo.penetration];
        const targetResistance = targetDetails[damageInfo.resistance];
        const targetThornPower = targetDetails.combatStats[damageInfo.thornPower];
        const targetPenetration = targetDetails.combatStats[damageInfo.penetration];
        const thornType = damageInfo.thornType;

        let hitChance = 1;
        let critChance = 0;
        let isCrit = false;
        let bonusCritChance = source.combatDetails.combatStats.criticalRate;
        let bonusCritDamage = source.combatDetails.combatStats.criticalDamage;

        if (abilityEffect) {
            sourceAccuracyRating *= (1 + abilityEffect.bonusAccuracyRatio);
        }

        if (source.isWeakened) {
            sourceAccuracyRating = sourceAccuracyRating - (source.weakenPercentage * sourceAccuracyRating);
        }

        hitChance =
            Math.pow(sourceAccuracyRating, 1.4) /
            (Math.pow(sourceAccuracyRating, 1.4) + Math.pow(targetEvasionRating, 1.4));

        if (combatStyle == "/combat_styles/ranged") {
            critChance = 0.3 * hitChance;
        }

        critChance = critChance + bonusCritChance;

        let baseDamageFlat = abilityEffect ? abilityEffect.damageFlat : 0;
        let baseDamageRatio = abilityEffect ? abilityEffect.damageRatio : 1;

        let armorDamageRatioFlat = abilityEffect ? abilityEffect.armorDamageRatio * source.combatDetails.totalArmor : 0;

        let sourceMinDamage = sourceDamageMultiplier * (1 + baseDamageFlat + armorDamageRatioFlat);
        let sourceMaxDamage = sourceDamageMultiplier * (baseDamageRatio * sourceAutoAttackMaxDamage + baseDamageFlat + armorDamageRatioFlat);

        if (Math.random() < critChance) {
            sourceMaxDamage = sourceMaxDamage * (1 + bonusCritDamage);
            sourceMinDamage = sourceMaxDamage;
            isCrit = true;
        }

        let damageRoll = CombatUtilities.randomInt(sourceMinDamage, sourceMaxDamage);
        damageRoll *= (1 + source.combatDetails.combatStats.taskDamage);
        damageRoll *= (1 + target.combatDetails.combatStats.damageTaken);
        if (!abilityEffect) {
            damageRoll += damageRoll * source.combatDetails.combatStats.autoAttackDamage;
        } else {
            damageRoll *= (1 + source.combatDetails.combatStats.abilityDamage);
        }

        let damageDone = 0;
        let thornDamageDone = 0;

        let didHit = false;
        if (Math.random() < hitChance) {
            didHit = true;
            let penetratedTargetResistance = targetResistance;

            if (sourcePenetration > 0 && targetResistance > 0) {
                penetratedTargetResistance = targetResistance / (1 + sourcePenetration);
            }

            let targetDamageTakenRatio = 100 / (100 + penetratedTargetResistance);
            if (penetratedTargetResistance < 0) {
                targetDamageTakenRatio = (100 - penetratedTargetResistance) / 100;
            }

            let mitigatedDamage = Math.ceil(targetDamageTakenRatio * damageRoll);
            damageDone = Math.min(mitigatedDamage, target.combatDetails.currentHitpoints);
            target.combatDetails.currentHitpoints -= damageDone;
        }

        if (targetThornPower > 0.0 && targetResistance > -99.0) {
            let penetratedSourceResistance = sourceResistance

            if (sourceResistance > 0) {
                penetratedSourceResistance = sourceResistance / (1 + targetPenetration);
            }

            let sourceDamageTakenRatio = 100.0 / (100 + penetratedSourceResistance);
            if (penetratedSourceResistance < 0) {
                sourceDamageTakenRatio = (100 - penetratedSourceResistance) / 100;
            }

            let targetTaskDamageMultiplier = 1.0 + target.combatDetails.combatStats.taskDamage;
            let sourceDamageTakenMultiplier = 1.0 + source.combatDetails.combatStats.damageTaken;
            let targetDamageMultiplier = targetTaskDamageMultiplier * sourceDamageTakenMultiplier;

            let thornsDamageRoll = CombatUtilities.randomInt(1,
                targetDamageMultiplier
                * target.combatDetails.defensiveMaxDamage
                * (1.0 + targetResistance / 100.0)
                * targetThornPower);

            let mitigatedThornsDamage = Math.ceil(sourceDamageTakenRatio * thornsDamageRoll);

            thornDamageDone = Math.min(mitigatedThornsDamage, source.combatDetails.currentHitpoints);
            source.combatDetails.currentHitpoints -= thornDamageDone;
        }

        let retaliationDamageDone = 0;
        if (target.combatDetails.combatStats.retaliation > 0) {
            let retaliationHitChance = 
                Math.pow(target.combatDetails.smashAccuracyRating, 1.4) /
                (Math.pow(target.combatDetails.smashAccuracyRating, 1.4) + Math.pow(source.combatDetails.smashEvasionRating, 1.4));

            if (retaliationHitChance > Math.random()) {
                let sourceEffectiveArmor = source.combatDetails.totalArmor;
                if (sourceEffectiveArmor > 0) {
                    sourceEffectiveArmor = sourceEffectiveArmor / (1.0 + target.combatDetails.combatStats.armorPenetration);
                }

                let sourceDamageTakenRatio = 100.0 / (100.0 + sourceEffectiveArmor);
                if (sourceEffectiveArmor < 0) {
                    sourceDamageTakenRatio = (100.0 - sourceEffectiveArmor) / 100.0;
                }

                let targetTaskDamageMultiplier = 1.0 + target.combatDetails.combatStats.taskDamage;
                let sourceDamageTakenMultiplier = 1.0 + source.combatDetails.combatStats.damageTaken;
                let retaliationDamageMultiplier = targetTaskDamageMultiplier * sourceDamageTakenMultiplier;

                let premitigatedDamage = damageRoll;
                premitigatedDamage = Math.min(premitigatedDamage, target.combatDetails.defensiveMaxDamage * 5);

                let retaliationMinDamage = retaliationDamageMultiplier * target.combatDetails.combatStats.retaliation * premitigatedDamage;
                let retaliationMaxDamage = retaliationDamageMultiplier * target.combatDetails.combatStats.retaliation * (target.combatDetails.defensiveMaxDamage + premitigatedDamage);

                let retaliationDamageRoll = CombatUtilities.randomInt(retaliationMinDamage, retaliationMaxDamage);
                let mitigatedRetaliationDamage = Math.ceil(sourceDamageTakenRatio * retaliationDamageRoll);
                retaliationDamageDone = Math.min(mitigatedRetaliationDamage, source.combatDetails.currentHitpoints);
                source.combatDetails.currentHitpoints -= retaliationDamageDone;
            }
        }

        let lifeStealHeal = 0;
        if (!abilityEffect && didHit && source.combatDetails.combatStats.lifeSteal > 0) {
            lifeStealHeal = source.addHitpoints(Math.floor(source.combatDetails.combatStats.lifeSteal * damageDone));
        }

        let hpDrain = 0;
        if (abilityEffect && didHit && abilityEffect.hpDrainRatio > 0) {
            let healingAmplify = 1 + source.combatDetails.combatStats.healingAmplify;
            hpDrain = source.addHitpoints(Math.floor(abilityEffect.hpDrainRatio * damageDone * healingAmplify));
        }

        let manaLeechMana = 0;
        if (!abilityEffect && didHit && source.combatDetails.combatStats.manaLeech > 0) {
            manaLeechMana = source.addManapoints(Math.floor(source.combatDetails.combatStats.manaLeech * damageDone));
        }

        const r = CombatUtilities._result;
        r.damageDone = damageDone;
        r.didHit = didHit;
        r.thornDamageDone = thornDamageDone;
        r.thornType = thornType;
        r.retaliationDamageDone = retaliationDamageDone;
        r.lifeStealHeal = lifeStealHeal;
        r.hpDrain = hpDrain;
        r.manaLeechMana = manaLeechMana;
        r.isCrit = isCrit;
        return r;
    }

    static processHeal(source, abilityEffect, target) {
        if (abilityEffect.combatStyleHrid != "/combat_styles/magic") {
            throw new Error("Heal ability effect not supported for combat style: " + abilityEffect.combatStyleHrid);
        }

        let healingAmplify = 1 + source.combatDetails.combatStats.healingAmplify;
        let magicMaxDamage = source.combatDetails.magicMaxDamage;

        let baseHealFlat = abilityEffect.damageFlat;
        let baseHealRatio = abilityEffect.damageRatio;

        let minHeal = healingAmplify * (1 + baseHealFlat);
        let maxHeal = healingAmplify * (baseHealRatio * magicMaxDamage + baseHealFlat);

        let heal = this.randomInt(minHeal, maxHeal);
        let amountHealed = target.addHitpoints(heal);

        return amountHealed;
    }

    static processRevive(source, abilityEffect, target) {
        if (abilityEffect.combatStyleHrid != "/combat_styles/magic") {
            throw new Error("Heal ability effect not supported for combat style: " + abilityEffect.combatStyleHrid);
        }

        let healingAmplify = 1 + source.combatDetails.combatStats.healingAmplify;
        let magicMaxDamage = source.combatDetails.magicMaxDamage;

        let baseHealFlat = abilityEffect.damageFlat;
        let baseHealRatio = abilityEffect.damageRatio;

        let minHeal = healingAmplify * (1 + baseHealFlat);
        let maxHeal = healingAmplify * (baseHealRatio * magicMaxDamage + baseHealFlat);

        let heal = this.randomInt(minHeal, maxHeal);
        let amountHealed = target.addHitpoints(heal);
        target.combatDetails.currentManapoints = target.combatDetails.maxManapoints;
        target.clearCCs();

        // target.clearBuffs();

        return amountHealed;
    }

    static processSpendHp(source, abilityEffect) {
        let currentHp = source.combatDetails.currentHitpoints;
        let spendHpRatio = abilityEffect.spendHpRatio;

        let spentHp = Math.floor(currentHp * spendHpRatio);

        source.combatDetails.currentHitpoints -= spentHp;

        return spentHp;
    }

    static calculateTickValue(totalValue, totalTicks, currentTick) {
        let currentSum = Math.floor((currentTick * totalValue) / totalTicks);
        let previousSum = Math.floor(((currentTick - 1) * totalValue) / totalTicks);

        return currentSum - previousSum;
    }
}

export default CombatUtilities;
