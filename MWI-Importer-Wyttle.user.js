// ==UserScript==
// @name         MWI-Importer - Wyttle Guild Shrines
// @namespace    http://tampermonkey.net/
// @version      2.3.3
// @description  基于 MWI-Importer 2.3.0，增加 Wyttle 模拟器和公会神龛等级导入支持。
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://mooneycalc.vercel.app/*
// @match        https://mooneycalc.netlify.app/*
// @match        https://amvoidguy.github.io/MWICombatSimulatorTest/dist/index.html
// @match        https://shykai.github.io/MWICombatSimulatorTest/*
// @match        https://wyttle.github.io/MWICombatSimulatorTest/*
// @match        http://localhost:9000/
// @match        http://localhost:8081/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js
// ==/UserScript==

//TODO
// 1. 目前只支持当然页面刷新之后的角色 模拟多久升级
// 2. 检验trigger是否工作 找到了trigger数据


(function () {
    "use strict";
    const userLanguage = navigator.language || navigator.userLanguage;
    const isZH = userLanguage.startsWith("zh");
    let profile_arr = new Array();
    const SCRIPT_SIMULATE_TIME = "24";//模拟时长
    const GUILD_SHRINE_STORAGE_KEY = "wyttleGuildShrineLevels";
    const GUILD_SHRINE_NAMES = ["force", "tempo", "spirit", "rarity", "scholar"];
    const GUILD_SHRINE_LEVEL_FIELDS = ["level", "currentLevel", "guildBuildingLevel", "buildingLevel"];
    const GUILD_SHRINE_IDENTITY_FIELDS = ["guildShrineHrid", "shrineHrid", "guildBuildingHrid", "hrid", "guildBuffHrid", "name"];
    const GUILD_SHRINE_CONTAINER_FIELDS = [
        "guildShrineMap", "guildShrineDict", "guildShrines",
        "guildShrineLevelMap", "guildShrineLevelDict", "guildShrineLevels",
        "guildBuildingMap", "guildBuildingDict", "guildBuildings",
        "guildBuildingLevelMap", "guildBuildingLevelDict", "guildBuildingLevels",
    ];
    const GUILD_BUFF_CONTAINER_FIELDS = [
        "characterGuildBuffMap", "characterGuildBuffDict", "characterGuildBuffs",
        "characterGuildBuffLevelMap", "characterGuildBuffLevelDict",
        "guildBuffLevelMap", "guildBuffLevelDict", "guildBuffLevels",
        "guildBuffMap", "guildBuffDict",
    ];
    const GUILD_SHRINE_COMBAT_BUFFS = {
        force: [
            { uniqueHrid: "/buff_uniques/damage_guild_buff", valueField: "ratioBoost", perLevel: 0.003 },
        ],
        tempo: [
            { uniqueHrid: "/buff_uniques/attack_speed_guild_buff", valueField: "ratioBoost", perLevel: 0.004 },
            { uniqueHrid: "/buff_uniques/cast_speed_guild_buff", valueField: "flatBoost", perLevel: 0.004 },
        ],
        spirit: [
            { uniqueHrid: "/buff_uniques/max_hitpoints_guild_buff", valueField: "ratioBoost", perLevel: 0.01 },
            { uniqueHrid: "/buff_uniques/max_manapoints_guild_buff", valueField: "ratioBoost", perLevel: 0.01 },
        ],
        rarity: [
            { uniqueHrid: "/buff_uniques/rare_find_guild_buff", valueField: "flatBoost", perLevel: 0.01 },
        ],
        scholar: [
            { uniqueHrid: "/buff_uniques/wisdom_guild_buff", valueField: "flatBoost", perLevel: 0.005 },
        ],
    };
    //启动前先把所有队友的装备手动看一遍!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    if (document.URL.includes("milkywayidle.com") || document.URL.includes("milkywayidlecn.com")) {
        hookWS();
    } else if (document.URL.includes("mooneycalc")) {
        addImportButton1();
    } else if( document.URL.includes("MWICombatSimulatorTest") || document.URL.includes("localhost")){
        addImportButton4();
        waitSimulationResultsLoading();
    }
    function waitSimulationResultsLoading(){
        const waitForNavi = () => {
            if(document.querySelector(`div.row`)?.querySelectorAll(`div.col-md-5`)?.[2]?.querySelector(`div.row > div.col-md-5`))observeResults();
            else setTimeout(waitSimulationResultsLoading, 200);
        };
        waitForNavi();
    }



    function hookWS() {
        const dataProperty = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
        const oriGet = dataProperty.get;

        dataProperty.get = hookedGet;
        Object.defineProperty(MessageEvent.prototype, "data", dataProperty);

        function hookedGet() {
            const socket = this.currentTarget;
            if (!(socket instanceof WebSocket)) {
                return oriGet.call(this);
            }
            if (socket.url.indexOf("api.milkywayidle.com/ws") <= -1 && socket.url.indexOf("api.milkywayidlecn.com/ws") <= -1  && socket.url.indexOf("api-test.milkywayidle.com/ws") <= -1) {

                return oriGet.call(this);
            }

            const message = oriGet.call(this);
            Object.defineProperty(this, "data", { value: message }); // Anti-loop

            return handleMessage(message);
        }
    }

    let current_team_battle = "";

    function emptyGuildShrineLevels() {
        return Object.fromEntries(GUILD_SHRINE_NAMES.map((name) => [name, 0]));
    }

    function normalizeGuildShrineLevel(value) {
        const rawValue = value && typeof value === "object"
            ? GUILD_SHRINE_LEVEL_FIELDS.map((field) => value[field]).find((fieldValue) => fieldValue !== undefined)
            : value;
        const level = Number(rawValue);
        return Number.isFinite(level) ? Math.max(0, Math.min(20, Math.trunc(level))) : null;
    }

    function guildShrineNameFromIdentity(identity) {
        if (typeof identity !== "string") {
            return null;
        }
        const normalized = identity.toLowerCase();
        for (const shrineName of GUILD_SHRINE_NAMES) {
            if (normalized === shrineName ||
                normalized === `/guild_shrines/${shrineName}` ||
                normalized === `/guild_buffs/${shrineName}_combat` ||
                normalized === `/guild_buffs/${shrineName}_skilling` ||
                normalized === `${shrineName}_shrine`) {
                return shrineName;
            }
        }
        return null;
    }

    function mergeGuildShrineContainer(container, levels, priorities, priority) {
        if (!container || typeof container !== "object") {
            return false;
        }
        let updated = false;
        const entries = Array.isArray(container)
            ? container.map((record, index) => [String(index), record])
            : Object.entries(container);
        for (const [fallbackIdentity, record] of entries) {
            const identities = [fallbackIdentity];
            if (record && typeof record === "object") {
                for (const field of GUILD_SHRINE_IDENTITY_FIELDS) {
                    identities.push(record[field]);
                }
            }
            const shrineName = identities.map(guildShrineNameFromIdentity).find(Boolean);
            const level = normalizeGuildShrineLevel(record);
            if (!shrineName || level === null || priority < priorities[shrineName]) {
                continue;
            }
            levels[shrineName] = level;
            priorities[shrineName] = priority;
            updated = true;
        }
        return updated;
    }

    function captureGuildShrineLevels(messageObject) {
        if (!messageObject || typeof messageObject !== "object") {
            return false;
        }
        const levels = getGuildShrineLevels();
        const priorities = Object.fromEntries(GUILD_SHRINE_NAMES.map((name) => [name, 0]));
        const visited = new Set();
        const pending = [{ value: messageObject, depth: 0 }];
        let scanned = 0;
        let updated = false;

        while (pending.length && scanned < 500) {
            const { value, depth } = pending.pop();
            if (!value || typeof value !== "object" || visited.has(value) || depth > 8) {
                continue;
            }
            visited.add(value);
            scanned += 1;

            for (const field of GUILD_BUFF_CONTAINER_FIELDS) {
                updated = mergeGuildShrineContainer(value[field], levels, priorities, 1) || updated;
            }
            for (const field of GUILD_SHRINE_CONTAINER_FIELDS) {
                updated = mergeGuildShrineContainer(value[field], levels, priorities, 2) || updated;
            }
            for (const child of Object.values(value)) {
                if (child && typeof child === "object") {
                    pending.push({ value: child, depth: depth + 1 });
                }
            }
        }

        if (updated) {
            GM_setValue(GUILD_SHRINE_STORAGE_KEY, levels);
        }
        return updated;
    }

    function getGuildShrineLevels() {
        const stored = GM_getValue(GUILD_SHRINE_STORAGE_KEY, {});
        const levels = emptyGuildShrineLevels();
        if (!stored || typeof stored !== "object") {
            return levels;
        }
        for (const shrineName of GUILD_SHRINE_NAMES) {
            const level = normalizeGuildShrineLevel(stored[shrineName]);
            if (level !== null) {
                levels[shrineName] = level;
            }
        }
        return levels;
    }

    function getGuildShrineLevelsFromSource(source) {
        if (!source || typeof source !== "object") {
            return null;
        }
        const combatBuffLevels = getGuildShrineLevelsFromCombatBuffMap(source.combatBuffMap);
        if (combatBuffLevels) {
            return combatBuffLevels;
        }
        const levels = emptyGuildShrineLevels();
        const priorities = Object.fromEntries(GUILD_SHRINE_NAMES.map((name) => [name, 0]));
        const visited = new Set();
        const pending = [{ value: source, depth: 0 }];
        let scanned = 0;
        let found = false;

        while (pending.length && scanned < 500) {
            const { value, depth } = pending.pop();
            if (!value || typeof value !== "object" || visited.has(value) || depth > 8) {
                continue;
            }
            visited.add(value);
            scanned += 1;

            for (const field of GUILD_BUFF_CONTAINER_FIELDS) {
                found = mergeGuildShrineContainer(value[field], levels, priorities, 1) || found;
            }
            for (const field of GUILD_SHRINE_CONTAINER_FIELDS) {
                found = mergeGuildShrineContainer(value[field], levels, priorities, 2) || found;
            }
            for (const child of Object.values(value)) {
                if (child && typeof child === "object") {
                    pending.push({ value: child, depth: depth + 1 });
                }
            }
        }
        return found ? levels : null;
    }

    function getGuildShrineLevelsFromCombatBuffMap(combatBuffMap) {
        if (!combatBuffMap || typeof combatBuffMap !== "object" || Array.isArray(combatBuffMap)) {
            return null;
        }
        const levels = emptyGuildShrineLevels();
        for (const shrineName of GUILD_SHRINE_NAMES) {
            const inferredLevels = [];
            for (const definition of GUILD_SHRINE_COMBAT_BUFFS[shrineName]) {
                const buff = combatBuffMap[definition.uniqueHrid];
                if (!buff || typeof buff !== "object") {
                    continue;
                }
                const boost = Number(buff[definition.valueField]);
                if (!Number.isFinite(boost) || boost < 0) {
                    continue;
                }
                inferredLevels.push(Math.round(boost / definition.perLevel));
            }
            if (inferredLevels.length > 0) {
                levels[shrineName] = normalizeGuildShrineLevel(Math.max(...inferredLevels)) ?? 0;
            }
        }
        return levels;
    }

    function handleMessage(message) {
        let obj;
        try {
            obj = JSON.parse(message);
        } catch (error) {
            console.warn("MWI-Importer: Ignored non-JSON WebSocket message", error);
            return message;
        }
        captureGuildShrineLevels(obj);
        //const keys = GM_listValues();
        //console.log('keys',keys);
        // keys.forEach(key => { GM_deleteValue(key); });
        if (obj && obj.type === "init_character_data") {

            if(GM_getValue("profile_arr"))
            {
                profile_arr = GM_getValue("profile_arr");
            }

            if(!profile_arr.includes(obj.character.name)){
                profile_arr.push(obj.character.name);
            }

            // profile_arr.reverse();
            // console.log("profileArr",profile_arr);
            GM_setValue("profile_arr", profile_arr);
            GM_setValue("profile_" + obj.character.name, message);
            GM_setValue("init_character_data",message);
            const init_client_data = JSON.parse(LZString.decompressFromUTF16(localStorage.getItem('initClientData')));
            if(init_client_data) {
                GM_setValue("initData_levelExperienceTable", init_client_data.levelExperienceTable);
                GM_setValue("initData_abilityDetailMap", init_client_data.abilityDetailMap);
            }

        }else if (obj && obj.type === "new_battle"){
            let newBattleHandler = [];
            obj.players.forEach((player) => {
                newBattleHandler.push(player.name);
            });

            // console.log("new_battle",newBattleHandler);

            //以防万一 留一个旧的team battle
            current_team_battle = message;

            GM_setValue("team_battle_" + newBattleHandler[0], message);
        }else if (obj && obj.type === "profile_shared"){
            console.log("profile_shared",obj);
            GM_setValue(obj.profile.sharableCharacter.name, message);
            if (obj.profile.sharableCharacter.id !== undefined) {
                GM_setValue("profile_character_" + obj.profile.sharableCharacter.id, message);
            }
            get_sim_json(obj);
        }
        return message;
    }


    function constructLoadoutDatasFromPlayerInfo(playerInfo) {
        let initData_abilityDetailMap = GM_getValue("initData_abilityDetailMap");

        let loadoutDatas = {};
        for (const loadout of Object.values(playerInfo.characterLoadoutMap)) {
            if (loadout.actionTypeHrid != "/action_types/combat") {
                continue;
            }

            const playerObj = {};
            playerObj.player = {};

            // Levels
            for (const skill of playerInfo.characterSkills) {
                if (skill.skillHrid.includes("stamina")) {
                    playerObj.player.staminaLevel = skill.level;
                } else if (skill.skillHrid.includes("intelligence")) {
                    playerObj.player.intelligenceLevel = skill.level;
                } else if (skill.skillHrid.includes("attack")) {
                    playerObj.player.attackLevel = skill.level;
                } else if (skill.skillHrid.includes("melee")) {
                    playerObj.player.meleeLevel = skill.level;
                } else if (skill.skillHrid.includes("defense")) {
                    playerObj.player.defenseLevel = skill.level;
                } else if (skill.skillHrid.includes("ranged")) {
                    playerObj.player.rangedLevel = skill.level;
                } else if (skill.skillHrid.includes("magic")) {
                    playerObj.player.magicLevel = skill.level;
                }
            }

            // Items
            playerObj.player.equipment = [];
            for (const key in loadout.wearableMap) {
                const itemData = loadout.wearableMap[key]; // "92842::/item_locations/inventory::/items/chimerical_quiver_refined::5"
                if (itemData == "") {
                    continue;
                }
                const itemHrid = itemData.split("::")[2];

                let enhancementLevel = 0;
                for (const item of playerInfo.characterItems) {
                    if (item.itemHrid == itemHrid && item.enhancementLevel > enhancementLevel) {
                        enhancementLevel = item.enhancementLevel;
                    }
                }
                playerObj.player.equipment.push({
                    itemLocationHrid: key,
                    itemHrid: itemHrid,
                    enhancementLevel: enhancementLevel,
                });
            }

            // Food
            playerObj.food = {};
            playerObj.food["/action_types/combat"] = loadout.foodItemHrids;

            // Drinks
            playerObj.drinks = {};
            playerObj.drinks["/action_types/combat"] = loadout.drinkItemHrids;

            // Abilities
            playerObj.abilities = [
                {
                    abilityHrid: "",
                    level: "1",
                },
                {
                    abilityHrid: "",
                    level: "1",
                },
                {
                    abilityHrid: "",
                    level: "1",
                },
                {
                    abilityHrid: "",
                    level: "1",
                },
                {
                    abilityHrid: "",
                    level: "1",
                },
            ];
            let normalAbillityIndex = 1;
            for (const abilityHrid of Object.values(loadout.abilityMap)) {
                let abilityLevel = 0;
                for (const ability of playerInfo.characterAbilities) {
                    if (ability.abilityHrid === abilityHrid) {
                        abilityLevel = ability.level;
                        break;
                    }
                }
                
                if (initData_abilityDetailMap[abilityHrid].isSpecialAbility) {
                    playerObj.abilities[0] = {
                        abilityHrid: abilityHrid,
                        level: abilityLevel,
                    };
                } else {
                    playerObj.abilities[normalAbillityIndex++] = {
                        abilityHrid: abilityHrid,
                        level: abilityLevel,
                    };
                }
            }

            // TriggerMap
            playerObj.triggerMap = { ...loadout.abilityCombatTriggersMap, ...loadout.consumableCombatTriggersMap };

            // HouseRooms
            playerObj.houseRooms = {};
            for (const house of Object.values(playerInfo.characterHouseRoomMap)) {
                playerObj.houseRooms[house.houseRoomHrid] = house.level;
            }

            // Achievements
            playerObj.achievements = {};
            for (const achievement of Object.values(playerInfo.characterAchievements)) {
                playerObj.achievements[achievement.achievementHrid] = achievement.isCompleted;
            }
            playerObj.guildShrineLevels = getGuildShrineLevels();
            
            const loadName = playerInfo.character.name +"-loadout-"+ loadout.name;
            loadoutDatas[loadName] = playerObj;
            console.log(loadName, playerObj);
        }
        return loadoutDatas;
    }

    function convertDataToEquipmentSetsFormat(loadoutData) {
        let equipmentSet = {
            levels: {},
            equipment: {},
            food: {},
            drinks: {},
            abilities: {},
            triggerMap: {},
            houseRooms: {},
            achievements: {},
            guildShrineLevels: {},
        };

        for (const key of Object.keys(loadoutData.player)) {
            if (!key.includes("Level")) {
                continue;
            }
            equipmentSet.levels[key.replace("Level", "")] = loadoutData.player[key];
        }

        for (const item of loadoutData.player.equipment) {
            let type = item.itemLocationHrid.replace("/item_locations/", "");
            if (type == "two_hand" || type == "main_hand") {
                type = "weapon";
            }

            equipmentSet.equipment[type] = {
                equipment: item.itemHrid,
                enhancementLevel: item.enhancementLevel,
            };
        }

        equipmentSet.food = loadoutData.food['/action_types/combat'];
        equipmentSet.drinks = loadoutData.drinks['/action_types/combat'];

        for (let i = 0; i < 5; i++) {
            equipmentSet.abilities[i] = {
                ability: loadoutData.abilities[i].abilityHrid,
                level: Number(loadoutData.abilities[i].level),
            };
        }

        equipmentSet.triggerMap = loadoutData.triggerMap;

        equipmentSet.houseRooms = loadoutData.houseRooms;
        equipmentSet.achievements = loadoutData.achievements;
        equipmentSet.guildShrineLevels = loadoutData.guildShrineLevels || getGuildShrineLevels();

        return equipmentSet;
    }

    function saveLoadoutDatasIntoEquipmentSets(loadoutDatas) {
        let equipmentSets = JSON.parse(localStorage.getItem("equipmentSets")) ?? {};

        for (const loadName of Object.keys(loadoutDatas)) {
            equipmentSets[loadName] = convertDataToEquipmentSetsFormat(loadoutDatas[loadName]);
        }

        localStorage.setItem("equipmentSets", JSON.stringify(equipmentSets));
    }

    function constructSelfPlayerExportObjFromInitCharacterData(battlePlayer = null) {
        let data = GM_getValue("init_character_data");
        let obj = JSON.parse(data);

        let initData_abilityDetailMap = GM_getValue("initData_abilityDetailMap");

        const playerObj = {};
        playerObj.player = {};

        // Levels
        for (const skill of obj.characterSkills) {
            if (skill.skillHrid.includes("stamina")) {
                playerObj.player.staminaLevel = skill.level;
            } else if (skill.skillHrid.includes("intelligence")) {
                playerObj.player.intelligenceLevel = skill.level;
            } else if (skill.skillHrid.includes("attack")) {
                playerObj.player.attackLevel = skill.level;
            } else if (skill.skillHrid.includes("melee")) {
                playerObj.player.meleeLevel = skill.level;
            } else if (skill.skillHrid.includes("defense")) {
                playerObj.player.defenseLevel = skill.level;
            } else if (skill.skillHrid.includes("ranged")) {
                playerObj.player.rangedLevel = skill.level;
            } else if (skill.skillHrid.includes("magic")) {
                playerObj.player.magicLevel = skill.level;
            }
        }

        // Items
        playerObj.player.equipment = [];
        for (const item of obj.characterItems) {
            if (!item.itemLocationHrid.includes("/item_locations/inventory")) {
                playerObj.player.equipment.push({
                    itemLocationHrid: item.itemLocationHrid,
                    itemHrid: item.itemHrid,
                    enhancementLevel: item.enhancementLevel,
                });
            }
        }

        // Food
        playerObj.food = {};
        playerObj.food["/action_types/combat"] = [];
        for (const food of obj.actionTypeFoodSlotsMap["/action_types/combat"]) {
            if (food) {
                playerObj.food["/action_types/combat"].push({
                    itemHrid: food.itemHrid,
                });
            } else {
                playerObj.food["/action_types/combat"].push({
                    itemHrid: "",
                });
            }
        }

        // Drinks
        playerObj.drinks = {};
        playerObj.drinks["/action_types/combat"] = [];
        for (const drink of obj.actionTypeDrinkSlotsMap["/action_types/combat"]) {
            if (drink) {
                playerObj.drinks["/action_types/combat"].push({
                    itemHrid: drink.itemHrid,
                });
            } else {
                playerObj.drinks["/action_types/combat"].push({
                    itemHrid: "",
                });
            }
        }

        // Abilities
        playerObj.abilities = [
            {
                abilityHrid: "",
                level: "1",
            },
            {
                abilityHrid: "",
                level: "1",
            },
            {
                abilityHrid: "",
                level: "1",
            },
            {
                abilityHrid: "",
                level: "1",
            },
            {
                abilityHrid: "",
                level: "1",
            },
        ];
        let normalAbillityIndex = 1;
        for (const ability of obj.combatUnit.combatAbilities) {
            if (ability && initData_abilityDetailMap[ability.abilityHrid].isSpecialAbility) {
                playerObj.abilities[0] = {
                    abilityHrid: ability.abilityHrid,
                    level: ability.level,
                };
            } else if (ability) {
                playerObj.abilities[normalAbillityIndex++] = {
                    abilityHrid: ability.abilityHrid,
                    level: ability.level,
                };
            }
        }



        // TriggerMap
        playerObj.triggerMap = { ...obj.abilityCombatTriggersMap, ...obj.consumableCombatTriggersMap };

        // HouseRooms
        playerObj.houseRooms = {};
        for (const house of Object.values(obj.characterHouseRoomMap)) {
            playerObj.houseRooms[house.houseRoomHrid] = house.level;
        }

        // Achievements
        playerObj.achievements = {};
        for (const achievement of Object.values(obj.characterAchievements)) {
            playerObj.achievements[achievement.achievementHrid] = achievement.isCompleted;
        }
        playerObj.guildShrineLevels = getGuildShrineLevelsFromSource(battlePlayer) || getGuildShrineLevels();

        return playerObj;
    }

    function setupDefaultCombatConsumablesByWeapon(playerObj, weapon) {
        if (!weapon) {
            return;
        }

        if (weapon.includes("shooter") || weapon.includes("bow")) {
            // 远程
            // xp,超远,暴击
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/wisdom_coffee",
            });
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/super_ranged_coffee",
            });
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/critical_coffee",
            });
            // 2红1蓝
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/spaceberry_donut",
            });
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/spaceberry_cake",
            });
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/star_fruit_yogurt",
            });
        } else if (weapon.includes("boomstick") || weapon.includes("staff") || weapon.includes("trident")) {
            // 法师
            // xp,超魔,吟唱
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/wisdom_coffee",
            });
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/super_magic_coffee",
            });
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/channeling_coffee",
            });
            // 1红2蓝
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/spaceberry_cake",
            });
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/star_fruit_gummy",
            });
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/star_fruit_yogurt",
            });
        } else if (weapon.includes("bulwark")) {
            // 双手盾 精暮光
            // xp,超防,超耐
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/wisdom_coffee",
            });
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/super_defense_coffee",
            });
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/super_stamina_coffee",
            });
            // 2红1蓝
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/spaceberry_donut",
            });
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/spaceberry_cake",
            });
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/star_fruit_yogurt",
            });
        } else {
            // 战士
            // xp,超力,迅捷
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/wisdom_coffee",
            });
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/super_melee_coffee",
            });
            playerObj.drinks["/action_types/combat"].push({
                itemHrid: "/items/swiftness_coffee",
            });
            // 2红1蓝
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/spaceberry_donut",
            });
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/spaceberry_cake",
            });
            playerObj.food["/action_types/combat"].push({
                itemHrid: "/items/star_fruit_yogurt",
            });
        }
    }

    function constructPlayerExportObjFromProfile(profile, battlePlayer = null) {
        let initData_abilityDetailMap = GM_getValue("initData_abilityDetailMap");

        const playerObj = {};
        playerObj.player = {};

        // Levels
        for (const skill of profile.profile.characterSkills) {
            if (skill.skillHrid.includes("stamina")) {
                playerObj.player.staminaLevel = skill.level;
            } else if (skill.skillHrid.includes("intelligence")) {
                playerObj.player.intelligenceLevel = skill.level;
            } else if (skill.skillHrid.includes("attack")) {
                playerObj.player.attackLevel = skill.level;
            } else if (skill.skillHrid.includes("melee")) {
                playerObj.player.meleeLevel = skill.level;
            } else if (skill.skillHrid.includes("defense")) {
                playerObj.player.defenseLevel = skill.level;
            } else if (skill.skillHrid.includes("ranged")) {
                playerObj.player.rangedLevel = skill.level;
            } else if (skill.skillHrid.includes("magic")) {
                playerObj.player.magicLevel = skill.level;
            }
        }

        // Items
        playerObj.player.equipment = [];
        if (profile.profile.wearableItemMap) {
            for (const key in profile.profile.wearableItemMap) {
                const item = profile.profile.wearableItemMap[key];
                playerObj.player.equipment.push({
                    itemLocationHrid: item.itemLocationHrid,
                    itemHrid: item.itemHrid,
                    enhancementLevel: item.enhancementLevel,
                });
            }
        }

        // Food and drinks
        playerObj.food = {};
        playerObj.food["/action_types/combat"] = [];
        playerObj.drinks = {};
        playerObj.drinks["/action_types/combat"] = [];

        if (profile.profile?.combatConsumables) {
            for (const foodOrDrink of profile.profile.combatConsumables) {
                if (foodOrDrink.itemHrid.includes("coffee")) {
                    playerObj.drinks["/action_types/combat"].push({
                        itemHrid: foodOrDrink.itemHrid,
                    });
                } else {
                    playerObj.food["/action_types/combat"].push({
                        itemHrid: foodOrDrink.itemHrid,
                    });
                }
            }
        } else {
            // Assume food and drinks based on equipted weapon
            const weapon =
                profile.profile.wearableItemMap &&
                (profile.profile.wearableItemMap["/item_locations/main_hand"]?.itemHrid ||
                    profile.profile.wearableItemMap["/item_locations/two_hand"]?.itemHrid);
            setupDefaultCombatConsumablesByWeapon(playerObj, weapon);
        }

        // Abilities
        playerObj.abilities = [
            {
                abilityHrid: "",
                level: "1",
            },
            {
                abilityHrid: "",
                level: "1",
            },
            {
                abilityHrid: "",
                level: "1",
            },
            {
                abilityHrid: "",
                level: "1",
            },
            {
                abilityHrid: "",
                level: "1",
            },
        ];
        if (profile.profile.equippedAbilities) {
            let normalAbillityIndex = 1;
            for (const ability of profile.profile.equippedAbilities) {
                if (ability && initData_abilityDetailMap[ability.abilityHrid].isSpecialAbility) {
                    playerObj.abilities[0] = {
                        abilityHrid: ability.abilityHrid,
                        level: ability.level,
                    };
                } else if (ability) {
                    playerObj.abilities[normalAbillityIndex++] = {
                        abilityHrid: ability.abilityHrid,
                        level: ability.level,
                    };
                }
            }
        }

        // TriggerMap
        if (profile.profile.abilityCombatTriggersMap && profile.profile.consumableCombatTriggersMap) {
            playerObj.triggerMap = { ...profile.profile.abilityCombatTriggersMap, ...profile.profile.consumableCombatTriggersMap };
        }

        // HouseRooms
        playerObj.houseRooms = {};
        for (const house of Object.values(profile.profile.characterHouseRoomMap)) {
            playerObj.houseRooms[house.houseRoomHrid] = house.level;
        }

        // Achievements
        playerObj.achievements = {};
        for (const achievement of Object.values(profile.profile.characterAchievements)) {
            playerObj.achievements[achievement.achievementHrid] = achievement.isCompleted;
        }
        const guildShrineLevels = getGuildShrineLevelsFromSource(battlePlayer) || getGuildShrineLevelsFromSource(profile);
        if (guildShrineLevels) {
            playerObj.guildShrineLevels = guildShrineLevels;
        }

        return playerObj;
    }

    function get_sim_json(obj) {
        const checkElem = () => {
            const selectedElement = document.querySelector(`div.SharableProfile_overviewTab__W4dCV`);
            if (selectedElement) {
                clearInterval(timer);
                //获取模拟数据
                let exportObj = constructPlayerExportObjFromProfile(obj);

                let sim_json_value=JSON.stringify(exportObj);
                //按钮粘贴
                let button = document.createElement("button");
                selectedElement.appendChild(button);
                button.textContent = "获取模拟器导入数据";
                button.style.borderRadius = '5px';
                button.style.height = '30px';
                button.style.backgroundColor = '#4357AF';
                button.style.color = 'white';
                button.style.boxShadow = 'none';
                button.style.border = '0px';
                button.onclick = function () {
                    navigator.clipboard.writeText(sim_json_value);
                    button.textContent = "导入数据已粘贴到剪切板";
                    return false;
                };
                return false;
            };
        };
        let timer = setInterval(checkElem, 200);
    }

    function addImportButton1() {
        const checkElem = () => {
            const selectedElement = document.querySelector(`div[role="tablist"]`);
            if (selectedElement) {
                clearInterval(timer);
                console.log("Mooneycalc-Importer: Found elem");
                let button = document.createElement("button");
                selectedElement.parentNode.insertBefore(button, selectedElement.nextSibling);
                button.textContent = isZH
                    ? "导入人物数据 (左边的市场里可以改价差,设置里可启用茶)"
                : "Import character settings (Refresh game page to update character settings)";
                button.style.backgroundColor = "green";
                button.style.padding = "5px";
                button.onclick = function () {
                    console.log("Mooneycalc-Importer: Button onclick");
                    importData1(button);
                    return false;
                };
            }
        };
        let timer = setInterval(checkElem, 200);
    }

    async function importData1(button) {
        let data = GM_getValue("init_character_data");
        let obj = JSON.parse(data);

        if (!obj || !obj.characterSkills || !obj.currentTimestamp) {
            button.textContent = isZH ? "错误：没有人物数据" : "Error: no character settings found";
            button.textContent += "init_character_data";
            return;
        }

        let ls = constructMooneycalcLocalStorage(obj);
        localStorage.setItem("settings", ls);

        let timestamp = new Date(obj.currentTimestamp).getTime();
        let now = new Date().getTime();
        button.textContent = isZH
            ? "已导入，人物数据更新时间：" + timeReadable(now - timestamp) + " 前"
        : "Imported, updated " + timeReadable(now - timestamp) + " ago";

        await new Promise((r) => setTimeout(r, 500));
        location.reload();
    }

    function constructMooneycalcLocalStorage(obj) {
        const ls = localStorage.getItem("settings");
        let lsObj = JSON.parse(ls);

        if (!lsObj) {
            lsObj = {};
        }

        // 人物技能等级
        lsObj.state.settings.levels = {};
        for (const skill of obj.characterSkills) {
            lsObj.state.settings.levels[skill.skillHrid] = skill.level;
        }

        // 社区全局buff
        lsObj.state.settings.communityBuffs = {};
        for (const buff of obj.communityBuffs) {
            lsObj.state.settings.communityBuffs[buff.hrid] = buff.level;
        }

        // 装备 & 装备强化等级
        lsObj.state.settings.equipment = {};
        lsObj.state.settings.equipmentLevels = {};
        for (const item of obj.characterItems) {
            lsObj.state.settings.equipment[item.itemLocationHrid.replace("item_locations", "equipment_types")] = item.itemHrid;
            lsObj.state.settings.equipmentLevels[item.itemLocationHrid.replace("item_locations", "equipment_types")] = item.enhancementLevel;
        }

        // 房子
        lsObj.state.settings.houseRooms = {};
        for (const house of Object.values(obj.characterHouseRoomMap)) {
            lsObj.state.settings.houseRooms[house.houseRoomHrid] = house.level;
        }

        return JSON.stringify(lsObj);
    }

    function timeReadable(ms) {
        const d = new Date(1000 * Math.round(ms / 1000));
        function pad(i) {
            return ("0" + i).slice(-2);
        }
        let str = d.getUTCHours() + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
        console.log("Mooneycalc-Importer: " + str);
        return str;
    }

    function addImportButton4() {
        const checkElem = () => {
            const selectedElement = document.querySelector(`button#buttonImportExport`);
            if (selectedElement) {
                clearInterval(timer);
                console.log("Mooneycalc-Importer: Found elem");
                let profileArr = GM_getValue("profile_arr");

                generateComboList(profileArr);

                let button = document.createElement("button");
                selectedElement.parentNode.parentElement.parentElement.insertBefore(button, selectedElement.parentElement.parentElement.nextSibling);
                button.textContent = isZH
                    ? "导入人物数据(刷新游戏网页更新人物数据)"
                : "Import character settings (Refresh game page to update character settings)";
                button.style.backgroundColor = "green";
                button.style.padding = "5px";
                button.onclick = function () {
                    const getPriceButton = document.querySelector(`button#buttonGetPrices`);
                    if (getPriceButton) {
                        console.log("Click getPriceButton");
                        getPriceButton.click();
                    }

                    let checkedProfile = getSelectedValue()

                    importCombatSimData(button,checkedProfile);
                    return false;
                };

                let button2 = document.createElement("button");
                selectedElement.parentNode.parentElement.parentElement.insertBefore(button2, selectedElement.parentElement.parentElement.nextSibling);
                button2.textContent = isZH
                    ? "导入配装数据至装备方案(刷新游戏网页更新配装数据)"
                : "Import loadout settings (Refresh game page to update loadout settings)";
                button2.style.backgroundColor = "green";
                button2.style.padding = "5px";
                button2.onclick = function () {
                    const getPriceButton = document.querySelector(`button#buttonGetPrices`);
                    if (getPriceButton) {
                        console.log("Click getPriceButton");
                        getPriceButton.click();
                    }

                    let checkedProfile = getSelectedValue()

                    importLoadoutsData(button2,checkedProfile);
                    return false;
                };
            }
        };
        let timer = setInterval(checkElem, 200);
    }

    function getSelectedValue() {
        let select = document.getElementById("profile-combo-container");
        let selectedValue = select.value;
        return selectedValue;
    }

    async function importCombatSimData(button,checkedProfile) {
        let playerInfo = JSON.parse(GM_getValue("profile_"+ checkedProfile));

        let playerArr = [];
        if ( playerInfo.partyInfo ) {
            Object.values(playerInfo.partyInfo.partySlotMap).forEach((value,key) => { if (value.characterID) playerArr.push(playerInfo.partyInfo.sharableCharacterMap[value.characterID].name); });
        }else{
            playerArr.push(playerInfo.character.name)
        }

        let data = GM_getValue("team_battle_" + playerArr[0], "");

        let obj
        if (!data) {
            button.textContent = isZH ? "错误：没有人物数据" : "Error: no character settings found";
            button.textContent += " team_battle_" + playerArr[0];
            return;
        }else{
            obj = JSON.parse(data);
        }

        const jsonObj = constructImportJsonObj_team(obj,checkedProfile);
        if (!jsonObj) {
            button.textContent = isZH ? "错误：缺少队友人物数据" : "Error: missing party member data";
            return;
        }

        for(let i=1;i<=jsonObj.player_number;i++){
            const importInputElem = document.querySelector(`input#inputSetGroupCombatplayer`+i);
            importInputElem.value = JSON.stringify(jsonObj.players[i-1]);

            document.querySelector(`a#player${i}-tab`).textContent = playerArr[i-1];
        }
        document.querySelector(`button#buttonImportSet`).click();

        let timestamp = new Date(obj.combatStartTime).getTime();
        let now = new Date().getTime();
        button.textContent = isZH
            ? "已导入，人物数据更新时间：" + timeReadable(now - timestamp) + " 前"
        : "Character Imported, updated " + timeReadable(now - timestamp) + " ago";
    }

    async function importLoadoutsData(button,checkedProfile) {
        let playerInfo = JSON.parse(GM_getValue("profile_"+ checkedProfile));

        let loadoutDatas = constructLoadoutDatasFromPlayerInfo(playerInfo);

        saveLoadoutDatasIntoEquipmentSets(loadoutDatas);

        if (!loadoutDatas) {
            button.textContent = isZH ? "错误：没有配装数据" : "Error: no loadout settings found";
            button.textContent += " loadout_" + playerArr[0];
            return;
        }else{
            let timestamp = new Date(playerInfo.currentTimestamp).getTime();
            let now = new Date().getTime();
            button.textContent = isZH
                ? "已导入，配装数据更新时间：" + timeReadable(now - timestamp) + " 前"
            : "Loadout Imported, updated " + timeReadable(now - timestamp) + " ago";
        }
    }

    function generateComboList(profileArr) {
        const container = document.getElementById("profile-combo-container");
        if (!container) return;

        if (profileArr.length <= 0) return;
        profileArr.forEach(item => {

            let option = document.createElement("option");
            option.value = item;
            let labelText = item;
            let profile = GM_getValue("profile_"+ item);
            if (!profile) return;
            let playerInfo = JSON.parse(profile);
            let partyMember = [];

            if ( playerInfo?.partyInfo?.partySlotMap ){
                labelText += " Party:";
                Object.values(playerInfo.partyInfo.partySlotMap).forEach((value,key) => { if (value.characterID) partyMember.push(playerInfo.partyInfo.sharableCharacterMap[value.characterID].name); });
                labelText += partyMember.join(", ");
            }

            option.textContent = labelText;
            container.appendChild(option);
        })
    }


    function constructImportJsonObj_team(obj,checkedProfile) {
        let init_character_obj = JSON.parse(GM_getValue("profile_"+ checkedProfile));
        let exportObj = {};

        exportObj.player_number=obj.players.length;
        exportObj.players = {};

        //看一圈所有人配置
        for(let player_num=0;player_num<obj.players.length;player_num++ ){
            // Levels
            exportObj.players[player_num]={};
            exportObj.players[player_num].player={};
            // Items
            // HouseRooms
            exportObj.players[player_num].player.equipment = [];
            exportObj.players[player_num].houseRooms = {};
            if(obj.players[player_num].character.id==init_character_obj.character.id){
                exportObj.players[player_num] = constructSelfPlayerExportObjFromInitCharacterData(obj.players[player_num]);
            }else{
                //手动取装备数据
                const characterID = obj.players[player_num].character.id;
                let team_mate_str = GM_getValue("profile_character_" + characterID, "") || GM_getValue(obj.players[player_num].character.name, "");
                console.log("team_mate_str",team_mate_str);
                if (!team_mate_str) {
                    alert("请手动查看一下队友装备信息，当前缺失装备信息队友："+obj.players[player_num].character.name);
                    //    console.log( "不敢模拟点击，请手动查看一下队友装备信息，当前缺失装备信息队友："+obj.players[player_num].character.name);
                    return;
                }
                let team_mate_obj = JSON.parse(team_mate_str);
                console.log("team_mate_obj",team_mate_obj);
                const battlePlayer = obj.players[player_num];
                exportObj.players[player_num] = constructPlayerExportObjFromProfile(team_mate_obj, battlePlayer);
            }
        }
        // Zone
        let hasMap = false;
        for (const action of init_character_obj.characterActions) {
            if (
                action &&
                action.actionHrid.includes("/actions/combat/")
            ) {
                hasMap = true;
                exportObj.zone = action.actionHrid;
                break;
            }
        }
        if (!hasMap) {
            exportObj.zone = "/actions/combat/fly";
        }
        // SimulationTime
        exportObj.simulationTime = SCRIPT_SIMULATE_TIME;
        return exportObj;
    }

    async function observeResults() {
        let resultDiv = document.querySelector(`div.row`)?.querySelectorAll(`div.col-md-5`)?.[2]?.querySelector(`div.row > div.col-md-5`);
        if(document.URL.includes("mwisim.github.io")||document.URL.includes("simTest")){
            resultDiv = document.querySelectorAll(`div.row`)?.[1]?.querySelectorAll(`div.col-md-5`)?.[2]?.querySelector(`div.row > div.col-md-5`);
        }
        const deathDiv = document.querySelector(`div#simulationResultPlayerDeaths`);
        const expDiv = document.querySelector(`div#simulationResultExperienceGain`);
        const consumeDiv = document.querySelector(`div#simulationResultConsumablesUsed`);
        deathDiv.style.backgroundColor = "#FFEAE9";
        deathDiv.style.color = "black";
        expDiv.style.backgroundColor = "#CDFFDD";
        expDiv.style.color = "black";
        consumeDiv.style.backgroundColor = "#F0F8FF";
        consumeDiv.style.color = "black";

        let div = document.createElement("div");
        div.id = "tillLevel";
        div.style.backgroundColor = "#FFFFE0";
        div.style.color = "black";
        div.textContent = "";
        resultDiv.append(div);

        new MutationObserver((mutationsList) => {
            mutationsList.forEach((mutation) => {
                if (mutation.addedNodes.length >= 2) {
                    handleResult(mutation.addedNodes, div);
                }
            });
        }).observe(expDiv, { childList: true, subtree: true });
    }

    function handleResult(expNodes, parentDiv) {
        let perHourGainExp = {
            stamina: 0,
            intelligence: 0,
            attack: 0,
            power: 0,
            defense: 0,
            ranged: 0,
            magic: 0,
            melee: 0,
        };
        expNodes.forEach((expNodes) => {
            if (expNodes.textContent.includes("Stamina")||expNodes.textContent.includes("耐力")) {
                perHourGainExp.stamina = Number(expNodes.children[1].textContent);
            } else if (expNodes.textContent.includes("Intelligence")||expNodes.textContent.includes("智力")) {
                perHourGainExp.intelligence = Number(expNodes.children[1].textContent);
            } else if (expNodes.textContent.includes("Attack")||expNodes.textContent.includes("攻击")) {
                perHourGainExp.attack = Number(expNodes.children[1].textContent);
            } else if (expNodes.textContent.includes("Power")||expNodes.textContent.includes("力量")) {
                perHourGainExp.power = Number(expNodes.children[1].textContent);
            } else if (expNodes.textContent.includes("Defense")||expNodes.textContent.includes("防御")) {
                perHourGainExp.defense = Number(expNodes.children[1].textContent);
            } else if (expNodes.textContent.includes("Ranged")||expNodes.textContent.includes("远程")) {
                perHourGainExp.ranged = Number(expNodes.children[1].textContent);
            } else if (expNodes.textContent.includes("Magic")||expNodes.textContent.includes("魔法")) {
                perHourGainExp.magic = Number(expNodes.children[1].textContent);
            } else if (expNodes.textContent.includes("Melee")||expNodes.textContent.includes("近战")) {
                perHourGainExp.melee = Number(expNodes.children[1].textContent);
            }
        });

        let data = GM_getValue("init_character_data");

        let obj = JSON.parse(data);
        if (!obj || !obj.characterSkills || !obj.currentTimestamp) {
            console.error("handleResult no character localstorage");
            return;
        }

        let skillLevels = {};
        for (const skill of obj.characterSkills) {
            if (skill.skillHrid.includes("stamina")) {
                skillLevels.stamina = {};
                skillLevels.stamina.skillName = "Stamina";
                skillLevels.stamina.currentLevel = skill.level;
                skillLevels.stamina.currentExp = skill.experience;
            } else if (skill.skillHrid.includes("intelligence")) {
                skillLevels.intelligence = {};
                skillLevels.intelligence.skillName = "Intelligence";
                skillLevels.intelligence.currentLevel = skill.level;
                skillLevels.intelligence.currentExp = skill.experience;
            } else if (skill.skillHrid.includes("attack")) {
                skillLevels.attack = {};
                skillLevels.attack.skillName = "Attack";
                skillLevels.attack.currentLevel = skill.level;
                skillLevels.attack.currentExp = skill.experience;
            } else if (skill.skillHrid.includes("power")) {
                skillLevels.power = {};
                skillLevels.power.skillName = "Power";
                skillLevels.power.currentLevel = skill.level;
                skillLevels.power.currentExp = skill.experience;
            } else if (skill.skillHrid.includes("defense")) {
                skillLevels.defense = {};
                skillLevels.defense.skillName = "Defense";
                skillLevels.defense.currentLevel = skill.level;
                skillLevels.defense.currentExp = skill.experience;
            } else if (skill.skillHrid.includes("ranged")) {
                skillLevels.ranged = {};
                skillLevels.ranged.skillName = "Ranged";
                skillLevels.ranged.currentLevel = skill.level;
                skillLevels.ranged.currentExp = skill.experience;
            } else if (skill.skillHrid.includes("magic")) {
                skillLevels.magic = {};
                skillLevels.magic.skillName = "Magic";
                skillLevels.magic.currentLevel = skill.level;
                skillLevels.magic.currentExp = skill.experience;
            } else if (skill.skillHrid.includes("melee")) {
                skillLevels.melee = {};
                skillLevels.melee.skillName = "Melee";
                skillLevels.melee.currentLevel = skill.level;
                skillLevels.melee.currentExp = skill.experience;
            }
        }

        const skillNamesInOrder = ["stamina", "intelligence", "attack", "power", "melee", "defense", "ranged", "magic"];
        let hTMLStr = "";
        for (const skill of skillNamesInOrder) {
            if (!skillLevels[skill]) continue;
            hTMLStr += `<div id="${"inputDiv_" + skill}" style="display: flex; justify-content: flex-end">${skillLevels[skill].skillName}${
                isZH ? "到" : " to level "
        }<input id="${"input_" + skill}" type="number" value="${skillLevels[skill].currentLevel + 1}" min="${
                skillLevels[skill].currentLevel + 1
        }" max="200">${isZH ? "级" : ""}</div>`;
        }

        hTMLStr += `<div id="script_afterDays" style="display: flex; justify-content: flex-end"><input id="script_afterDays_input" type="number" value="1" min="0" max="200">${
            isZH ? "天后" : "days after"
    }</div>`;

        hTMLStr += `<div id="needDiv"></div>`;
        hTMLStr += `<div id="needListDiv"></div>`;
        parentDiv.innerHTML = hTMLStr;

        for (const skill of skillNamesInOrder) {
            if (!skillLevels[skill]) continue;
            const skillDiv = parentDiv.querySelector(`div#${"inputDiv_" + skill}`);
            const skillInput = parentDiv.querySelector(`input#${"input_" + skill}`);
            skillInput.onchange = () => {
                calculateTill(skill, skillInput, skillLevels, parentDiv, perHourGainExp);
            };
            skillInput.addEventListener("keyup", function (evt) {
                calculateTill(skill, skillInput, skillLevels, parentDiv, perHourGainExp);
            });
            skillDiv.onclick = () => {
                calculateTill(skill, skillInput, skillLevels, parentDiv, perHourGainExp);
            };
        }

        const daysAfterDiv = parentDiv.querySelector(`div#script_afterDays`);
        const daysAfterInput = parentDiv.querySelector(`input#script_afterDays_input`);
        daysAfterInput.onchange = () => {
            calculateAfterDays(daysAfterInput, skillLevels, parentDiv, perHourGainExp, skillNamesInOrder);
        };
        daysAfterInput.addEventListener("keyup", function (evt) {
            calculateAfterDays(daysAfterInput, skillLevels, parentDiv, perHourGainExp, skillNamesInOrder);
        });
        daysAfterDiv.onclick = () => {
            calculateAfterDays(daysAfterInput, skillLevels, parentDiv, perHourGainExp, skillNamesInOrder);
        };

        // 提取成本和收益
        const expensesSpan = document.querySelector(`span#expensesSpan`);
        const revenueSpan = document.querySelector(`span#revenueSpan`);
        const profitSpan = document.querySelector(`span#profitPreview`);
        const expenseDiv = document.querySelector(`div#script_expense`);
        const revenueDiv = document.querySelector(`div#script_revenue`);
        if (expenseDiv && expenseDiv) {
            expenseDiv.textContent = expensesSpan.parentNode.textContent;
            revenueDiv.textContent = revenueSpan.parentNode.textContent;
        } else {
            profitSpan.parentNode.insertAdjacentHTML(
                "beforeend",
                `<div id="script_expense" style="background-color: #DCDCDC; color: black;">${expensesSpan.parentNode.textContent}</div><div id="script_revenue" style="background-color: #DCDCDC; color: black;">${revenueSpan.parentNode.textContent}</div>`
            );
        }
    }

    function calculateAfterDays(daysAfterInput, skillLevels, parentDiv, perHourGainExp, skillNamesInOrder) {
        const initData_levelExperienceTable = GM_getValue("initData_levelExperienceTable");
        const days = Number(daysAfterInput.value);
        parentDiv.querySelector(`div#needDiv`).textContent = `${isZH ? "" : "After"} ${days} ${isZH ? "天后：" : "days: "}`;
        const listDiv = parentDiv.querySelector(`div#needListDiv`);

        let html = "";
        let resultLevels = {};
        for (const skillName of skillNamesInOrder) {
            for (const skill of Object.values(skillLevels)) {
                if (skill.skillName.toLowerCase() === skillName.toLowerCase()) {
                    const exp = skill.currentExp + perHourGainExp[skill.skillName.toLowerCase()] * days * 24;
                    let level = 1;
                    while (initData_levelExperienceTable[level] < exp) {
                        level++;
                    }
                    level--;
                    const minExpAtLevel = initData_levelExperienceTable[level];
                    const maxExpAtLevel = initData_levelExperienceTable[level + 1] - 1;
                    const expSpanInLevel = maxExpAtLevel - minExpAtLevel;
                    const levelPercentage = Number(((exp - minExpAtLevel) / expSpanInLevel) * 100).toFixed(1);
                    resultLevels[skillName.toLowerCase()] = level;
                    html += `<div>${skill.skillName} ${isZH ? "" : "level"} ${level} ${isZH ? "级" : ""} ${levelPercentage}%</div>`;
                    break;
                }
            }
        }
        const combatLevel =
              0.1 * (resultLevels.stamina + resultLevels.intelligence + resultLevels.defense + resultLevels.attack + Math.max(resultLevels.melee, resultLevels.ranged, resultLevels.magic)) +
              0.5 * Math.max(resultLevels.attack, resultLevels.defense, resultLevels.melee, resultLevels.ranged, resultLevels.magic);
        html += `<div>${isZH ? "战斗等级：" : "Combat level: "} ${combatLevel.toFixed(1)}</div>`;
        listDiv.innerHTML = html;
    }

    function calculateTill(skillName, skillInputElem, skillLevels, parentDiv, perHourGainExp) {
        const initData_levelExperienceTable = GM_getValue("initData_levelExperienceTable");
        const targetLevel = Number(skillInputElem.value);
        parentDiv.querySelector(`div#needDiv`).textContent = `${skillLevels[skillName].skillName} ${isZH ? "到" : "to level"} ${targetLevel} ${
            isZH ? "级 还需：" : " takes: "
    }`;
        const listDiv = parentDiv.querySelector(`div#needListDiv`);

        const currentLevel = Number(skillLevels[skillName].currentLevel);
        const currentExp = Number(skillLevels[skillName].currentExp);
        if (targetLevel > currentLevel && targetLevel <= 200) {
            if (perHourGainExp[skillName] === 0) {
                listDiv.innerHTML = isZH ? "永远" : "Forever";
            } else {
                let needExp = initData_levelExperienceTable[targetLevel] - currentExp;
                let needHours = needExp / perHourGainExp[skillName];
                let html = "";
                html += `<div>[${hoursToReadableString(needHours)}]</div>`;

                const consumeDivs = document.querySelectorAll(`div#simulationResultConsumablesUsed div.row`);
                for (const elem of consumeDivs) {
                    const conName = elem.children[0].textContent;
                    const conPerHour = Number(elem.children[1].textContent);
                    html += `<div>${conName} ${Number(conPerHour * needHours).toFixed(0)}</div>`;
                }

                listDiv.innerHTML = html;
            }
        } else {
            listDiv.innerHTML = isZH ? "输入错误" : "Input error";
        }
    }

    function hoursToReadableString(hours) {
        const sec = hours * 60 * 60;
        if (sec >= 86400) {
            return Number(sec / 86400).toFixed(1) + (isZH ? " 天" : " days");
        }
        const d = new Date(Math.round(sec * 1000));
        function pad(i) {
            return ("0" + i).slice(-2);
        }
        let str = d.getUTCHours() + "h " + pad(d.getUTCMinutes()) + "m " + pad(d.getUTCSeconds()) + "s";
        return str;
    }
})();
