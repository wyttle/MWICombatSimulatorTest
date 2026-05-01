// ==UserScript==
// @name         JIGS 魔改
// @namespace    http://tampermonkey.net/
// @version      30.171
// @description  Automates running multiple simulations on the MWI Combat Simulator with a dynamic, grouped UI and cost-analysis.
// @author       Gemini & Jigglymoose
// @license      MIT
// @match        https://shykai.github.io/MWICombatSimulatorTest/dist/
// @match        https://shykai.github.io/MWICombatSimulator/dist/
// @match        https://mwi.retard.icu/*
// @connect      gist.githubusercontent.com
// @connect      www.milkywayidle.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @downloadURL https://update.greasyfork.org/scripts/550346/JIGS%20%28Jigglymoose%27s%20Intelligent%20Gear%20Simulator%29.user.js
// @updateURL https://update.greasyfork.org/scripts/550346/JIGS%20%28Jigglymoose%27s%20Intelligent%20Gear%20Simulator%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // --- JIGS-ENVIRONMENT-CHECK ---
        const jigsAllowedUrls = ["http://localhost:9000/", "http://localhost:", "https://shykai.github.io/MWICombatSimulatorTest/dist/", "https://shykai.github.io/MWICombatSimulator/dist/","https://mwi.retard.icu/","https://wyttle.github.io/MWICombatSimulatorTest/"];
        if (!jigsAllowedUrls.some(url => window.location.href.startsWith(url))) {alert("JIGS (Jigglymoose's Intelligent Gear Simulator):\n\nThis script is running on the WRONG PAGE.\n\nJIGS is built for the 'shykai' combat simulator, not the main MWI game. Please delete this script for the main game in Steam.  Please reference the installation instructions here -> https://rentry.co/jigs-complete-insturctions");
        return; // Exit script
    }

    // --- END-CHECK ---

    console.log("JIGS (Jigglymoose's Intelligent Gear Simulator) v30.17 Loaded");

    // --- LANGUAGE SUPPORT ---
    const TRANSLATIONS = {
        en: {
            // Panel headers
            jigs: 'JIGS',
            results: 'Results',
            simulationQueue: 'Simulation Queue',

            // Buttons
            manualCapture: 'Manual Capture',
            importTriggers: 'Import Triggers',
            updateBaseline: 'Update Baseline',
            runQueue: 'Run Queue',
            addToQueue: 'Add to Queue',
            resetInputs: 'Reset Inputs',
            stop: 'Stop',
            clearResults: 'Clear Results',
            exportCsv: 'Export to CSV',
            clearQueue: 'Clear Queue',

            // Baseline labels
            baselineDps: 'Baseline DPS',
            baselineTeamDps: 'Baseline Team DPS',
            profitDay: 'Profit/Day',
            expHour: 'Exp/Hour',
            eph: 'EPH',
            dph: 'DPH',
            baseline: 'Baseline:',
            dps: 'DPS:',
            teamDps: 'Team DPS:',
            profit: 'Profit/Day:',
            exp: 'Exp/Hr:',

            // Column toggles
            showColumns: 'Show Columns:',
            timeToPurchase: 'Time to Purchase',
            dpsCol: 'DPS',
            profitCol: 'Profit',
            experienceCol: 'Experience',
            infinite: 'Infinite',

            // Table headers
            upgrade: 'Upgrade',
            upgradeCost: 'Upgrade Cost',
            dpsChange: 'DPS Change',
            percentDpsChange: '% DPS Change',
            goldPerDps: 'Gold per 0.01% DPS',
            teamDpsChange: 'Team DPS Change',
            percentTeamDpsChange: '% Team DPS Change',
            goldPerTeamDps: 'Gold per 0.01% Team DPS',
            profitChange: 'Profit Change',
            percentProfitChange: '% Profit Change',
            goldPerProfit: 'Gold per 0.01% Profit',
            expChange: 'Exp/Hr Change',
            percentExpChange: '% Exp/Hr Change',
            goldPerExp: 'Gold per 0.01% Exp/Hr',
            ephChange: 'EPH Change',
            percentEphChange: '% EPH Change',
            goldPerEph: 'Gold per 0.01% EPH',
            dphChange: 'DPH Change',
            percentDphChange: '% DPH Change',

            // Group headers
            simSettings: 'Simulation Settings',
            skills: 'Skills',
            equipment: 'Equipment',
            abilities: 'Abilities',
            foodDrink: 'Food & Drink',
            house: 'House',

            // Status messages
            statusLoadingData: 'Status: Loading game data...',
            statusReadingData: 'Status: Reading data and fetching market prices...',
            statusIdle: 'Status: Idle.',
            statusNoData: 'Status: No data found. Import or use Capture Setup.',
            statusReady: 'Status: Ready. Please import a character.',
            statusPanelReset: 'Status: Panel positions reset.',
            statusBaselineUpdated: 'Status: Baseline updated.',
            statusAllReset: 'Status: All inputs reset to baseline.',
            statusAddedToQueue: 'Status: Added',
            statusQueueEmpty: 'Status: Queue is empty. Add simulations first.',
            statusStopping: 'Status: Stopping...',
            statusStoppedByUser: 'Status: Stopped by user.',
            statusDone: 'Status: Done!',
            statusNoChanges: 'Status: No changes detected to add to queue.',
            statusSimulating: 'Status: Simulating',
            statusRestartingQueue: 'Status: Restarting queue...',
            statusImportingTriggers: 'Status: Importing triggers...',
            statusTriggerImportComplete: 'Status: Trigger import complete.',
            statusTriggerImportStopped: 'Status: Trigger import stopped by user.',
            statusApplyingSettings: 'Status: Applying settings and updating baseline...',
            statusImportingFor: 'Importing for',

            // Error messages
            errorNoResults: 'No results to export!',
            errorBaselineFailed: 'Error: Failed to update baseline. Try again.',
            errorNoBaseline: 'Error: Please set a baseline first.',
            errorTriggerImport: 'Error during trigger import. Check console.',

            // Other UI text
            selectPlayer: 'Select Player',
            trigger: 'Trigger:',
            range: 'Range:',
            increment: 'Increment:',
            multiplier: 'Multiplier',
            zone: 'Zone',
            dungeon: 'Dungeon',
            simulationMode: 'Simulation Mode',
            normalZone: 'Normal Zone',
            dungeonMode: 'Dungeon',
            difficulty: 'Difficulty',
            duration: 'Duration',
            dungeonCount: 'Dungeon Count',
            enhancement: 'Enhancement',
            level: 'Level',
            constantsOnly: 'Constants Only',
            books: 'books',
            hrs: 'hrs',
            days: 'days',
            mon: 'mon',
            min: 'min',
            never: 'Never',
            free: 'Free',
            noSeller: 'No Seller',
            autoPrice: 'Auto Price',

            // Tooltips
            tooltipResetPanels: 'Reset Panel Positions',
            tooltipImportTriggers: 'Check this to include trigger import during baseline update.',
            tooltipConstant: 'Include this change in every simulation',
            tooltipPriceOverride: 'Manual price override. Use "k", "m", "b". Clears on item/enh change.',
            tooltipUpgrade: 'The specific upgrade being tested',
            tooltipCost: 'The net cost of the upgrade.&#013;Formula: (New Item Buy Price - Old Item Sell Price)',
            tooltipTimeToPurchase: 'Estimated time to afford this upgrade.&#013;Formula: (Upgrade Cost / Baseline Profit Per Day)',
            tooltipDpsChange: 'The raw DPS increase from this change.&#013;Formula: New DPS - Baseline DPS',
            tooltipPercentChange: 'The percentage of DPS gained.&#013;Formula: (DPS Change / Baseline DPS) * 100',
            tooltipCostPerDps: 'Gold cost for every 0.01% increase in total DPS. Lower is better!&#013;Formula: (Upgrade Cost / % DPS Change) * 0.01',
            tooltipProfitChange: 'The raw profit increase from this change.&#013;Formula: New Profit - Baseline Profit',
            tooltipPercentProfitChange: 'The percentage of profit gained.&#013;Formula: (Profit Change / Baseline Profit) * 100',
            tooltipCostPerProfit: 'Gold cost for every 0.01% increase in total Profit. Lower is better!&#013;Formula: (Upgrade Cost / % Profit Change) * 0.01',
            tooltipExpChange: 'The raw experience per hour increase from this change.&#013;Formula: New Exp/Hr - Baseline Exp/Hr',
            tooltipPercentExpChange: 'The percentage of experience per hour gained.&#013;Formula: (Exp Change / Baseline Exp) * 100',
            tooltipCostPerExp: 'Gold cost for every 0.01% increase in total Exp/Hr. Lower is better!&#013;Formula: (Upgrade Cost / % Exp Change) * 0.01',
            tooltipEphChange: 'The raw EPH increase from this change.&#013;Formula: New EPH - Baseline EPH',
            tooltipPercentEphChange: 'The percentage of EPH gained.&#013;Formula: (EPH Change / Baseline EPH) * 100',
            tooltipCostPerEph: 'Gold cost for every 0.01% increase in total EPH. Lower is better!&#013;Formula: (Upgrade Cost / % EPH Change) * 0.01',
            tooltipDphChange: 'The raw DPH change from this change.&#013;Note: Negative is good!&#013;Formula: New DPH - Baseline DPH',
            tooltipPercentDphChange: 'The percentage of DPH changed.&#013;Formula: (DPH Change / Baseline DPH) * 100',

            // Queue messages
            estimatedTime: 'Estimated time:',
            estTimePerLoop: 'Est. time per loop:',
            simulationsToQueue: 'simulation(s) to queue.',
            loopRun: 'Loop Run, Total:',

            // Import messages
            importInitiated: 'Import initiated! Waiting for player names and initial sim...',
            couldNotDetectNames: 'Status: Could not detect player names. Please use Capture Setup.',
        },
        zh: {
            // 面板标题
            jigs: 'JIGS',
            results: '结果',
            simulationQueue: '模拟队列',

            // 按钮
            manualCapture: '手动捕获',
            importTriggers: '导入触发器',
            updateBaseline: '更新基准',
            runQueue: '运行队列',
            addToQueue: '添加到队列',
            resetInputs: '重置输入',
            stop: '停止',
            clearResults: '清除结果',
            exportCsv: '导出CSV',
            clearQueue: '清空队列',

            // 基准标签
            baselineDps: '基准 DPS',
            baselineTeamDps: '基准队伍 DPS',
            profitDay: '每日收益',
            expHour: '每小时经验',
            eph: '每小时遭遇',
            dph: '每小时死亡',
            baseline: '基准:',
            dps: 'DPS:',
            teamDps: '队伍 DPS:',
            profit: '每日收益:',
            exp: '每小时经验:',

            // 列切换
            showColumns: '显示列:',
            timeToPurchase: '购买时间',
            dpsCol: 'DPS',
            profitCol: '收益',
            experienceCol: '经验',
            infinite: '无限循环',

            // 表头
            upgrade: '升级项',
            upgradeCost: '升级成本',
            dpsChange: 'DPS 变化',
            percentDpsChange: 'DPS 变化率',
            goldPerDps: '每0.01% DPS金币',
            teamDpsChange: '队伍DPS 变化',
            percentTeamDpsChange: '队伍DPS 变化率',
            goldPerTeamDps: '每0.01%队伍DPS金币',
            profitChange: '收益变化',
            percentProfitChange: '收益变化率',
            goldPerProfit: '每0.01%收益金币',
            expChange: '经验/小时变化',
            percentExpChange: '经验变化率',
            goldPerExp: '每0.01%经验金币',
            ephChange: 'EPH 变化',
            percentEphChange: 'EPH 变化率',
            goldPerEph: '每0.01% EPH金币',
            dphChange: 'DPH 变化',
            percentDphChange: 'DPH 变化率',

            // 分组标题
            simSettings: '模拟设置',
            skills: '技能',
            equipment: '装备',
            abilities: '能力',
            foodDrink: '食物与饮料',
            house: '房屋',

            // 状态消息
            statusLoadingData: '状态: 正在加载游戏数据...',
            statusReadingData: '状态: 正在读取数据并获取市场价格...',
            statusIdle: '状态: 空闲。',
            statusNoData: '状态: 未找到数据。请导入或使用捕获设置。',
            statusReady: '状态: 就绪。请导入角色。',
            statusPanelReset: '状态: 面板位置已重置。',
            statusBaselineUpdated: '状态: 基准已更新。',
            statusAllReset: '状态: 所有输入已重置为基准。',
            statusAddedToQueue: '状态: 已添加',
            statusQueueEmpty: '状态: 队列为空。请先添加模拟。',
            statusStopping: '状态: 正在停止...',
            statusStoppedByUser: '状态: 已被用户停止。',
            statusDone: '状态: 完成!',
            statusNoChanges: '状态: 未检测到要添加到队列的更改。',
            statusSimulating: '状态: 正在模拟',
            statusRestartingQueue: '状态: 正在重启队列...',
            statusImportingTriggers: '状态: 正在导入触发器...',
            statusTriggerImportComplete: '状态: 触发器导入完成。',
            statusTriggerImportStopped: '状态: 触发器导入已被用户停止。',
            statusApplyingSettings: '状态: 正在应用设置并更新基准...',
            statusImportingFor: '正在导入',

            // 错误消息
            errorNoResults: '没有结果可导出!',
            errorBaselineFailed: '错误: 更新基准失败。请重试。',
            errorNoBaseline: '错误: 请先设置基准。',
            errorTriggerImport: '触发器导入期间出错。请查看控制台。',

            // 其他UI文本
            selectPlayer: '选择玩家',
            trigger: '触发器:',
            range: '范围:',
            increment: '增量:',
            multiplier: '倍数',
            zone: '区域',
            dungeon: '地下城',
            simulationMode: '模拟模式',
            normalZone: '普通区域',
            dungeonMode: '地下城',
            difficulty: '难度',
            duration: '持续时间',
            dungeonCount: '地下城轮数',
            enhancement: '强化',
            level: '等级',
            constantsOnly: '仅常量',
            books: '本书',
            hrs: '小时',
            days: '天',
            mon: '月',
            min: '分钟',
            never: '永不',
            free: '免费',
            noSeller: '无卖家',
            autoPrice: '自动价格',

            // 工具提示
            tooltipResetPanels: '重置面板位置',
            tooltipImportTriggers: '勾选此项以在基准更新期间包含触发器导入。',
            tooltipConstant: '在每次模拟中包含此更改',
            tooltipPriceOverride: '手动价格覆盖。使用 "k", "m", "b"。在物品/强化更改时清除。',
            tooltipUpgrade: '正在测试的特定升级',
            tooltipCost: '升级的净成本。&#013;公式: (新物品购买价 - 旧物品出售价)',
            tooltipTimeToPurchase: '负担此升级的预估时间。&#013;公式: (升级成本 / 基准每日收益)',
            tooltipDpsChange: '此更改的原始DPS增加。&#013;公式: 新DPS - 基准DPS',
            tooltipPercentChange: 'DPS获得的百分比。&#013;公式: (DPS变化 / 基准DPS) * 100',
            tooltipCostPerDps: '总DPS每增加0.01%的金币成本。越低越好!&#013;公式: (升级成本 / DPS变化率) * 0.01',
            tooltipProfitChange: '此更改的原始收益增加。&#013;公式: 新收益 - 基准收益',
            tooltipPercentProfitChange: '收益获得的百分比。&#013;公式: (收益变化 / 基准收益) * 100',
            tooltipCostPerProfit: '总收益每增加0.01%的金币成本。越低越好!&#013;公式: (升级成本 / 收益变化率) * 0.01',
            tooltipExpChange: '此更改的原始每小时经验增加。&#013;公式: 新经验/小时 - 基准经验/小时',
            tooltipPercentExpChange: '每小时经验获得的百分比。&#013;公式: (经验变化 / 基准经验) * 100',
            tooltipCostPerExp: '总经验/小时每增加0.01%的金币成本。越低越好!&#013;公式: (升级成本 / 经验变化率) * 0.01',
            tooltipEphChange: '此更改的原始EPH增加。&#013;公式: 新EPH - 基准EPH',
            tooltipPercentEphChange: 'EPH获得的百分比。&#013;公式: (EPH变化 / 基准EPH) * 100',
            tooltipCostPerEph: '总EPH每增加0.01%的金币成本。越低越好!&#013;公式: (升级成本 / EPH变化率) * 0.01',
            tooltipDphChange: '此更改的原始DPH变化。&#013;注意: 负值是好的!&#013;公式: 新DPH - 基准DPH',
            tooltipPercentDphChange: 'DPH变化的百分比。&#013;公式: (DPH变化 / 基准DPH) * 100',

            // 队列消息
            estimatedTime: '预计时间:',
            estTimePerLoop: '每循环预计时间:',
            simulationsToQueue: '个模拟到队列。',
            loopRun: '循环运行，总计:',

            // 导入消息
            importInitiated: '导入已启动! 等待玩家名称和初始模拟...',
            couldNotDetectNames: '状态: 无法检测到玩家名称。请使用捕获设置。',
        }
    };

    // Detect language from website's i18next or browser language
    let currentLang = 'en';

    // Function to get current language
    const getCurrentLanguage = () => {
        if (typeof i18next !== 'undefined' && i18next.language) {
            return i18next.language.startsWith('zh') ? 'zh' : 'en';
        }
        const browserLang = navigator.language || navigator.userLanguage;
        return browserLang.startsWith('zh') ? 'zh' : 'en';
    };

    currentLang = getCurrentLanguage();

    // Translation helper function - now dynamically gets current language
    const t = (key) => {
        const lang = getCurrentLanguage();
        return TRANSLATIONS[lang][key] || TRANSLATIONS['en'][key] || key;
    };

    // --- CONFIGURATION ---
    const MARKET_API_URL = 'https://www.milkywayidle.com/game_data/marketplace.json';
    const JIGS_DATA_URL = 'https://gist.githubusercontent.com/JigglyMoose/79db9d275a73a26dec30305865692525/raw/jigs_data.json';

    // --- DATA VARIABLES ---
    let HOUSE_RECIPES = {};
    let ITEM_ID_TO_NAME_MAP = {};
    let SPELL_BOOK_XP = {};
    let SIMULATOR_TO_MARKET_MAP = {};
    let ABILITY_XP_LEVELS = [];
    let baselineDps = 0;
    let baselineTeamDps = 0;
    let baselineProfit = 0;
    let baselineExp = 0;
    let baselineEph = 0;
    let baselineDph = 0;
    let baselineSkillXpRates = {};
    let baselineRunTime = 0;
    let marketData = null;
    let isBatchRunning = false;
    let detailedResults = [];
    let simulationQueue = [];
    let jigsNameToPageElementMap = new Map();
    const skillKeywords = ["Stamina", "Intelligence", "Attack", "Melee", "Defense", "Ranged", "Magic"];
    const equipmentKeywords = ["Head", "Necklace", "Earrings", "Body", "Legs", "Feet", "Hands", "Ring", "Main Hand", "Off Hand", "Pouch", "Back", "Charm"];
    const specialIdMap = { 'Zone': 'selectZone', 'Dungeon': 'selectDungeon', 'Difficulty': 'selectDifficulty', 'Duration': 'inputSimulationTime', 'Dungeon Count': 'inputDungeonCount' };
    let houseKeywords = [];

    // Mapping from JIGS names to data-i18n attributes (for language-independent element finding)
    const nameToI18nMap = {
        // Skills
        'Stamina': 'skillNames./skills/stamina',
        'Intelligence': 'skillNames./skills/intelligence',
        'Attack': 'skillNames./skills/attack',
        'Melee': 'skillNames./skills/melee',
        'Defense': 'skillNames./skills/defense',
        'Ranged': 'skillNames./skills/ranged',
        'Magic': 'skillNames./skills/magic',
        // Equipment
        'Head': 'characterItemsUtil.head',
        'Necklace': 'characterItemsUtil.neck',
        'Earrings': 'characterItemsUtil.earrings',
        'Body': 'characterItemsUtil.body',
        'Legs': 'characterItemsUtil.legs',
        'Feet': 'characterItemsUtil.feet',
        'Hands': 'characterItemsUtil.hands',
        'Ring': 'characterItemsUtil.ring',
        'Main Hand': 'characterItemsUtil.mainHand',
        'Off Hand': 'characterItemsUtil.offHand',
        'Pouch': 'characterItemsUtil.pouch',
        'Back': 'characterItemsUtil.back',
        'Charm': 'characterItemsUtil.charm',
        // Simulation Settings
        'Zone': 'party.selectZone',
        'Dungeon': 'shopCategoryNames./shop_categories/dungeon',
        'Difficulty': 'party.difficulty',
        'Duration': 'skillActionDetail.duration',
        // Enhancement/Level (for equipment and abilities)
        'Enhancement': 'marketplacePanel.enhancementLevel',
        'Level': 'leaderboardPanel.level',
        // Ability/Food/Drink
        'Special Ability': 'ability.specialAbility',
        'Ability': 'ability.ability',
        'Food': 'consumableSlot.food',
        'Drink': 'consumableSlot.drink'
    };

    // Reverse mapping from i18n key to English name
    const i18nToNameMap = {};
    for (const [name, i18nKey] of Object.entries(nameToI18nMap)) {
        i18nToNameMap[i18nKey] = name;
    }

    // --- 1. UI & STYLES ---
    const controlsPanel = document.createElement('div');
    controlsPanel.id = 'batch-panel';
controlsPanel.innerHTML = `
        <div id="batch-header" title="Jigglymoose's Intelligent Gear Simulator">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span>${t('jigs')}</span>
                <a id="jigs-kofi-button" href="https://ko-fi.com/jigglymoose" target="_blank" title="Help keep JIGS updated!  Fuel the Moose with a coffee.">☕</a>
            </div>
            <div id="jigs-header-buttons">
                <button id="reset-panels-button" title="${t('tooltipResetPanels')}">⟲</button>
                <button id="batch-toggle">-</button>
            </div>
        </div>
        <div id="batch-content">
            <div id="controls-grid">
                <button id="capture-setup-button" disabled>${t('manualCapture')}</button>
                <div id="import-triggers-wrapper">
                    <input type="checkbox" id="import-triggers-checkbox" title="${t('tooltipImportTriggers')}">
                    <label for="import-triggers-checkbox">${t('importTriggers')}</label>
                </div>
                <button id="update-baseline-button" disabled>${t('updateBaseline')}</button>
                <div id="baseline-container">
                    <label for="baseline-dps-input">${t('baselineDps')}</label><input type="text" id="baseline-dps-input" value="0">
                    <label for="baseline-team-dps-input">${t('baselineTeamDps')}</label><input type="text" id="baseline-team-dps-input" value="0">
                    <label for="baseline-profit-input">${t('profitDay')}</label><input type="text" id="baseline-profit-input" value="0">
                    <label for="baseline-exp-input">${t('expHour')}</label><input type="text" id="baseline-exp-input" value="0">
                    <label for="baseline-eph-input">${t('eph')}</label><input type="text" id="baseline-eph-input" value="0">
                    <label for="baseline-dph-input">${t('dph')}</label><input type="text" id="baseline-dph-input" value="0">
                </div>
                <div id="jigs-baseline-results-display" style="grid-column: 1 / -1; border: 1px solid #555; padding: 5px; margin-top: 5px; display: none !important;">
    <strong>${t('baseline')}</strong>
    <table id="base-results-table" style="width: 100%; font-size: 0.9em; margin-top: 5px;">
        <tr>
            <td>${t('dps')}</td><td id="base-dps" style="text-align: right;">N/A</td>
            <td>${t('teamDps')}</td><td id="base-team-dps" style="text-align: right;">N/A</td>
            <td>${t('profit')}</td><td id="base-profit" style="text-align: right;">N/A</td>
            <td>${t('exp')}</td><td id="base-exp" style="text-align: right;">N/A</td>
            <td>${t('eph')}:</td><td id="base-eph" style="text-align: right;">N/A</td>
            <td>${t('dph')}:</td><td id="base-dph" style="text-align: right;">N/A</td>
        </tr>
    </table>
</div>
                <button id="run-batch-button" disabled>${t('runQueue')}</button>
                <div id="queue-actions-group">
                    <button id="add-to-queue-button" disabled>${t('addToQueue')}</button>
                    <button id="reset-button" disabled>${t('resetInputs')}</button>
                </div>
                <button id="stop-batch-button" style="display: none;">${t('stop')}</button>
            </div>
            <div id="batch-status">${t('statusLoadingData')}</div>
            <div id="jigs-progress-container" style="display: none;">
                <div id="jigs-progress-bar"></div>
            </div>
            <div id="batch-inputs-container">
                 <div id="jigs-player-select-container"></div>
                <details id="sim-settings-group" open><summary>${t('simSettings')}</summary></details>
                <details id="skills-group" open><summary>${t('skills')}</summary></details>
                <details id="equipment-group" open><summary>${t('equipment')}</summary></details>
                <details id="abilities-group" open><summary>${t('abilities')}</summary></details>
                <details id="food-drink-group" open><summary>${t('foodDrink')}</summary></details>
                <details id="house-group" open><summary>${t('house')}</summary><div id="house-grid-container"></div></details>
            </div>
        </div>
        <div class="jigs-resizer"></div>
    `;
    document.body.appendChild(controlsPanel);

const resultsPanel = document.createElement('div');
    resultsPanel.id = 'jigs-results-panel';
    resultsPanel.innerHTML = `
        <div id="jigs-results-header">
            <span>${t('results')}</span>
            <div style="display: flex; gap: 5px;">
                <button id="reset-panels-button-results" title="${t('tooltipResetPanels')}">⟲</button>
                <button id="results-toggle">-</button>
            </div>
        </div>
        <div id="jigs-results-content">
             <div id="column-toggle-container">
                  <button id="clear-results-button">${t('clearResults')}</button>
                  <div id="column-checkboxes">
                        ${t('showColumns')}
                        <label><input type="checkbox" class="column-toggle" data-col="ttp-col" checked> ${t('timeToPurchase')}</label>
                        <label><input type="checkbox" class="column-toggle" data-col="dps-col" checked> ${t('dpsCol')}</label>
                        <label><input type="checkbox" class="column-toggle" data-col="team-dps-col" checked> Team ${t('dpsCol')}</label>
                        <label><input type="checkbox" class="column-toggle" data-col="profit-col" checked> ${t('profitCol')}</label>
                        <label><input type="checkbox" class="column-toggle" data-col="exp-col" checked> ${t('experienceCol')}</label>
                        <label><input type="checkbox" class="column-toggle" data-col="eph-col" checked> ${t('eph')}</label>
                        <label><input type="checkbox" class="column-toggle" data-col="dph-col" checked> ${t('dph')}</label>
                  </div>
                  <button id="export-csv-button" disabled>${t('exportCsv')}</button>
             </div>
            <div id="batch-results-container">
                <table id="batch-results-table">
                    <thead>
                        <tr>
                            <th class="upgrade-col" data-sort-key="upgrade" title="${t('tooltipUpgrade')}">${t('upgrade')}</th>
                            <th class="cost-col" data-sort-key="cost" title="${t('tooltipCost')}">${t('upgradeCost')}</th>
                            <th class="ttp-col" data-sort-key="timeToPurchase" title="${t('tooltipTimeToPurchase')}">${t('timeToPurchase')}</th>
                            <th class="dps-col" data-sort-key="dpsChange" title="${t('tooltipDpsChange')}">${t('dpsChange')}</th>
                            <th class="dps-col" data-sort-key="percentChange" title="${t('tooltipPercentChange')}">${t('percentDpsChange')}</th>
                            <th class="dps-col" data-sort-key="costPerDps" title="${t('tooltipCostPerDps')}">${t('goldPerDps')}</th>
                            <th class="team-dps-col" data-sort-key="teamDpsChange" title="Team DPS Change">${t('teamDpsChange')}</th>
                            <th class="team-dps-col" data-sort-key="percentTeamDpsChange" title="% Team DPS Change">${t('percentTeamDpsChange')}</th>
                            <th class="team-dps-col" data-sort-key="costPerTeamDps" title="Gold per 0.01% Team DPS">${t('goldPerTeamDps')}</th>
                            <th class="profit-col" data-sort-key="profitChange" title="${t('tooltipProfitChange')}">${t('profitChange')}</th>
                            <th class="profit-col" data-sort-key="percentProfitChange" title="${t('tooltipPercentProfitChange')}">${t('percentProfitChange')}</th>
                            <th class="profit-col" data-sort-key="costPerProfit" title="${t('tooltipCostPerProfit')}">${t('goldPerProfit')}</th>
                            <th class="exp-col" data-sort-key="expChange" title="${t('tooltipExpChange')}">${t('expChange')}</th>
                            <th class="exp-col" data-sort-key="percentExpChange" title="${t('tooltipPercentExpChange')}">${t('percentExpChange')}</th>
                            <th class="exp-col" data-sort-key="costPerExp" title="${t('tooltipCostPerExp')}">${t('goldPerExp')}</th>
                            <th class="eph-col" data-sort-key="ephChange" title="${t('tooltipEphChange')}">${t('ephChange')}</th>
                            <th class="eph-col" data-sort-key="percentEphChange" title="${t('tooltipPercentEphChange')}">${t('percentEphChange')}</th>
                            <th class="eph-col" data-sort-key="costPerEph" title="${t('tooltipCostPerEph')}">${t('goldPerEph')}</th>
                            <th class="dph-col" data-sort-key="dphChange" title="${t('tooltipDphChange')}">${t('dphChange')}</th>
                            <th class="dph-col" data-sort-key="percentDphChange" title="${t('tooltipPercentDphChange')}">${t('percentDphChange')}</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
        <div class="jigs-resizer"></div>
    `;
    document.body.appendChild(resultsPanel);

const queuePanel = document.createElement('div');
    queuePanel.id = 'jigs-queue-panel';
    queuePanel.innerHTML = `
        <div id="jigs-queue-header">
            <span>${t('simulationQueue')}</span>
            <div style="display: flex; gap: 5px;">
                <button id="reset-panels-button-queue" title="${t('tooltipResetPanels')}">⟲</button>
                <button id="queue-toggle">-</button>
            </div>
        </div>
        <div id="jigs-queue-content">
             <div id="jigs-queue-estimate"></div>
             <div id="jigs-queue-actions">
                <button id="clear-queue-button">${t('clearQueue')}</button>
                <label id="infinite-run-label"><input type="checkbox" id="infinite-queue-checkbox"> ${t('infinite')}</label>
             </div>
             <ul id="jigs-queue-list"></ul>
        </div>
        <div class="jigs-resizer"></div>
    `;
    document.body.appendChild(queuePanel);

    GM_addStyle(`
        #batch-panel { position: fixed; bottom: 10px; right: 10px; width: 600px; max-height: 90vh; background-color: #2c2c2c; border: 1px solid #444; border-radius: 5px; color: #eee; z-index: 9999; font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden; }
        #jigs-results-panel { position: fixed; bottom: 10px; left: 10px; width: 1050px; max-height: 90vh; background-color: #2c2c2c; border: 1px solid #444; border-radius: 5px; color: #eee; z-index: 9998; font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden; }
        #jigs-queue-panel { position: fixed; top: 10px; right: 10px; width: 600px; height: 300px; max-height: 45vh; background-color: #2c2c2c; border: 1px solid #444; border-radius: 5px; color: #eee; z-index: 9997; font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden; }
        #jigs-results-header, #jigs-queue-header { background-color: #333; padding: 8px; cursor: move; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; }
        #jigs-results-header span, #jigs-queue-header span { font-weight: bold; }
        #results-toggle, #queue-toggle { background: #555; border: 1px solid #777; color: white; border-radius: 3px; cursor: pointer; margin-left: 5px; }
        #jigs-results-content, #jigs-queue-content { padding: 10px; display: flex; flex-direction: column; overflow-y: auto; }
        #jigs-queue-list { list-style: decimal; padding-left: 20px; margin: 10px 0 0; font-size: 0.9em; }
        #jigs-queue-estimate { text-align: center; font-style: italic; color: #ccc; margin-bottom: 10px; }
        #jigs-queue-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        #infinite-run-label { display: flex; align-items: center; gap: 5px; font-size: 0.9em; cursor: pointer; }
        #clear-queue-button { background-color: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
        #batch-header { background-color: #333; padding: 8px; cursor: move; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; }
        #batch-header span { font-weight: bold; }
        #jigs-header-buttons { display: flex; gap: 5px; }
        #jigs-kofi-button {
            text-decoration: none;
            font-size: 1.2em;
            color: #FF5E5B; /* Ko-fi Red */
            transition: transform 0.2s;
            cursor: pointer;
            filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
        }
        #jigs-kofi-button:hover {
            transform: scale(1.2);
            filter: drop-shadow(0 0 4px #FF5E5B);
        }
        #batch-toggle, #reset-panels-button, #reset-panels-button-results, #reset-panels-button-queue { background: #555; border: 1px solid #777; color: white; border-radius: 3px; cursor: pointer; }
        #batch-content { padding: 10px; display: flex; flex-direction: column; overflow-y: auto; position: relative; }
        .jigs-resizer { position: absolute; width: 12px; height: 12px; right: 0; bottom: 0; cursor: se-resize; }
        #batch-panel.jigs-minimized, #jigs-results-panel.jigs-minimized, #jigs-queue-panel.jigs-minimized { height: auto !important; width: auto !important; bottom: auto !important; left: auto !important; right: 10px !important; }
        #batch-panel.jigs-minimized #batch-content, #jigs-results-panel.jigs-minimized #jigs-results-content, #jigs-queue-panel.jigs-minimized #jigs-queue-content { display: none; }
        #batch-panel.jigs-minimized .jigs-resizer, #jigs-results-panel.jigs-minimized .jigs-resizer, #jigs-queue-panel.jigs-minimized .jigs-resizer { display: none; }
        #batch-panel.jigs-minimized { top: 10px !important; }
        #jigs-results-panel.jigs-minimized { top: 60px !important; }
        #jigs-queue-panel.jigs-minimized { top: 110px !important; }
        #controls-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: auto auto; gap: 8px; margin-bottom: 10px; }
        #stop-batch-button { background-color: #c9302c; grid-column: 2 / 3; grid-row: 2/3;}
        #controls-grid button { width: 100%; padding: 8px; color: white; border: none; border-radius: 4px; cursor: pointer; }
        #capture-setup-button { grid-column: 1 / 2; grid-row: 1 / 2; }
        #import-triggers-wrapper { grid-column: 2 / 3; grid-row: 1 / 2; display: flex; align-items: center; justify-content: center; font-size: 0.9em; }
        #update-baseline-button { grid-column: 3 / 4; grid-row: 1 / 2; }
        #baseline-container { grid-column: 1 / 2; grid-row: 2 / 3; display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; align-items: center; font-size: 0.9em; color: #ccc; }
        #baseline-container input { background-color: #1e1e1e; color: #ddd; border: 1px solid #555; width: 100%; box-sizing: border-box; text-align: right; padding: 2px 4px; }
        #jigs-baseline-results-display {
        grid-column: 1 / -1;
        border: 1px solid #555;
        padding: 5px;
        margin-top: 5px;
        display: none !important;}
        #run-batch-button { grid-column: 2 / 3; grid-row: 2 / 3; }
        #queue-actions-group { grid-column: 3 / 4; grid-row: 2 / 3; display: flex; gap: 5px; }
        #queue-actions-group > button { flex: 1; }
        #capture-setup-button { background-color: #337ab7; }
        #update-baseline-button { background-color: #f44336; }
        #run-batch-button { background-color: #4CAF50; }
        #add-to-queue-button { background-color: #6f42c1; }
        #reset-button { background-color: #f0ad4e; }
        #run-batch-button:disabled, #capture-setup-button:disabled, #update-baseline-button:disabled, #export-csv-button:disabled, #reset-button:disabled, #add-to-queue-button:disabled, #import-triggers-checkbox:disabled { cursor: not-allowed; }
        #run-batch-button:disabled, #capture-setup-button:disabled, #update-baseline-button:disabled, #export-csv-button:disabled, #reset-button:disabled, #add-to-queue-button:disabled { background-color: #555; }
        #batch-status { margin-bottom: 5px; font-style: italic; color: #aaa; text-align: center; }
        #jigs-progress-container { width: 100%; background-color: #555; border-radius: 5px; height: 10px; margin-bottom: 10px; border: 1px solid #333; }
        #jigs-progress-bar { width: 0%; height: 100%; background-color: #4CAF50; border-radius: 5px; transition: width 0.1s linear; }
        #batch-inputs-container { display: flex; flex-direction: column; gap: 5px; max-height: 70vh; overflow-y: auto; border: 1px solid #444; padding: 10px; margin-bottom: 10px; }
        #jigs-player-select-container { display: grid; grid-template-columns: 100px 1fr; align-items: center; margin-bottom: 10px; gap: 5px; padding-bottom: 10px; border-bottom: 1px solid #444;}
        summary { font-weight: bold; cursor: pointer; padding: 4px; background-color: #333; margin-bottom: 5px; }
        details { border-left: 1px solid #444; padding-left: 10px; margin-bottom: 5px;}
        .batch-input-row { display: grid; grid-template-columns: 100px 1fr auto; align-items: center; margin-bottom: 5px; gap: 5px; }
        .batch-input-row-equip { display: grid; grid-template-columns: 60px 1fr 80px auto; grid-template-rows: auto auto; align-items: center; margin-bottom: 10px; row-gap: 5px; column-gap: 5px; }
        .batch-input-row-ability { display: grid; grid-template-columns: 60px 1fr 80px auto; align-items: center; margin-bottom: 5px; gap: 5px; }
        .batch-input-row label, .batch-input-row-equip > label, .batch-input-row-ability > label { font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; grid-row: 1; }
        .batch-input-row select, .batch-input-row input, .batch-input-row-equip > select, .batch-input-row-equip > input[type=number], .batch-input-row-ability > select, .batch-input-row-ability > input { background-color: #1e1e1e; color: #ddd; border: 1px solid #555; width: 100%; box-sizing: border-box; }
        .price-info-container { grid-column: 2 / 4; grid-row: 2 / 3; display: flex; align-items: center; gap: 10px; }
        .jigs-price-override { width: 90px !important; background-color: #1e1e1e; color: #ddd; border: 1px solid #555; box-sizing: border-box; text-align: right; padding: 2px 4px; }
        .constant-checkbox-container { display: flex; align-items: center; justify-content: center; padding: 0 5px; grid-row: 1; grid-column: 4; }
        .market-indicators { flex-grow: 1; display: flex; flex-wrap: wrap; gap: 4px; }
        .market-dot { background-color: #555; color: #ddd; font-size: 0.8em; padding: 1px 5px; border-radius: 4px; cursor: pointer; border: 1px solid #777; }
        .market-dot:hover { background-color: #777; border-color: #999; }
        .market-dot.selected { border-color: #28a745 !important; border-width: 2px !important; padding: 0px 4px !important; }
        .jigs-modified { border-left: 3px solid #f0ad4e !important; }
        #house-grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .house-grid-item { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 4px 8px; }
        .house-grid-item label { grid-column: 1 / -1; font-size: 0.8em; margin-bottom: 4px; height: 2.5em; overflow: hidden; text-align: center; }
        .house-grid-item input { grid-column: 1 / 2; width: 100%; text-align: center; }
        .house-grid-item .constant-checkbox-container { grid-column: 2 / 3; grid-row: 2 / 3; }
        #column-toggle-container { margin: 5px 0 10px 0; display: flex; justify-content: space-between; align-items: center; font-size: 0.9em; }
        #column-checkboxes { display: flex; gap: 15px; flex-wrap: wrap; justify-content: center; align-items: center; }
        #clear-results-button, #export-csv-button { padding: 4px 8px; color: white; border: none; border-radius: 4px; cursor: pointer; }
        #export-csv-button { background-color: #5bc0de; }
        #export-csv-button:hover { background-color: #46b8da; }
        #clear-results-button { background-color: #dc3545; }
        #clear-results-button:hover { background-color: #c82333; }
        #batch-results-container { margin-top: 10px; max-height: 80vh; overflow-y: auto; }
        #batch-results-table { width: 100%; border-collapse: collapse; }
        #batch-results-table td.best-upgrade { background-color: #28a745 !important; color: #fff !important; }
        #batch-results-table td.worst-upgrade { background-color: #dc3545 !important; color: #fff !important; }
        #batch-results-table th, #batch-results-table td { border: 1px solid #444; padding: 5px; text-align: left; font-size: 0.9em; }
        #batch-results-table th { background-color: #333; cursor: pointer; position: sticky; top: 0; z-index: 1; }
        #batch-results-table th:hover { background-color: #444; }
        .sorted-asc::after { content: ' ▲'; }
        .sorted-desc::after { content: ' ▼'; }
        .trigger-container { margin-left: 20px; margin-bottom: 10px; padding-top: 5px; border-top: 1px solid #444; }
        .trigger-row, .trigger-range-row { display: grid; grid-template-columns: 60px 1fr 1fr 1fr 1fr; gap: 5px; align-items: center; }
        .trigger-row label { font-size: 0.9em; font-style: italic; }
        .trigger-range-row { margin-top: 5px; grid-template-columns: 60px auto 1fr auto 1fr; }
        .trigger-range-row .jigs-range-label, .trigger-range-row .jigs-increment-label { font-size: 0.8em; font-style: italic; text-align: right; padding-right: 5px; }
        .trigger-row select, .trigger-row input, .trigger-range-row input { background-color: #1e1e1e; color: #ddd; border: 1px solid #555; width: 100%; box-sizing: border-box; }
        #jigs-queue-list li {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
        }
        .jigs-queue-item-label {
            flex-grow: 1;
            padding-right: 10px;
            word-break: break-all;
        }
        .jigs-remove-queue-item-button {
            background-color: #c9302c;
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-weight: bold;
            width: 20px;
            height: 20px;
            line-height: 20px;
            text-align: center;
            padding: 0;
            flex-shrink: 0;
        }
        .jigs-remove-queue-item-button:hover {
            background-color: #dc3545;
        }
    `);

    // --- 3. HELPER FUNCTIONS ---
    const statusDiv = document.getElementById('batch-status');
    const groupContainers = { skills: document.querySelector('#skills-group'), house: document.querySelector('#house-grid-container'), abilities: document.querySelector('#abilities-group'), equipment: document.querySelector('#equipment-group'), food: document.querySelector('#food-drink-group'), sim: document.querySelector('#sim-settings-group'), };

    // 提取的重复代码 - 查找选项（完全等价于原始逻辑）
    function findOptionByI18nOrText(selectElement, targetValue) {
        return Array.from(selectElement.options).find(o => {
            const i18nKey = o.getAttribute('data-i18n');
            if (i18nKey && typeof i18next !== 'undefined') {
                try {
                    const englishName = i18next.t(i18nKey, { lng: 'en' });
                    if (englishName === targetValue) return true;
                } catch (e) {}
            }
            return o.text === targetValue;
        });
    }

    // 提取的重复代码 - 百分比计算（完全等价于原始逻辑）
    function calcPercentChange(change, baseline) {
        return (baseline > 0) ? (change / baseline) * 100 : (change > 0 ? Infinity : 0);
    }

    // 提取的重复代码 - 成本计算（完全等价于原始逻辑）
    function calcCostPerPercent(totalCost, percentChange, gain) {
        return (percentChange > 0 && isFinite(totalCost) && totalCost !== 0)
            ? (totalCost / percentChange) * 0.01
            : (totalCost === 0 && gain > 0 ? "Free" : "N/A");
    }

    function exportResultsToCSV() {
        if (detailedResults.length === 0) {
            alert(t('errorNoResults'));
            return;
        }

        const table = document.getElementById('batch-results-table');
        const headers = Array.from(table.querySelectorAll('thead th'))
            .filter(th => th.style.display !== 'none')
            .map(th => ({
                text: th.getAttribute('title').split(/\r?\n/)[0] || th.textContent,
                key: th.dataset.sortKey
            }));

        const headerRow = headers.map(h => `"${h.text.replace(/"/g, '""')}"`).join(',');

        const rows = detailedResults.map(result => {
            return headers.map(header => {
                let value;
                switch (header.key) {
                    case 'upgrade':           value = result.upgrade; break;
                    case 'cost':              value = result.cost; break;
                    case 'timeToPurchase':    value = result.timeToPurchase; break;
                    case 'dpsChange':         value = result.dps; break;
                    case 'percentChange':     value = result.percent; break;
                    case 'costPerDps':        value = result.costPerDps; break;
                    case 'teamDpsChange':     value = result.teamDpsChange; break;
                    case 'percentTeamDpsChange': value = result.percentTeamDpsChange; break;
                    case 'costPerTeamDps':    value = result.costPerTeamDps; break;
                    case 'profitChange':      value = result.profitChange; break;
                    case 'percentProfitChange':value = result.percentProfitChange; break;
                    case 'costPerProfit':     value = result.costPerProfit; break;
                    case 'expChange':         value = result.expChange; break;
                    case 'percentExpChange':  value = result.percentExpChange; break;
                    case 'costPerExp':        value = result.costPerExp; break;
                    case 'ephChange':         value = result.ephChange; break;
                    case 'percentEphChange':  value = result.percentEphChange; break;
                    case 'costPerEph':        value = result.costPerEph; break;
                    case 'dphChange':         value = result.dphChange; break;
                    case 'percentDphChange':  value = result.percentDphChange; break;
                    default:                  value = '';
                }

                if (value === null || value === undefined || value === "N/A" || !isFinite(value)) {
                    value = '';
                } else if (value === "Free") {
                    value = 0;
                }

                const valueStr = String(value);
                if (valueStr.includes(',')) {
                    return `"${valueStr.replace(/"/g, '""')}"`;
                }
                return valueStr;
            }).join(',');
        });

        const csvContent = [headerRow, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.setAttribute("href", url);
        link.setAttribute("download", `jigs_results_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function resetPanelPositions() {
        console.log("JIGS DEBUG: Resetting panel positions to default.");
        const panelIds = ['batch-panel', 'jigs-results-panel', 'jigs-queue-panel'];
        panelIds.forEach(id => {
            GM_deleteValue(`jigs_panel_positions_${id}`);
            const panel = document.getElementById(id);
            if (panel) {
                panel.style.top = '';
                panel.style.left = '';
                panel.style.width = '';
                panel.style.height = '';
                panel.style.bottom = '';
                panel.style.right = '';
            }
        });
        statusDiv.textContent = t('statusPanelReset');
    }

    const groupAllChanges = (itemChanges, triggerChanges) => {
        const upgrades = [];
        const processed = new Set();
        const nameMap = new Map(itemChanges.map(c => [c.name, c]));
        for (const change of itemChanges) {
            if (processed.has(change.name)) continue;
            let baseName = change.name.replace(' Enhancement', '').replace(' Level', '');
            if (processed.has(baseName)) continue;
            processed.add(baseName);
            const mainChange = nameMap.get(baseName);
            const enhChange = nameMap.get(`${baseName} Enhancement`);
            const lvlChange = nameMap.get(`${baseName} Level`);
            const baseChangeObject = mainChange || enhChange || lvlChange;
            let combinedUpgrade = { ...baseChangeObject,
                name: baseName
            };
            if (mainChange) {
                combinedUpgrade.value = mainChange.value;
                combinedUpgrade.originalValue = mainChange.originalValue;
            } else {
                delete combinedUpgrade.value;
                delete combinedUpgrade.originalValue;
            }
            if (enhChange) {
                combinedUpgrade.enhancement = enhChange;
            }
            if (lvlChange) {
                combinedUpgrade.level = lvlChange;
            }

            const priceOverride = mainChange?.priceOverride || enhChange?.priceOverride;
            if (priceOverride) {
                combinedUpgrade.priceOverride = priceOverride;
            }

            if (baseName.startsWith('Ability') || baseName.startsWith('Food') || baseName.startsWith('Drink')) {
                const type = baseName.startsWith('Ability') ? 'ability' : (baseName.startsWith('Food') ? 'food' : 'drink');
                const index = parseInt(baseName.match(/\d+/)[0]) - 1;
                const triggerIndex = triggerChanges.findIndex(t => t.type === type && t.index == index);
                if (triggerIndex > -1) {
                    combinedUpgrade.triggerChange = triggerChanges[triggerIndex];
                    triggerChanges.splice(triggerIndex, 1);
                }
            }
            upgrades.push(combinedUpgrade);
        }
        for (const trigger of triggerChanges) {
            upgrades.push({
                name: `Trigger ${trigger.type} ${parseInt(trigger.index) + 1}`,
                isTriggerOnly: true,
                triggerChange: trigger,
                isConstant: trigger.isConstant
            });
        }
        return upgrades;
    };

    function makeDraggable(panel, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;

            if (!panel.style.top && !panel.style.left) {
                const rect = panel.getBoundingClientRect();
                panel.style.top = rect.top + 'px';
                panel.style.left = rect.left + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }

            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            panel.style.top = (panel.offsetTop - pos2) + "px";
            panel.style.left = (panel.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            const savedPositions = GM_getValue(`jigs_panel_positions_${panel.id}`, {});
            savedPositions.top = panel.style.top;
            savedPositions.left = panel.style.left;
            GM_setValue(`jigs_panel_positions_${panel.id}`, savedPositions);
        }
    }

function makeResizable(panel) {
    let startX, startY, startWidth, startHeight, dragDir;
    const MIN_WIDTH = 300;
    const MIN_HEIGHT = 100;
    const RESIZE_AREA = 10; // Pixels from edge considered a drag handle

    panel.addEventListener('mousedown', initDrag, false);
    panel.addEventListener('mousemove', setCursor, false);

    function getDragDirection(e) {
        const rect = panel.getBoundingClientRect();
        const top = e.clientY < rect.top + RESIZE_AREA;
        const bottom = e.clientY > rect.bottom - RESIZE_AREA;
        const left = e.clientX < rect.left + RESIZE_AREA;
        const right = e.clientX > rect.right - RESIZE_AREA;

        if (bottom && right) return 'se';
        if (bottom && left) return 'sw';
        if (top && right) return 'ne';
        if (top && left) return 'nw';
        if (right) return 'e';
        if (left) return 'w';
        if (top) return 'n';
        if (bottom) return 's';
        return null;
    }

// Inside makeResizable function:

    function setCursor(e) {
        if (panel.classList.contains('jigs-minimized')) {
            panel.style.cursor = 'default'; // Ensure default cursor when minimized
            return;
        }
        const dir = getDragDirection(e);
        panel.style.cursor = dir ? dir + '-resize' : 'default';
    }

// Inside makeResizable function:

function initDrag(e) {
        if (panel.classList.contains('jigs-minimized')) return;

        dragDir = getDragDirection(e);

        if (!dragDir) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(panel).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(panel).height, 10);

        // *** CRITICAL FIX: Lock the position using computed bounding box for W/N resizes ***
        if (dragDir.includes('n') || dragDir.includes('w')) {
            const rect = panel.getBoundingClientRect();
            panel.style.top = rect.top + 'px';
            panel.style.left = rect.left + 'px';
            panel.style.right = 'auto'; // Disable right/bottom positioning
            panel.style.bottom = 'auto';
            // Also store the *starting* numerical coordinates for the calculation
            panel.dataset.startLeft = rect.left;
            panel.dataset.startTop = rect.top;
        } else {
            // Ensure W/N start positions are cleared for E/S resizes
            panel.dataset.startLeft = panel.offsetLeft;
            panel.dataset.startTop = panel.offsetTop;
        }

        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
    }

    // No changes needed for doDrag or stopDrag functions.

function doDrag(e) {
        e.preventDefault();

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newWidth = startWidth;
        let newHeight = startHeight;

        // --- West (Left) Resize Logic (Includes NW, SW) ---
        if (dragDir.includes('w')) {
            newWidth = Math.max(MIN_WIDTH, startWidth - dx);

            // Adjust left position by the change in width
            const leftAdjustment = newWidth - startWidth;

            // Use the *initial* left position (startLeft) + the delta (dx)
            const startingLeft = parseFloat(panel.dataset.startLeft) || 0;
            const newLeft = startingLeft + dx;

            panel.style.left = newLeft + 'px';
        }
        // --- East (Right) Resize Logic (Includes NE, SE) ---
        else if (dragDir.includes('e')) {
            newWidth = Math.max(MIN_WIDTH, startWidth + dx);
        }

        // --- North (Top) Resize Logic (Includes NW, NE) ---
        if (dragDir.includes('n')) {
            newHeight = Math.max(MIN_HEIGHT, startHeight - dy);

            // Use the *initial* top position (startTop) + the delta (dy)
            const startingTop = parseFloat(panel.dataset.startTop) || 0;
            const newTop = startingTop + dy;

            panel.style.top = newTop + 'px';
        }
        // --- South (Bottom) Resize Logic (Includes SW, SE) ---
        else if (dragDir.includes('s')) {
            newHeight = Math.max(MIN_HEIGHT, startHeight + dy);
        }

        // Apply size changes
        panel.style.width = newWidth + 'px';
        panel.style.height = newHeight + 'px';
    }

    function stopDrag() {
        document.documentElement.removeEventListener('mousemove', doDrag, false);
        document.documentElement.removeEventListener('mouseup', stopDrag, false);
        panel.style.cursor = 'default';
        const savedPositions = GM_getValue(`jigs_panel_positions_${panel.id}`, {});
        savedPositions.width = panel.style.width;
        savedPositions.height = panel.style.height;
        savedPositions.top = panel.style.top;
        savedPositions.left = panel.style.left;
        GM_setValue(`jigs_panel_positions_${panel.id}`, savedPositions);
    }
}

    function createTriggerRow(type, index) {
        const container = document.createElement('div');
        container.className = 'trigger-container';
        const mainRow = document.createElement('div');
        mainRow.className = 'trigger-row';
        mainRow.dataset.triggerType = type;
        mainRow.dataset.triggerIndex = index;
        mainRow.innerHTML = `
            <label>${t('trigger')}</label>
            <select class="jigs-trigger-dependency" data-field="dependency" title="Condition 1" data-original-value=""><option value=""></option></select>
            <select class="jigs-trigger-condition" data-field="condition" title="Condition 2" data-original-value=""><option value=""></option></select>
            <select class="jigs-trigger-comparator" data-field="comparator" title="Condition 3" data-original-value=""><option value=""></option></select>
            <input type="number" class="jigs-trigger-value" data-field="value" placeholder="Value" title="Condition 4" data-original-value="">
        `;
        const rangeRow = document.createElement('div');
        rangeRow.className = 'trigger-range-row';
        rangeRow.innerHTML = `
            <label></label> <label class="jigs-range-label">${t('range')}</label>
            <input type="text" class="jigs-trigger-range" placeholder="e.g., 2000-2500" data-original-value="">
            <label class="jigs-increment-label">${t('increment')}</label>
            <input type="number" class="jigs-trigger-increment" placeholder="e.g., 100" data-original-value="">
        `;
        container.appendChild(mainRow);
        container.appendChild(rangeRow);
        return container;
    }

    function createConstantCheckbox() {
        const container = document.createElement('div');
        container.className = 'constant-checkbox-container';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'jigs-constant-checkbox';
        checkbox.title = 'Include this change in every simulation';
        container.appendChild(checkbox);
        return container;
    }

    function updateModifiedIndicator(element) {
        if (!element || typeof element.dataset.originalValue === 'undefined') {
            return;
        }
        const hasChanged = element.value !== element.dataset.originalValue;
        if (hasChanged) {
            element.classList.add('jigs-modified');
        } else {
            element.classList.remove('jigs-modified');
        }
    }

function normalizeAndParseFloat(s) {
        if (typeof s !== 'string' || !s) return NaN;

        // Remove all whitespace, including non-breaking spaces (\u00A0),
        // which are commonly used as thousands separators in French (e.g. "1 200,50")
        s = s.trim().replace(/[\s\u00A0]/g, '');

        // Check if the format is European/French (Comma is the decimal separator)
        // Logic: Comma exists AND (Dot doesn't exist OR Comma appears after the last Dot)
        if (s.indexOf(',') > -1 && (s.indexOf('.') === -1 || s.lastIndexOf(',') > s.lastIndexOf('.'))) {
            // Remove dots (thousands separators in some formats) and swap comma to dot
            return parseFloat(s.replace(/\./g, '').replace(',', '.'));
        }

        // Standard English format: remove commas (thousands separators)
        return parseFloat(s.replace(/,/g, ''));
    }

    function parseGold(value) {
        if (typeof value !== 'string') return NaN;
        value = value.toLowerCase().trim();
        const suffix = value.slice(-1);
        let multiplier = 1;
        let numPart = value;

        if (['k', 'm', 'b'].includes(suffix)) {
            numPart = value.slice(0, -1);
            if (suffix === 'k') multiplier = 1e3;
            if (suffix === 'm') multiplier = 1e6;
            if (suffix === 'b') multiplier = 1e9;
        }

        const num = normalizeAndParseFloat(numPart);
        return num * multiplier;
    }

    function updateBaselinesFromInputs() {
        console.log("JIGS DEBUG: Reading baseline values from input fields.");
        const dpsStr = document.getElementById('baseline-dps-input').value;
        const teamDpsStr = document.getElementById('baseline-team-dps-input').value;
        const profitStr = document.getElementById('baseline-profit-input').value;
        const expStr = document.getElementById('baseline-exp-input').value;
        const ephStr = document.getElementById('baseline-eph-input').value;
        const dphStr = document.getElementById('baseline-dph-input').value;
        baselineDps = parseGold(dpsStr) || 0;
        baselineTeamDps = parseGold(teamDpsStr) || 0;
        baselineProfit = parseGold(profitStr) || 0;
        baselineExp = parseInt(expStr.replace(/\D/g, ''), 10) || 0;
        baselineEph = normalizeAndParseFloat(ephStr) || 0;
        baselineDph = normalizeAndParseFloat(dphStr) || 0;
        console.log(`JIGS DEBUG: Baselines updated to DPS: ${baselineDps} (from '${dpsStr}'), Team DPS: ${baselineTeamDps} (from '${teamDpsStr}'), Profit: ${baselineProfit} (from '${profitStr}'), Exp: ${baselineExp} (from '${expStr}'), EPH: ${baselineEph} (from '${ephStr}'), DPH: ${baselineDph} (from '${dphStr}')`);
    }
    function createNumberInput(name, value, min, max, isHouse = false, withCheckbox = true) {
        const container = document.createElement('div');
        container.className = isHouse ? 'house-grid-item' : 'batch-input-row';
        const label = document.createElement('label');

        // Special handling for JIGS-specific translations (Multiplier, Dungeon Count)
        if (name === 'Multiplier') {
            label.textContent = t('multiplier');
            label.setAttribute('data-jigs-custom', 'multiplier');
        } else if (name === 'Dungeon Count') {
            label.textContent = t('dungeonCount');
            label.setAttribute('data-jigs-custom', 'dungeonCount');
        } else {
            // Add data-i18n attribute if mapping exists
            const i18nKey = nameToI18nMap[name];
            if (i18nKey) {
                label.setAttribute('data-i18n', i18nKey);
                // Set initial text using i18next if available
                if (typeof i18next !== 'undefined') {
                    label.textContent = i18next.t(i18nKey).replace(/<br\s*\/?>/gi, ' ').trim();
                } else {
                    label.textContent = name;
                }
            } else {
                label.textContent = name;
            }
        }
        label.title = label.textContent;

        const input = document.createElement('input');
        input.type = 'number';
        input.value = value;
        input.min = min ?? 1;
        input.max = max ?? 400;
        input.dataset.originalValue = value;
        input.dataset.name = name;
        container.appendChild(label);
        container.appendChild(input);
        if (withCheckbox) {
            container.appendChild(createConstantCheckbox());
        } else {
             container.style.gridTemplateColumns = '100px 1fr';
        }
        return container;
    }
    function createSelect(name, value, options, withCheckbox = true) {
        const row = document.createElement('div');
        row.className = 'batch-input-row';
        const label = document.createElement('label');

        // Special handling for JIGS-specific translations (SelectPlayer)
        if (name === 'SelectPlayer') {
            label.textContent = t('selectPlayer');
            label.setAttribute('data-jigs-custom', 'selectPlayer');
        }
        // Check if this is a food/drink item (e.g., "food 1", "drink 2")
        else if (name.match(/^(food|drink)\s+(\d+)$/i)) {
            const foodDrinkMatch = name.match(/^(food|drink)\s+(\d+)$/i);
            const type = foodDrinkMatch[1].toLowerCase();
            const index = foodDrinkMatch[2];
            const i18nKey = type === 'food' ? nameToI18nMap['Food'] : nameToI18nMap['Drink'];

            if (i18nKey && typeof i18next !== 'undefined') {
                const typeText = i18next.t(i18nKey).replace(/<br\s*\/?>/gi, ' ').trim();
                label.textContent = `${typeText} ${index}`;
            } else {
                label.textContent = `${type === 'food' ? 'Food' : 'Drink'} ${index}`;
            }
            // Set special attributes for numbered items
            label.setAttribute('data-jigs-consumable-type', type);
            label.setAttribute('data-jigs-consumable-index', index);
            label.setAttribute('data-jigs-consumable-i18n', i18nKey);
        } else {
            // Regular select with i18n mapping
            const i18nKey = nameToI18nMap[name];
            if (i18nKey) {
                label.setAttribute('data-i18n', i18nKey);
                // Set initial text using i18next if available
                if (typeof i18next !== 'undefined') {
                    label.textContent = i18next.t(i18nKey).replace(/<br\s*\/?>/gi, ' ').trim();
                } else {
                    label.textContent = name;
                }
            } else {
                label.textContent = name;
            }
        }
        label.title = label.textContent;

        const select = document.createElement('select');
        select.dataset.originalValue = value;
        select.dataset.name = name;
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });
        select.value = value;
        row.appendChild(label);
        row.appendChild(select);
        if (withCheckbox) {
            row.appendChild(createConstantCheckbox());
        } else {
            row.style.gridTemplateColumns = '100px 1fr';
        }
        return row;
    }
    function createEquipmentRow(name, itemValue, itemOptions, enhValue) {
        const row = document.createElement('div');
        row.className = 'batch-input-row-equip';
        const label = document.createElement('label');

        // Add data-i18n attribute if mapping exists
        const i18nKey = nameToI18nMap[name];
        if (i18nKey) {
            label.setAttribute('data-i18n', i18nKey);
            // Set initial text using i18next if available
            if (typeof i18next !== 'undefined') {
                label.textContent = i18next.t(i18nKey).replace(/<br\s*\/?>/gi, ' ').trim();
            } else {
                label.textContent = name;
            }
        } else {
            label.textContent = name;
        }
        label.title = label.textContent;

        const itemSelect = document.createElement('select');
        itemSelect.dataset.originalValue = itemValue;
        itemSelect.dataset.name = name;
        itemOptions.forEach(opt => {
            const option = document.createElement('option');
            // Store English name as value, display text as textContent
            option.value = typeof opt === 'object' ? opt.value : opt;
            option.textContent = typeof opt === 'object' ? opt.text : opt;
            // Preserve data-i18n attribute for automatic translation
            if (typeof opt === 'object' && opt.i18nKey) {
                option.setAttribute('data-i18n', opt.i18nKey);
            }
            itemSelect.appendChild(option);
        });
        itemSelect.value = itemValue;
        const enhInput = document.createElement('input');
        enhInput.type = 'number';
        enhInput.value = enhValue;
        enhInput.min = 0;
        enhInput.max = 20;
        enhInput.dataset.originalValue = enhValue;
        enhInput.dataset.name = `${name} Enhancement`;
        const priceInfoContainer = document.createElement('div');
        priceInfoContainer.className = 'price-info-container';
        const priceOverrideInput = document.createElement('input');
        priceOverrideInput.type = 'text';
        priceOverrideInput.className = 'jigs-price-override';
        priceOverrideInput.placeholder = t('autoPrice');
        priceOverrideInput.title = t('tooltipPriceOverride');
        const indicatorContainer = document.createElement('div');
        indicatorContainer.className = 'market-indicators';
        priceInfoContainer.appendChild(indicatorContainer);
        priceInfoContainer.appendChild(priceOverrideInput);
        row.appendChild(label);
        row.appendChild(itemSelect);
        row.appendChild(enhInput);
        row.appendChild(createConstantCheckbox());
        row.appendChild(priceInfoContainer);
        itemSelect.addEventListener('change', () => {
            updateMarketIndicators(row);
            updatePriceOverrideField(row);
        });
        enhInput.addEventListener('change', () => {
            updateMarketIndicators(row);
            updatePriceOverrideField(row);
        });
        return row;
    }
    function createAbilityRow(name, itemValue, itemOptions, lvlValue) {
        const row = document.createElement('div');
        row.className = 'batch-input-row-ability';
        const label = document.createElement('label');

        // Parse ability index from name (e.g., "Ability 1" -> index 1)
        const abilityIndex = parseInt(name.split(' ')[1]);

        // First ability (Ability 1, index 1) is "Special Ability"
        // Others (Ability 2-5, index 2-5) are "Ability 1-4"
        if (abilityIndex === 1) {
            const i18nKey = nameToI18nMap['Special Ability'];
            label.setAttribute('data-i18n', i18nKey);
            if (typeof i18next !== 'undefined') {
                label.textContent = i18next.t(i18nKey).replace(/<br\s*\/?>/gi, ' ').trim();
            } else {
                label.textContent = 'Special Ability';
            }
        } else {
            // For Ability 2-5, show as "Ability 1-4" (技能 1-4)
            const displayIndex = abilityIndex - 1;
            const i18nKey = nameToI18nMap['Ability'];
            if (i18nKey && typeof i18next !== 'undefined') {
                const abilityText = i18next.t(i18nKey).replace(/<br\s*\/?>/gi, ' ').trim();
                label.textContent = `${abilityText} ${displayIndex}`;
            } else {
                label.textContent = `Ability ${displayIndex}`;
            }
            // Set data-i18n with special format for numbered items
            label.setAttribute('data-jigs-ability-index', displayIndex);
            label.setAttribute('data-jigs-ability-i18n', i18nKey);
        }
        label.title = label.textContent;

        const itemSelect = document.createElement('select');
        itemSelect.dataset.originalValue = itemValue;
        itemSelect.dataset.name = name;
        itemOptions.forEach(opt => {
            if ((typeof opt === 'object' ? opt.value : opt) !== 'Promote') {
                const option = document.createElement('option');
                // Store English name as value, display text as textContent
                option.value = typeof opt === 'object' ? opt.value : opt;
                option.textContent = typeof opt === 'object' ? opt.text : opt;
                // Preserve data-i18n attribute for automatic translation
                if (typeof opt === 'object' && opt.i18nKey) {
                    option.setAttribute('data-i18n', opt.i18nKey);
                }
                itemSelect.appendChild(option);
            }
        });
        itemSelect.value = itemValue;
        const lvlInput = document.createElement('input');
        lvlInput.type = 'number';
        lvlInput.value = lvlValue;
        lvlInput.min = 1;
        lvlInput.max = 200;
        lvlInput.dataset.originalValue = lvlValue;
        lvlInput.dataset.name = `${name} Level`;
        row.appendChild(label);
        row.appendChild(itemSelect);
        row.appendChild(lvlInput);
        row.appendChild(createConstantCheckbox());
        return row;
    }
    function findPageElementByName(name, tag = 'input, select') {
        // First check if it's a special ID
        if (specialIdMap[name]) {
            return document.getElementById(specialIdMap[name]);
        }

        // Try to find by data-i18n attribute (language-independent)
        const i18nKey = nameToI18nMap[name];
        if (i18nKey) {
            const label = document.querySelector(`label[data-i18n="${i18nKey}"]`);
            if (label) {
                const parentRow = label.closest('.row');
                if (parentRow) {
                    return parentRow.querySelector(tag);
                }
            }
        }

        // Fallback: find by text content (for house items and other elements without i18n mapping)
        const labels = Array.from(document.querySelectorAll('label'));
        const targetLabel = labels.find(l => l.textContent && l.textContent.trim().toLowerCase() === name.toLowerCase());
        if (!targetLabel) return null;
        const parentRow = targetLabel.closest('.row');
        if (parentRow) {
            return parentRow.querySelector(tag);
        }
        return null;
    }
    function getDpsValue() {
        const resultsContainer = document.getElementById('simulationResultTotalDamageDone');
        if (!resultsContainer || !resultsContainer.hasChildNodes()) {
            return null;
        }
        const totalLabelElement = Array.from(resultsContainer.querySelectorAll('div.col-md-5')).find(el => {
            const i18nAttr = el.getAttribute('data-i18n');
            if (i18nAttr === 'common:total') return true;
            return el.textContent.trim() === 'Total' || el.textContent.trim() === '总计';
        });
        if (!totalLabelElement) {
            return null;
        }
        const dpsElement = totalLabelElement.nextElementSibling?.nextElementSibling;
        if (dpsElement) {
            return dpsElement.textContent.trim();
        }
        return null;
    }
    function getTeamDpsValue() {
        const teamDpsElement = document.getElementById('teamDpsValue');
        if (!teamDpsElement) {
            return null;
        }
        return teamDpsElement.textContent.trim();
    }
    function formatGold(value) { if (value === 'N/A' || value === 'Free') return value; if (!isFinite(value) || value === Infinity) return "N/A"; if (value < 1000) return Math.round(value).toLocaleString(); if (value < 1000000) return `${(value / 1000).toFixed(1)}k`; return `${(value / 1000000).toFixed(2)}M`; }

    function updateCostAndRecalculate(row, newCostText) {
        // Parse the new cost value
        let newCost;
        if (newCostText === t('noSeller') || newCostText === 'No Seller') {
            newCost = Infinity;
        } else if (newCostText === t('free') || newCostText === 'Free' || newCostText === '0') {
            newCost = 0;
        } else {
            newCost = parseGold(newCostText);
            if (isNaN(newCost)) {
                console.warn('JIGS: Invalid cost value entered:', newCostText);
                return;
            }
        }

        // Get all the cells in this row
        const cells = row.querySelectorAll('td');
        const costInput = row.querySelector('.jigs-editable-cost');

        // Update the raw cost data
        if (costInput) {
            costInput.dataset.rawCost = newCost;
        }
        row.dataset.cost = isFinite(newCost) ? newCost : Infinity;

        // Get the percent changes from dataset
        const percentChange = parseFloat(row.dataset.percentChange);
        const percentTeamDpsChange = parseFloat(row.dataset.percentTeamDpsChange);
        const percentProfitChange = parseFloat(row.dataset.percentProfitChange);
        const percentExpChange = parseFloat(row.dataset.percentExpChange);
        const percentEphChange = parseFloat(row.dataset.percentEphChange);

        // Recalculate cost-dependent values
        let costPerDps, costPerTeamDps, costPerProfit, costPerExp, costPerEph;
        let costPerDpsText, costPerTeamDpsText, costPerProfitText, costPerExpText, costPerEphText;
        let timeToPurchase;

        if (newCost === Infinity) {
            costPerDps = 'N/A';
            costPerTeamDps = 'N/A';
            costPerProfit = 'N/A';
            costPerExp = 'N/A';
            costPerEph = 'N/A';
            costPerDpsText = 'N/A';
            costPerTeamDpsText = 'N/A';
            costPerProfitText = 'N/A';
            costPerExpText = 'N/A';
            costPerEphText = 'N/A';
            timeToPurchase = Infinity;
        } else if (newCost === 0) {
            costPerDps = 'Free';
            costPerTeamDps = 'Free';
            costPerProfit = 'Free';
            costPerExp = 'Free';
            costPerEph = 'Free';
            costPerDpsText = 'Free';
            costPerTeamDpsText = 'Free';
            costPerProfitText = 'Free';
            costPerExpText = 'Free';
            costPerEphText = 'Free';
            timeToPurchase = 0;
        } else {
            // Calculate cost per percent metrics
            costPerDps = (percentChange > 0) ? (newCost / percentChange) * 0.01 : 'N/A';
            costPerTeamDps = (percentTeamDpsChange > 0) ? (newCost / percentTeamDpsChange) * 0.01 : 'N/A';
            costPerProfit = (percentProfitChange > 0) ? (newCost / percentProfitChange) * 0.01 : 'N/A';
            costPerExp = (percentExpChange > 0) ? (newCost / percentExpChange) * 0.01 : 'N/A';
            costPerEph = (percentEphChange > 0) ? (newCost / percentEphChange) * 0.01 : 'N/A';

            costPerDpsText = formatGold(costPerDps);
            costPerTeamDpsText = formatGold(costPerTeamDps);
            costPerProfitText = formatGold(costPerProfit);
            costPerExpText = formatGold(costPerExp);
            costPerEphText = formatGold(costPerEph);

            // Calculate time to purchase
            timeToPurchase = baselineProfit > 0 ? newCost / baselineProfit : Infinity;
        }

        // Update dataset attributes
        row.dataset.timeToPurchase = isFinite(timeToPurchase) ? timeToPurchase : Infinity;
        row.dataset.costPerDps = costPerDps === 'Free' ? 0 : (isFinite(costPerDps) ? costPerDps : Infinity);
        row.dataset.costPerTeamDps = costPerTeamDps === 'Free' ? 0 : (isFinite(costPerTeamDps) ? costPerTeamDps : Infinity);
        row.dataset.costPerProfit = costPerProfit === 'Free' ? 0 : (isFinite(costPerProfit) ? costPerProfit : Infinity);
        row.dataset.costPerExp = costPerExp === 'Free' ? 0 : (isFinite(costPerExp) ? costPerExp : Infinity);
        row.dataset.costPerEph = costPerEph === 'Free' ? 0 : (isFinite(costPerEph) ? costPerEph : Infinity);

        // Find column indices dynamically
        const thead = document.querySelector('#batch-results-table thead tr');
        const headers = Array.from(thead.querySelectorAll('th'));

        const updateCellByKey = (sortKey, value) => {
            const headerIndex = headers.findIndex(h => h.dataset.sortKey === sortKey);
            if (headerIndex === -1) return;

            // Use headerIndex directly since cells and headers are 1:1 correspondence
            if (cells[headerIndex]) {
                cells[headerIndex].textContent = value;
            }
        };

        // Update the cells
        updateCellByKey('timeToPurchase', formatTime(timeToPurchase));
        updateCellByKey('costPerDps', costPerDpsText);
        updateCellByKey('costPerTeamDps', costPerTeamDpsText);
        updateCellByKey('costPerProfit', costPerProfitText);
        updateCellByKey('costPerExp', costPerExpText);
        updateCellByKey('costPerEph', costPerEphText);

        // Update the cost input display
        if (costInput) {
            costInput.value = formatGold(newCost);
        }

        // Update the detailedResults array
        const upgradeName = row.dataset.upgrade;
        const resultIndex = detailedResults.findIndex(r => r.upgrade === upgradeName);
        if (resultIndex !== -1) {
            detailedResults[resultIndex].cost = newCost;
            detailedResults[resultIndex].timeToPurchase = timeToPurchase;
            detailedResults[resultIndex].costPerDps = costPerDps;
            detailedResults[resultIndex].costPerTeamDps = costPerTeamDps;
            detailedResults[resultIndex].costPerProfit = costPerProfit;
            detailedResults[resultIndex].costPerExp = costPerExp;
            detailedResults[resultIndex].costPerEph = costPerEph;
        }

        // Reapply highlighting
        highlightResults();
    }

    function addResultRow(result) {
        const resultsTbody = document.querySelector('#batch-results-table tbody');
        const row = resultsTbody.insertRow();
        let costText = formatGold(result.cost);
        let costPerDpsText = formatGold(result.costPerDps);
        let costPerTeamDpsText = formatGold(result.costPerTeamDps);
        let costPerProfitText = formatGold(result.costPerProfit);
        let costPerExpText = formatGold(result.costPerExp);
        let costPerEphText = formatGold(result.costPerEph);
        if (result.cost === Infinity) {
            costText = t('noSeller');
            costPerDpsText = 'N/A';
            costPerTeamDpsText = 'N/A';
            costPerProfitText = 'N/A';
            costPerExpText = 'N/A';
            costPerEphText = 'N/A';
        }
        let upgradeText = result.upgrade;
        if (result.books > 0) {
            upgradeText += ` (${result.books.toLocaleString()} books)`;
        } else if (result.timeToLevelText) {
            upgradeText += ` ${result.timeToLevelText}`;
        }
        row.dataset.upgrade = result.upgrade;
        row.dataset.cost = isFinite(result.cost) ? result.cost : Infinity;
        row.dataset.timeToPurchase = isFinite(result.timeToPurchase) ? result.timeToPurchase : Infinity;
        row.dataset.dpsChange = result.dps;
        row.dataset.percentChange = isFinite(result.percent) ? result.percent : Infinity;
        row.dataset.costPerDps = result.costPerDps === 'Free' ? 0 : (isFinite(result.costPerDps) ? result.costPerDps : Infinity);
        row.dataset.teamDpsChange = result.teamDpsChange;
        row.dataset.percentTeamDpsChange = isFinite(result.percentTeamDpsChange) ? result.percentTeamDpsChange : Infinity;
        row.dataset.costPerTeamDps = result.costPerTeamDps === 'Free' ? 0 : (isFinite(result.costPerTeamDps) ? result.costPerTeamDps : Infinity);
        row.dataset.profitChange = result.profitChange;
        row.dataset.percentProfitChange = isFinite(result.percentProfitChange) ? result.percentProfitChange : Infinity;
        row.dataset.costPerProfit = result.costPerProfit === 'Free' ? 0 : (isFinite(result.costPerProfit) ? result.costPerProfit : Infinity);
        row.dataset.expChange = result.expChange;
        row.dataset.percentExpChange = isFinite(result.percentExpChange) ? result.percentExpChange : Infinity;
        row.dataset.costPerExp = result.costPerExp === 'Free' ? 0 : (isFinite(result.costPerExp) ? result.costPerExp : Infinity);
        row.dataset.ephChange = result.ephChange;
        row.dataset.percentEphChange = isFinite(result.percentEphChange) ? result.percentEphChange : Infinity;
        row.dataset.costPerEph = result.costPerEph === 'Free' ? 0 : (isFinite(result.costPerEph) ? result.costPerEph : Infinity);
        row.dataset.dphChange = result.dphChange;
        row.dataset.percentDphChange = isFinite(result.percentDphChange) ? result.percentDphChange : Infinity;

        row.innerHTML = ` <td class="upgrade-col">${upgradeText}</td>
                                <td class="cost-col"><input type="text" class="jigs-editable-cost" value="${costText}" data-raw-cost="${result.cost}" style="width: 100%; background: transparent; border: 1px solid #555; color: inherit; padding: 2px;"></td>
                                <td class="ttp-col">${formatTime(result.timeToPurchase)}</td>
                                <td class="dps-col">${result.dps > 0 ? '+' : ''}${result.dps.toFixed(2)}</td>
                                <td class="dps-col">${isFinite(result.percent) ? result.percent.toFixed(2)+'%' : '∞'}</td>
                                <td class="dps-col">${costPerDpsText}</td>
                                <td class="team-dps-col">${result.teamDpsChange > 0 ? '+' : ''}${result.teamDpsChange.toFixed(2)}</td>
                                <td class="team-dps-col">${isFinite(result.percentTeamDpsChange) ? result.percentTeamDpsChange.toFixed(2)+'%' : '∞'}</td>
                                <td class="team-dps-col">${costPerTeamDpsText}</td>
                                <td class="profit-col">${result.profitChange > 0 ? '+' : ''}${formatGold(result.profitChange)}</td>
                                <td class="profit-col">${isFinite(result.percentProfitChange) ? result.percentProfitChange.toFixed(2)+'%' : '∞'}</td>
                                <td class="profit-col">${costPerProfitText}</td>
                                <td class="exp-col">${result.expChange > 0 ? '+' : ''}${result.expChange.toLocaleString()}</td>
                                <td class="exp-col">${isFinite(result.percentExpChange) ? result.percentExpChange.toFixed(2)+'%' : '∞'}</td>
                                <td class="exp-col">${costPerExpText}</td>
                                <td class="eph-col">${result.ephChange > 0 ? '+' : ''}${result.ephChange.toFixed(2)}</td>
                                <td class="eph-col">${isFinite(result.percentEphChange) ? result.percentEphChange.toFixed(2)+'%' : '∞'}</td>
                                <td class="eph-col">${costPerEphText}</td>
                                <td class="dph-col">${result.dphChange > 0 ? '+' : ''}${result.dphChange.toFixed(2)}</td>
                                <td class="dph-col">${isFinite(result.percentDphChange) ? result.percentDphChange.toFixed(2)+'%' : '∞'}</td>`;

        // Add event listener for cost editing
        const costInput = row.querySelector('.jigs-editable-cost');
        if (costInput) {
            costInput.addEventListener('change', function() {
                updateCostAndRecalculate(row, this.value);
            });
            costInput.addEventListener('blur', function() {
                updateCostAndRecalculate(row, this.value);
            });
        }
    }
    function getProfitValue() {
        const durationInput = document.getElementById('inputSimulationTime');
        const durationHours = durationInput ? parseFloat(durationInput.value) : 24;
        if (isNaN(durationHours) || durationHours <= 0) { return null; }
        const durationInDays = durationHours / 24;
        const newProfitElement = document.getElementById('noRngProfitPreview');
        if (newProfitElement) {
            const profitString = newProfitElement.textContent.trim();
            const totalProfit = normalizeAndParseFloat(profitString);
            if (!isNaN(totalProfit)) {
                return totalProfit / durationInDays;
            }
        }
        const profitElement = document.querySelector('div[i18n-id="i18n-realDailyProfitTitle"]');
        if (!profitElement) { return null; }
        let profitString = '';
        if (profitElement.hasAttribute('i18n-data')) {
            profitString = profitElement.getAttribute('i18n-data');
        } else {
            profitString = profitElement.textContent;
        }
        profitString = (profitString.split(':')[1] || '').trim();
        if (profitString === '') { return null; }
        const profitValue = normalizeAndParseFloat(profitString);
        return isNaN(profitValue) ? null : profitValue;
    }
    function getExpValue() {
        const allTotalLabels = Array.from(document.querySelectorAll('div')).filter(el => {
            const i18nAttr = el.getAttribute('data-i18n');
            if (i18nAttr === 'common:total') return true;
            return el.textContent.trim() === 'Total' || el.textContent.trim() === '总计';
        });
        const totalLabelElement = allTotalLabels.find(el => el.parentElement.classList.contains('row') && el.nextElementSibling);
        if (!totalLabelElement) {
            return null;
        }
        const expElement = totalLabelElement.nextElementSibling;
        if (expElement) {
            const expString = expElement.textContent.trim().replace(/\D/g, '');
            const expValue = parseInt(expString, 10);
            return isNaN(expValue) ? null : expValue;
        }
        return null;
    }
    function getEphValue() {
        // Try to find encounters value in simulationResultKills container
        const killsContainer = document.getElementById('simulationResultKills');
        if (killsContainer && killsContainer.hasChildNodes()) {
            // First, try to find normal encounters (for non-dungeon zones)
            const encountersLabel = Array.from(killsContainer.querySelectorAll('div')).find(el => {
                const i18nAttr = el.getAttribute('data-i18n');
                if (i18nAttr === 'common:simulationResults.encounters') return true;
                const text = el.textContent.trim();
                return text === 'Encounters' || text === '遭遇';
            });

            if (encountersLabel && encountersLabel.nextElementSibling) {
                const ephString = encountersLabel.nextElementSibling.textContent.trim();
                const ephValue = normalizeAndParseFloat(ephString);
                if (!isNaN(ephValue)) {
                    return ephValue;
                }
            }

            // If no encounters found, check if it's a dungeon (which shows "Completed Dungeons" instead)
            const dungeonsLabel = Array.from(killsContainer.querySelectorAll('div')).find(el => {
                const i18nAttr = el.getAttribute('data-i18n');
                if (i18nAttr === 'common:simulationResults.dungeonsCompleted') return true;
                const text = el.textContent.trim();
                return text === 'Completed Dungeons' || text === '完成的地下城';
            });

            // For dungeons, return 0 as EPH doesn't apply to dungeon mode
            if (dungeonsLabel) {
                return 0;
            }
        }
        return null;
    }
    function getDphValue() {
        // Try to find deaths value in simulationResultPlayerDeaths container
        const deathsContainer = document.getElementById('simulationResultPlayerDeaths');
        if (deathsContainer && deathsContainer.hasChildNodes()) {
            // Deaths are displayed as a row with "Player" label and the value
            const playerLabel = Array.from(deathsContainer.querySelectorAll('div')).find(el => {
                const i18nAttr = el.getAttribute('data-i18n');
                if (i18nAttr === 'common:player') return true;
                const text = el.textContent.trim();
                return text === 'Player' || text === '玩家';
            });

            if (playerLabel && playerLabel.nextElementSibling) {
                const dphString = playerLabel.nextElementSibling.textContent.trim();
                const dphValue = normalizeAndParseFloat(dphString);
                if (!isNaN(dphValue)) {
                    return dphValue;
                }
            }
        }
        return null;
    }
    function captureBaselineSkillRates() {
        console.log("JIGS DEBUG: Capturing baseline skill XP rates...");
        baselineSkillXpRates = {};
        const container = document.getElementById('simulationResultExperienceGain');
        if (!container) {
            console.error("JIGS DEBUG: Could not find skill XP results container '#simulationResultExperienceGain'.");
            return;
        }

        const skillRows = container.querySelectorAll('.row');
        skillRows.forEach(row => {
            const children = row.children;
            if (children.length === 2) {
                const skillNameElement = children[0];
                const skillName = skillNameElement.textContent.trim().toLowerCase();
                const xpValue = children[1].textContent.trim();

                const i18nAttr = skillNameElement.getAttribute('data-i18n');
                const isTotal = i18nAttr === 'common:total' || skillName === 'total' || skillName === '总计';

                if (!isTotal) {
                    let englishSkillName = skillName;
                    if (i18nAttr && i18nToNameMap[i18nAttr]) {
                        englishSkillName = i18nToNameMap[i18nAttr];
                    }
                    const rate = parseInt(xpValue.replace(/,/g, ''), 10) || 0;
                    baselineSkillXpRates[englishSkillName.toLowerCase()] = rate;
                    console.log(`JIGS DEBUG: Stored rate for "${englishSkillName}": ${rate}`);
                }
            }
        });
        console.log("JIGS DEBUG: Captured rates:", baselineSkillXpRates);
    }
    function getSkillXpRate(skillName) {
        const rate = baselineSkillXpRates[skillName.toLowerCase()] || 0;
        if (rate === 0) {
            console.warn(`JIGS DEBUG: No baseline XP rate found for skill "${skillName}". Time-to-level will not be calculated.`);
        }
        return rate;
    }
    function resetInputsToBaseline() {
        document.querySelectorAll('#batch-inputs-container input, #batch-inputs-container select:not(#jigs-player-select)').forEach(el => {
            if (el.dataset.originalValue !== undefined) {
                el.value = el.dataset.originalValue;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        setTimeout(() => {
            document.querySelectorAll('.batch-input-row-equip').forEach(row => {
                updatePriceOverrideField(row);
            });
        }, 100);
        statusDiv.textContent = t('statusAllReset');
    }
    function updateQueuePanelUI() {
        const queueList = document.getElementById('jigs-queue-list');
        queueList.innerHTML = '';
        simulationQueue.forEach((item, index) => {
            const li = document.createElement('li');

            const labelSpan = document.createElement('span');
            // Dynamically generate label based on current language
            labelSpan.textContent = generateQueueLabel(item.upgrades) || item.label;
            labelSpan.className = 'jigs-queue-item-label';

            const removeButton = document.createElement('button');
            removeButton.textContent = '✖';
            removeButton.className = 'jigs-remove-queue-item-button';
            removeButton.title = 'Remove this item from the queue';
            removeButton.dataset.index = index; // Store the item's index on the button

            li.appendChild(labelSpan);
            li.appendChild(removeButton);
            queueList.appendChild(li);
        });
        updateQueueEstimate();
    }
    function updateQueueEstimate() {
        const estimateDiv = document.getElementById('jigs-queue-estimate');
        const infiniteCheckbox = document.getElementById('infinite-queue-checkbox');
        const isInfinite = infiniteCheckbox ? infiniteCheckbox.checked : false;

        if (baselineRunTime <= 0 || simulationQueue.length === 0) {
            estimateDiv.textContent = '';
            return;
        }
        const multiplier = parseInt(document.querySelector('#sim-settings-group [data-name="Multiplier"]')?.value) || 1;
        const totalMs = simulationQueue.length * multiplier * baselineRunTime;
        const totalSeconds = totalMs / 1000;

        let estimateText = '';
        if (totalSeconds < 60) {
            estimateText = `~${Math.round(totalSeconds)} seconds`;
        } else {
            const totalMinutes = totalSeconds / 60;
            estimateText = `~${totalMinutes.toFixed(1)} minutes`;
        }

        if (isInfinite) {
            estimateDiv.textContent = `${t('estTimePerLoop')} ${estimateText}`;
        } else {
            estimateDiv.textContent = `${t('estimatedTime')} ${estimateText}`;
        }
    }
    function updateColumnVisibility() { document.querySelectorAll('.column-toggle').forEach(checkbox => { const columnClass = checkbox.dataset.col; const isVisible = checkbox.checked; document.querySelectorAll(`.${columnClass}`).forEach(el => el.style.display = isVisible ? '' : 'none'); }); }
    function formatTime(days) { if (!isFinite(days) || days === Infinity) { return t('never'); } if (days <= 0) { return t('free'); } const hours = days * 24; if (hours < 1) { const minutes = hours * 60; return `${minutes.toFixed(0)} ${t('min')}`; } if (days < 1) { return `${hours.toFixed(1)} ${t('hrs')}`; } const months = days / 30.44; if (months >= 1) { return `${months.toFixed(1)} ${t('mon')}`; } return `${days.toFixed(1)} ${t('days')}`; }
    function switchPlayerAndCapture(playerName) { const playerTabs = Array.from(document.querySelectorAll('a[id^="player"][id$="-tab"]')); const targetTab = playerTabs.find(tab => tab.textContent.trim() === playerName); if (targetTab) { statusDiv.textContent = `Switching to ${playerName}...`; targetTab.click(); setTimeout(() => { buildInputsUI(); }, 500); } else { statusDiv.textContent = `Error: Could not find player ${playerName}.`; } }
    function populatePlayerDropdown() {
        const container = document.getElementById('jigs-player-select-container');
        if (!container) return;
        container.innerHTML = '';
        const playerTabs = Array.from(document.querySelectorAll('a[id^="player"][id$="-tab"]'));
        if (playerTabs.length > 1) {
            const playerNames = playerTabs.map(tab => tab.textContent.trim());
            const activeTab = playerTabs.find(tab => tab.classList.contains('active'));
            const currentPlayer = activeTab ? activeTab.textContent.trim() : playerNames[0];
            const playerSelectRow = createSelect('SelectPlayer', currentPlayer, playerNames, false, t('selectPlayer'));
            const selectEl = playerSelectRow.querySelector('select');
            if (selectEl) selectEl.id = 'jigs-player-select';
            container.append(...playerSelectRow.childNodes);
            container.className = 'batch-input-row';
            container.style.gridTemplateColumns = '100px 1fr';
        } else {
            container.className = '';
        }
    }
    function highlightResults() {
        const rows = document.querySelectorAll('#batch-results-table tbody tr');
        if (rows.length < 2) { return; }
        document.querySelectorAll('#batch-results-table td').forEach(td => {
            td.classList.remove('best-upgrade', 'worst-upgrade');
        });

        // Get column indices dynamically based on visible columns
        const thead = document.querySelector('#batch-results-table thead tr');
        const headers = Array.from(thead.querySelectorAll('th'));

        const metrics = [
            { key: 'costPerDps', sortKey: 'costPerDps' },
            { key: 'costPerTeamDps', sortKey: 'costPerTeamDps' },
            { key: 'costPerProfit', sortKey: 'costPerProfit' },
            { key: 'costPerExp', sortKey: 'costPerExp' },
            { key: 'costPerEph', sortKey: 'costPerEph' }
        ];

        for (const metric of metrics) {
            // Find the column index for this metric dynamically
            const headerIndex = headers.findIndex(h => h.dataset.sortKey === metric.sortKey);
            if (headerIndex === -1) continue; // Column not found or hidden

            // Check if this column is visible
            const header = headers[headerIndex];
            if (header.style.display === 'none') continue;

            let values = [];
            for (const row of rows) {
                const cost = parseFloat(row.dataset.cost);
                const metricValue = parseFloat(row.dataset[metric.key]);

                if (cost === 0 || !isFinite(metricValue)) {
                    continue;
                }
                values.push({ value: metricValue, row: row, headerIndex: headerIndex });
            }
            if (values.length < 2) { continue; }
            values.sort((a, b) => a.value - b.value);
            const minVal = values[0].value;
            const maxVal = values[values.length - 1].value;
            if (minVal === maxVal) { continue; }
            const minRow = values[0].row;
            const maxRow = values[values.length - 1].row;

            // Find the actual visible cell index
            let visibleIndex = 0;
            for (let i = 0; i < headerIndex; i++) {
                if (headers[i].style.display !== 'none') {
                    visibleIndex++;
                }
            }

            const minCell = minRow.children[visibleIndex];
            const maxCell = maxRow.children[visibleIndex];
            if (minCell) minCell.classList.add('best-upgrade');
            if (maxCell) maxCell.classList.add('worst-upgrade');
        }
    }
    function updateMarketIndicators(equipmentRow) {
        if (!marketData) return;
        const itemSelect = equipmentRow.querySelector('select');
        const enhInput = equipmentRow.querySelector('input[type="number"]');
        const indicatorContainer = equipmentRow.querySelector('.market-indicators');
        if (!itemSelect || !enhInput || !indicatorContainer) return;
        indicatorContainer.innerHTML = '';
        const simItemName = itemSelect.value;
        if (simItemName === 'Empty') return;
        const marketItemName = SIMULATOR_TO_MARKET_MAP[simItemName] || simItemName;
        const itemKeyBase = marketItemName.replace(/'/g, '').toLowerCase();
        const currentEnh = parseInt(enhInput.value, 10);
        for (let i = 1; i <= 20; i++) {
            const marketKey = `${itemKeyBase} +${i}`;
            const priceData = marketData[marketKey];
            if (priceData && priceData.seller && priceData.seller !== -1) {
                const dot = document.createElement('div');
                dot.className = 'market-dot';
                dot.textContent = `+${i}`;
                dot.title = `+${i}: ${formatGold(priceData.seller)}`;
                if (i === currentEnh) {
                    dot.classList.add('selected');
                }
                dot.addEventListener('click', () => {
                    enhInput.value = i;
                    enhInput.dispatchEvent(new Event('change', { bubbles: true }));
                });
                indicatorContainer.appendChild(dot);
            }
        }
    }
    function updatePriceOverrideField(equipmentRow) {
        if (!marketData) return;
        const itemSelect = equipmentRow.querySelector('select');
        const enhInput = equipmentRow.querySelector('input[type="number"]');
        const priceInput = equipmentRow.querySelector('.jigs-price-override');
        if (!itemSelect || !enhInput || !priceInput) return;
        const simItemName = itemSelect.value;
        const enhLevel = enhInput.value;
        priceInput.value = '';
        if (simItemName === 'Empty' || enhLevel === '0') return;
        const marketItemName = SIMULATOR_TO_MARKET_MAP[simItemName] || simItemName;
        const itemKeyBase = marketItemName.replace(/'/g, '').toLowerCase();
        const marketKey = enhLevel === '0' ? itemKeyBase : `${itemKeyBase} +${enhLevel}`;
        const priceData = marketData[marketKey];
        if (priceData && priceData.seller && priceData.seller !== -1) {
            priceInput.value = formatGold(priceData.seller);
        }
    }

    // --- 4. CORE LOGIC ---
    async function fetchJigsData() { return new Promise((resolve) => { GM_xmlhttpRequest({ method: "GET", url: JIGS_DATA_URL, onload: function(response) { if (response.status === 200) { try { const data = JSON.parse(response.responseText); HOUSE_RECIPES = data.recipes; ITEM_ID_TO_NAME_MAP = data.itemMap; SPELL_BOOK_XP = data.spellBookXp; SIMULATOR_TO_MARKET_MAP = data.refinedMap; ABILITY_XP_LEVELS = data.abilityXp; resolve(true); } catch(e) { console.error("JIGS: Failed to parse JIGS data.", e); resolve(false); } } else { console.error("JIGS: Failed to fetch JIGS data.", response.status); resolve(false); } }, onerror: function() { console.error("JIGS: Error fetching JIGS data."); resolve(false); } }); }); }
    async function fetchMarketData() { if (marketData) { return marketData; } return new Promise((resolve) => { GM_xmlhttpRequest({ method: "GET", url: MARKET_API_URL, onload: function(response) { if (response.status === 200) { try { const responseObject = JSON.parse(response.responseText); const rawMarketData = responseObject.marketData; if (typeof rawMarketData !== 'object' || rawMarketData === null) { resolve(null); return; } marketData = {}; for (const itemId in rawMarketData) { const itemName = ITEM_ID_TO_NAME_MAP[itemId]; if (!itemName) continue; const itemEnhancements = rawMarketData[itemId]; for (const enhancementLevel in itemEnhancements) { const prices = itemEnhancements[enhancementLevel]; const fullName = enhancementLevel === "0" ? itemName : `${itemName} +${enhancementLevel}`; marketData[fullName.replace(/'/g, '').toLowerCase()] = { buyer: prices.b, seller: prices.a }; } } resolve(marketData); } catch (e) { resolve(null); } } else { resolve(null); } }, onerror: function() { resolve(null); } }); }); }
    async function runSimulation(progressCallback) { return new Promise((resolve) => { let progressWatcher, dpsWatcher; const cleanup = () => { clearInterval(progressWatcher); clearInterval(dpsWatcher); }; const setupButton = document.getElementById('buttonSimulationSetup'); if (!setupButton) { cleanup(); resolve(null); return; } setupButton.click(); setTimeout(() => { const startButton = document.getElementById('buttonStartSimulation'); if (!startButton) { cleanup(); resolve(null); return; } const resultsContainer = document.getElementById('simulationResultTotalDamageDone'); if (resultsContainer) resultsContainer.innerHTML = ''; startButton.click(); progressWatcher = setInterval(() => { if (!isBatchRunning) { console.log("JIGS DEBUG: Simulation stopped by user request."); cleanup(); resolve(null); return; } const progressBar = document.getElementById('simulationProgressBar'); if (progressBar) { const progress = parseInt(progressBar.textContent) || 0; if (progressCallback) progressCallback(progress); } if (progressBar && progressBar.textContent.includes('100%')) { clearInterval(progressWatcher); let attemptsWithoutAllMetrics = 0; const maxAttempts = 50; dpsWatcher = setInterval(() => { const dpsVal = getDpsValue(); const teamDpsVal = getTeamDpsValue(); const profitVal = getProfitValue(); const expVal = getExpValue(); const ephVal = getEphValue(); const dphVal = getDphValue(); if (dpsVal && profitVal !== null && expVal !== null && ephVal !== null && dphVal !== null) { cleanup(); resolve({ dps: normalizeAndParseFloat(dpsVal), teamDps: teamDpsVal ? normalizeAndParseFloat(teamDpsVal) : 0, profit: profitVal, exp: expVal, eph: ephVal, dph: dphVal, }); } else if (dpsVal && attemptsWithoutAllMetrics >= maxAttempts) { console.warn("JIGS: Max attempts reached, capturing with available metrics. DPS=" + dpsVal + ", Team DPS=" + teamDpsVal + ", Profit=" + profitVal + ", EXP=" + expVal + ", EPH=" + ephVal + ", DPH=" + dphVal); cleanup(); resolve({ dps: normalizeAndParseFloat(dpsVal), teamDps: teamDpsVal ? normalizeAndParseFloat(teamDpsVal) : 0, profit: profitVal || 0, exp: expVal || 0, eph: ephVal || 0, dph: dphVal || 0, }); } else { attemptsWithoutAllMetrics++; } }, 100); } }, 200); }, 300); }); }
    async function runSimulationMultiple(multiplier, progressCallback) {
        let totals = { dps: 0, teamDps: 0, profit: 0, exp: 0, eph: 0, dph: 0 };
        let successfulRuns = 0;
        let allDpsResults = [];
        for (let i = 0; i < multiplier; i++) {
            if (!isBatchRunning) break;
            const singleRunProgress = (progress) => {
                if (progressCallback) {
                    const overallProgress = ((i * 100) + progress) / multiplier;
                    progressCallback(overallProgress);
                }
            };
            const result = await runSimulation(singleRunProgress);
            if (result && !isNaN(result.dps)) {
                totals.dps += result.dps;
                totals.teamDps += result.teamDps;
                totals.profit += result.profit;
                totals.exp += result.exp;
                totals.eph += result.eph;
                totals.dph += result.dph;
                successfulRuns++;
                allDpsResults.push(result.dps);
            } else {
                console.error(`JIGS: Simulation run ${i + 1} of ${multiplier} failed.`);
            }
        }

        if (successfulRuns === 0) {
            return { averageDps: NaN, averageTeamDps: NaN, averageProfit: NaN, averageExp: NaN, averageEph: NaN, averageDph: NaN, individualRuns: [] };
        }
        return {
            averageDps: totals.dps / successfulRuns,
            averageTeamDps: totals.teamDps / successfulRuns,
            averageProfit: totals.profit / successfulRuns,
            averageExp: totals.exp / successfulRuns,
            averageEph: totals.eph / successfulRuns,
            averageDph: totals.dph / successfulRuns,
            individualRuns: allDpsResults
        };
    }
    function setRunningState(isRunning) {
        isBatchRunning = isRunning;
        document.getElementById('run-batch-button').style.display = isRunning ? 'none' : 'block';
        document.getElementById('stop-batch-button').style.display = isRunning ? 'block' : 'none';
        document.getElementById('capture-setup-button').disabled = isRunning;
        document.getElementById('update-baseline-button').disabled = isRunning;
        document.getElementById('import-triggers-checkbox').disabled = isRunning;
        if (isRunning) {
            document.getElementById('export-csv-button').disabled = true;
        }
        document.getElementById('reset-button').disabled = isRunning;
        document.getElementById('add-to-queue-button').disabled = isRunning;
    }
    async function buildInputsUI() {
        statusDiv.textContent = t('statusReadingData');
        jigsNameToPageElementMap = new Map();
        await fetchMarketData();
        document.getElementById('run-batch-button').disabled = true;
        document.getElementById('capture-setup-button').disabled = true;
        document.getElementById('update-baseline-button').disabled = true;
        document.getElementById('reset-button').disabled = true;
        document.getElementById('add-to-queue-button').disabled = true;
        document.getElementById('import-triggers-checkbox').disabled = true;

        const excludedRooms = [ "Shed", "Dairy Barn", "Garden", "Forge", "Workshop", "Sewing Parlor", "Kitchen", "Brewery", "Laboratory", "Observatory", "Log Shed" ];
        const currentMultiplier = document.querySelector('#sim-settings-group [data-name="Multiplier"]')?.value || 1;
        // Clear group containers and restore summary labels with translations
        const summaryKeyMap = {
            'sim-settings-group': 'simSettings',
            'skills-group': 'skills',
            'equipment-group': 'equipment',
            'abilities-group': 'abilities',
            'food-drink-group': 'foodDrink',
            'house-group': 'house'
        };
        Object.values(groupContainers).forEach(c => {
            if (c.id !== 'house-grid-container') {
                const parentId = c.id || c.parentElement?.id;
                const summaryKey = summaryKeyMap[parentId];
                const summaryText = summaryKey ? t(summaryKey) : c.querySelector('summary')?.textContent || '';
                c.innerHTML = `<summary>${summaryText}</summary>`;
            } else {
                c.innerHTML = '';
            }
        });
        let itemsFound = 0;
        houseKeywords = [];
        populatePlayerDropdown();
        skillKeywords.forEach(name => {
            const pageEl = findPageElementByName(name);
            if (pageEl) {
                groupContainers.skills.appendChild(createNumberInput(name, pageEl.value, pageEl.min, pageEl.max, false, true));
                jigsNameToPageElementMap.set(name, pageEl);
                itemsFound++;
            }
        });
        equipmentKeywords.forEach(name => {
            const itemSelect = findPageElementByName(name, 'select');
            const enhInput = findPageElementByName(name, 'input');
            if (itemSelect && enhInput) {
                const selectedOption = itemSelect.options[itemSelect.selectedIndex];
                // Get English name using i18next fixed language translation
                const getEnglishName = (option) => {
                    const i18nKey = option.getAttribute('data-i18n');
                    if (i18nKey && typeof i18next !== 'undefined') {
                        // Use i18next to get English translation with fixed language
                        try {
                            const englishName = i18next.t(i18nKey, { lng: 'en' });
                            if (englishName && englishName !== i18nKey) {
                                return englishName;
                            }
                        } catch (e) {
                            console.warn('JIGS: Failed to get English translation for', i18nKey, e);
                        }
                    }
                    // Fallback to text content
                    return option.textContent.trim();
                };
                const itemValue = getEnglishName(selectedOption);
                const itemOptions = Array.from(itemSelect.options).map(opt => ({
                    value: getEnglishName(opt),
                    text: opt.textContent.trim(),
                    i18nKey: opt.getAttribute('data-i18n') // Preserve i18n key for dynamic translation
                }));
                const enhValue = enhInput.value;
                const equipmentRow = createEquipmentRow(name, itemValue, itemOptions, enhValue);
                groupContainers.equipment.appendChild(equipmentRow);
                updateMarketIndicators(equipmentRow);
                updatePriceOverrideField(equipmentRow);
                jigsNameToPageElementMap.set(name, itemSelect);
                jigsNameToPageElementMap.set(`${name} Enhancement`, enhInput);
                itemsFound++;
            }
        });
        for (let i = 0; i < 5; i++) {
            const abilitySelect = document.getElementById(`selectAbility_${i}`);
            const levelInput = document.getElementById(`inputAbilityLevel_${i}`);
            if (abilitySelect && levelInput) {
                const name = `Ability ${i + 1}`;
                const selectedOption = abilitySelect.options[abilitySelect.selectedIndex];
                const getEnglishAbilityName = (option) => {
                    const i18nKey = option.getAttribute('data-i18n');
                    if (i18nKey && typeof i18next !== 'undefined') {
                        try {
                            const englishName = i18next.t(i18nKey, { lng: 'en' });
                            if (englishName && englishName !== i18nKey) {
                                return englishName;
                            }
                        } catch (e) {
                            console.warn('JIGS: Failed to get English translation for ability', i18nKey, e);
                        }
                    }
                    return option.textContent.trim();
                };
                const itemValue = getEnglishAbilityName(selectedOption);
                const itemOptions = Array.from(abilitySelect.options).map(opt => ({
                    value: getEnglishAbilityName(opt),
                    text: opt.textContent.trim(),
                    i18nKey: opt.getAttribute('data-i18n') // Preserve i18n key for dynamic translation
                }));
                const lvlValue = levelInput.value;
                groupContainers.abilities.appendChild(createAbilityRow(name, itemValue, itemOptions, lvlValue));
                groupContainers.abilities.appendChild(createTriggerRow('ability', i));
                jigsNameToPageElementMap.set(name, abilitySelect);
                jigsNameToPageElementMap.set(`${name} Level`, levelInput);
                itemsFound++;
            }
        }
        document.querySelectorAll('select[id^="selectFood_"], select[id^="selectDrink_"]').forEach(el => {
            const isFood = el.id.includes('Food');
            const type = isFood ? 'food' : 'drink';
            const indexFromId = parseInt(el.id.split('_')[1], 10);
            const name = `${type} ${indexFromId + 1}`;
            const currentValue = el.options[el.selectedIndex].text;
            const options = Array.from(el.options).map(opt => opt.text);
            groupContainers.food.appendChild(createSelect(name, currentValue, options, true));
            groupContainers.food.appendChild(createTriggerRow(type, indexFromId));
            jigsNameToPageElementMap.set(name, el);
            itemsFound++;
        });
        document.querySelectorAll('#houseRoomsList .row').forEach(row => {
            const labelEl = row.querySelector('div[data-i18n]');
            const inputEl = row.querySelector('input');
            if (labelEl && inputEl) {
                const name = labelEl.textContent.trim();
                if (excludedRooms.includes(name)) return;
                houseKeywords.push(name);
                groupContainers.house.appendChild(createNumberInput(name, inputEl.value, inputEl.min, inputEl.max, true, true));
                jigsNameToPageElementMap.set(name, inputEl);
                itemsFound++;
            }
        });

        // Create simulation mode selector (Zone vs Dungeon)
        // Check current simulator mode
        const simDungeonToggle = document.getElementById('simDungeonToggle');
        const isCurrentlyDungeon = simDungeonToggle && simDungeonToggle.checked;

        const modeSelectRow = document.createElement('div');
        modeSelectRow.className = 'batch-input-row';
        modeSelectRow.style.gridTemplateColumns = '100px 1fr';
        modeSelectRow.innerHTML = `
            <label>${t('simulationMode')}</label>
            <div style="display: flex; gap: 10px;">
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                    <input type="radio" name="jigs-sim-mode" value="zone" ${!isCurrentlyDungeon ? 'checked' : ''}>
                    <span>${t('normalZone')}</span>
                </label>
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                    <input type="radio" name="jigs-sim-mode" value="dungeon" ${isCurrentlyDungeon ? 'checked' : ''}>
                    <span>${t('dungeonMode')}</span>
                </label>
            </div>
        `;
        groupContainers.sim.appendChild(modeSelectRow);

        // Create Zone and Dungeon selectors
        const zoneEl = findPageElementByName('Zone');
        const dungeonEl = findPageElementByName('Dungeon');
        let zoneRow = null;
        let dungeonRow = null;

        if (zoneEl && zoneEl.tagName === 'SELECT') {
            const currentValue = zoneEl.options[zoneEl.selectedIndex].text;
            const options = Array.from(zoneEl.options).map(opt => opt.text);
            zoneRow = createSelect('Zone', currentValue, options, false);
            zoneRow.id = 'jigs-zone-row';
            zoneRow.style.display = isCurrentlyDungeon ? 'none' : 'grid'; // Hide if in dungeon mode
            groupContainers.sim.appendChild(zoneRow);
            jigsNameToPageElementMap.set('Zone', zoneEl);
            itemsFound++;
        }

        if (dungeonEl && dungeonEl.tagName === 'SELECT') {
            const currentValue = dungeonEl.options[dungeonEl.selectedIndex].text;
            const options = Array.from(dungeonEl.options).map(opt => opt.text);
            dungeonRow = createSelect('Dungeon', currentValue, options, false);
            dungeonRow.id = 'jigs-dungeon-row';
            dungeonRow.style.display = isCurrentlyDungeon ? 'grid' : 'none'; // Show if in dungeon mode
            groupContainers.sim.appendChild(dungeonRow);
            jigsNameToPageElementMap.set('Dungeon', dungeonEl);
            itemsFound++;
        }

        // Add event listener for mode toggle
        modeSelectRow.querySelectorAll('input[name="jigs-sim-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const mode = e.target.value;
                if (zoneRow) zoneRow.style.display = mode === 'zone' ? 'grid' : 'none';
                if (dungeonRow) dungeonRow.style.display = mode === 'dungeon' ? 'grid' : 'none';

                // Update the simulator's dungeon toggle checkbox
                const simDungeonToggle = document.getElementById('simDungeonToggle');
                if (simDungeonToggle) {
                    const shouldBeChecked = mode === 'dungeon';
                    if (simDungeonToggle.checked !== shouldBeChecked) {
                        simDungeonToggle.checked = shouldBeChecked;
                        simDungeonToggle.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });
        });

        // Add other simulation settings (Difficulty, Duration, Dungeon Count)
        let durationRow = null;
        let dungeonCountRow = null;

        for (const name of Object.keys(specialIdMap)) {
            if (name === 'Zone' || name === 'Dungeon') continue; // Already handled above
            const pageEl = findPageElementByName(name);
            if (pageEl) {
                let row = null;
                if (pageEl.tagName === 'SELECT') {
                    const currentValue = pageEl.options[pageEl.selectedIndex].text;
                    const options = Array.from(pageEl.options).map(opt => opt.text);
                    row = createSelect(name, currentValue, options, false);
                } else {
                    row = createNumberInput(name, pageEl.value, pageEl.min, pageEl.max, false, false);
                }

                // Handle Duration and Dungeon Count visibility
                if (name === 'Duration') {
                    row.id = 'jigs-duration-row';
                    row.style.display = isCurrentlyDungeon ? 'none' : 'grid'; // Hide if in dungeon mode
                    durationRow = row;
                    groupContainers.sim.appendChild(row);
                } else if (name === 'Dungeon Count') {
                    row.id = 'jigs-dungeon-count-row';
                    row.style.display = isCurrentlyDungeon ? 'grid' : 'none'; // Show if in dungeon mode
                    dungeonCountRow = row;
                    groupContainers.sim.appendChild(row);
                } else {
                    groupContainers.sim.appendChild(row);
                }

                jigsNameToPageElementMap.set(name, pageEl);
                itemsFound++;
            }
        }

        // Update the mode toggle listener to also control Duration/Dungeon Count visibility
        if (durationRow && dungeonCountRow) {
            modeSelectRow.querySelectorAll('input[name="jigs-sim-mode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const mode = e.target.value;
                    if (zoneRow) zoneRow.style.display = mode === 'zone' ? 'grid' : 'none';
                    if (dungeonRow) dungeonRow.style.display = mode === 'dungeon' ? 'grid' : 'none';
                    if (durationRow) durationRow.style.display = mode === 'zone' ? 'grid' : 'none';
                    if (dungeonCountRow) dungeonCountRow.style.display = mode === 'dungeon' ? 'grid' : 'none';
                });
            });
        }

        const multInput = createNumberInput('Multiplier', currentMultiplier, 1, 100, false, false);
        groupContainers.sim.appendChild(multInput);

        if (itemsFound > 0) {
            statusDiv.textContent = t('statusIdle');
            document.getElementById('run-batch-button').disabled = false;
            document.getElementById('update-baseline-button').disabled = false;
            document.getElementById('reset-button').disabled = false;
            document.getElementById('add-to-queue-button').disabled = false;
            document.getElementById('import-triggers-checkbox').disabled = false;
        } else {
            statusDiv.textContent = 'Status: No data found. Import or use Capture Setup.';
        }
        document.getElementById('capture-setup-button').disabled = false;
    }
    async function updateBaseline(withTriggers = true) {
        const getPricesButton = document.getElementById('buttonGetPrices');
        if (getPricesButton) {
            console.log("JIGS DEBUG: Clicking 'Get Prices' button as a backup.");
            getPricesButton.click();
        }
        console.log("JIGS DEBUG: updateBaseline started.");
        setRunningState(true);
        const jigsProgressContainer = document.getElementById('jigs-progress-container');
        const jigsProgressBar = document.getElementById('jigs-progress-bar');

        if (withTriggers) {
            statusDiv.textContent = t('statusImportingTriggers');
            await importTriggers(true);
        }

        statusDiv.textContent = t('statusApplyingSettings');
        jigsProgressContainer.style.display = 'block';
        jigsProgressBar.style.width = '0%';
        try {
            // First, ensure the correct mode is set in the simulator
            const currentJigsMode = document.querySelector('input[name="jigs-sim-mode"]:checked')?.value || 'zone';
            const simDungeonToggle = document.getElementById('simDungeonToggle');
            if (simDungeonToggle) {
                const shouldBeChecked = currentJigsMode === 'dungeon';
                if (simDungeonToggle.checked !== shouldBeChecked) {
                    console.log(`JIGS DEBUG: Setting simulator dungeon mode to ${shouldBeChecked}`);
                    simDungeonToggle.checked = shouldBeChecked;
                    simDungeonToggle.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise(r => setTimeout(r, 100)); // Wait for mode change to apply
                }
            }

            const simSettings = document.querySelectorAll('#sim-settings-group select, #sim-settings-group input');
            console.log("JIGS DEBUG: Applying sim setting changes before baseline run.");
            simSettings.forEach(uiEl => {
                if (!uiEl.dataset.name) return;
                if (uiEl.value !== uiEl.dataset.originalValue) {
                    const pageEl = jigsNameToPageElementMap.get(uiEl.dataset.name);
                    if (pageEl) {
                        console.log(`JIGS DEBUG: Changing '${uiEl.dataset.name}' on page to '${uiEl.value}'`);
                        if (pageEl.tagName === 'SELECT') {
                            const opt = findOptionByI18nOrText(pageEl, uiEl.value);
                            if (opt) pageEl.value = opt.value;
                        } else {
                            pageEl.value = uiEl.value;
                        }
                        pageEl.dispatchEvent(new Event('change', { bubbles: true }));
                        pageEl.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            });
            const multiplier = parseInt(document.querySelector('#sim-settings-group [data-name="Multiplier"]').value) || 1;
            console.log(`JIGS DEBUG: Running baseline simulation with multiplier: ${multiplier}`);

            const startTime = performance.now();
            const simResult = await runSimulationMultiple(multiplier, progress => { jigsProgressBar.style.width = `${progress}%`; });
            const endTime = performance.now();
            if (multiplier > 0) {
                baselineRunTime = (endTime - startTime) / multiplier;
            }

            console.log(`JIGS DEBUG: Baseline sim complete. Result:`, simResult);

            if (!isNaN(simResult.averageDps)) {
                baselineDps = simResult.averageDps;
                baselineTeamDps = simResult.averageTeamDps;
                baselineProfit = simResult.averageProfit;
                baselineExp = simResult.averageExp;
                baselineEph = simResult.averageEph;
                baselineDph = simResult.averageDph;
                console.log(`JIGS DEBUG: New baselines set -> DPS: ${baselineDps}, Team DPS: ${baselineTeamDps}, Profit: ${baselineProfit}, Exp: ${baselineExp}, EPH: ${baselineEph}, DPH: ${baselineDph}`);
                document.getElementById('baseline-dps-input').value = baselineDps.toFixed(2);
                document.getElementById('baseline-team-dps-input').value = baselineTeamDps.toFixed(2);
                document.getElementById('baseline-profit-input').value = formatGold(baselineProfit);
                document.getElementById('baseline-exp-input').value = baselineExp.toLocaleString();
                document.getElementById('baseline-eph-input').value = baselineEph.toFixed(2);
                document.getElementById('baseline-dph-input').value = baselineDph.toFixed(2);

                captureBaselineSkillRates();
                updateQueueEstimate();

const baselineDisplayDiv = document.getElementById('jigs-baseline-results-display');
if (baselineDisplayDiv) {
    // Use the same formatters JIGS Stats expects or simple number formats
    document.getElementById('base-dps').textContent = baselineDps.toFixed(2); // Use number format
    document.getElementById('base-team-dps').textContent = baselineTeamDps.toFixed(2); // Team DPS
    document.getElementById('base-profit').textContent = formatGold(baselineProfit); // Gold format is correct here
    document.getElementById('base-exp').textContent = baselineExp.toLocaleString(); // Number format is fine
    document.getElementById('base-eph').textContent = baselineEph.toFixed(2); // Number format
    // DPH isn't used by Stats, but keep it for display consistency
    document.getElementById('base-dph').textContent = baselineDph.toFixed(2);
    baselineDisplayDiv.style.display = 'block'; // Make the table visible
}

                document.querySelectorAll('#batch-inputs-container input, #batch-inputs-container select').forEach(el => {
                    if (el.dataset.originalValue !== undefined) {
                        el.dataset.originalValue = el.value;
                        el.classList.remove('jigs-modified');
                    }
                });
                statusDiv.textContent = t('statusBaselineUpdated');
            } else if (isBatchRunning) {
                statusDiv.textContent = t('errorBaselineFailed');
                console.error("JIGS DEBUG: Failed to update baseline; simulation returned NaN.");
            }
        } finally {
            setRunningState(false);
        }
    }

    async function applyTriggerChanges(triggerData) {
        const type = triggerData.type;
        const index = triggerData.index;
        const typeCap = type.charAt(0).toUpperCase() + type.slice(1);
        const buttonId = `button${typeCap}Trigger_${index}`;
        const triggerButton = document.getElementById(buttonId);

        if (!triggerButton) {
            console.error(`JIGS: Could not find trigger button ${buttonId} to apply changes.`);
            return;
        }

        triggerButton.click();
        await new Promise(r => setTimeout(r, 100));

        const modal = document.getElementById('triggerModal');
        if (!modal || !modal.classList.contains('show')) {
            const closeBtn = document.querySelector('button.btn-close[data-bs-dismiss="modal"]');
            if(closeBtn) closeBtn.click();
            throw new Error(`Modal for ${buttonId} did not open for applying trigger changes.`);
        }

        const setPageSelect = (selectElement, textToFind) => {
            const option = Array.from(selectElement.options).find(o => o.text === textToFind);
            if (option) {
                selectElement.value = option.value;
            } else if (textToFind === "") {
                selectElement.value = "";
            }
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        };

        setPageSelect(document.getElementById('selectTriggerDependency_0'), triggerData.dependency);
        setPageSelect(document.getElementById('selectTriggerCondition_0'), triggerData.condition);
        setPageSelect(document.getElementById('selectTriggerComparator_0'), triggerData.comparator);

        const valInput = document.getElementById('inputTriggerValue_0');
        valInput.value = triggerData.value;
        valInput.dispatchEvent(new Event('input', { bubbles: true }));
        valInput.dispatchEvent(new Event('change', { bubbles: true }));

        document.getElementById('buttonTriggerModalSave').click();
        await new Promise(r => setTimeout(r, 100));
    }

    // Generate label for queue item based on upgrades
    function generateQueueLabel(upgrades) {
        let labelParts = [];
        for (const upgrade of upgrades) {
            let partLabel = upgrade.customLabel || '';
            if (!partLabel) {
                if (!upgrade.isTriggerOnly) {
                    const baseName = upgrade.name;
                    const isConsumableOrAbility = baseName.startsWith('Ability') || baseName.startsWith('Food') || baseName.startsWith('Drink');
                    const itemChanged = upgrade.value && upgrade.originalValue && upgrade.value !== upgrade.originalValue;
                    const enhChanged = upgrade.enhancement;
                    const levelChanged = upgrade.level;

                    if (itemChanged) {
                        partLabel = isConsumableOrAbility ? `${upgrade.originalValue} -> ${upgrade.value}` : `${baseName}: ${upgrade.originalValue} -> ${upgrade.value}`;
                    }

                    if (enhChanged) {
                        // For equipment, get the actual selected item name (not the slot label)
                        let staticItemName = upgrade.value;
                        const jigsElement = document.querySelector(`#batch-inputs-container [data-name="${baseName}"]`);
                        if (jigsElement && jigsElement.tagName === 'SELECT') {
                            // Get the currently selected option's text (the actual equipment name)
                            const selectedOption = jigsElement.options[jigsElement.selectedIndex];
                            if (selectedOption && selectedOption.text && selectedOption.text !== 'Empty') {
                                staticItemName = selectedOption.text.trim();
                            }
                        } else if (jigsElement) {
                            staticItemName = jigsElement.dataset.originalValue;
                        }
                        // Use translated "Enhancement" label
                        const enhI18nKey = nameToI18nMap['Enhancement'];
                        const enhLabel = (enhI18nKey && typeof i18next !== 'undefined')
                            ? i18next.t(enhI18nKey).replace(/<br\s*\/?>/gi, ' ').trim()
                            : 'Enhancement';
                        let enhText = `${enhLabel} ${upgrade.enhancement.originalValue} -> ${upgrade.enhancement.value}`;
                        partLabel = itemChanged ? `${partLabel} & ${enhText}` : `${staticItemName}: ${enhText}`;
                    } else if (levelChanged) {
                        // For abilities/food/drink, get the actual selected item name (not the slot label)
                        let staticItemName = upgrade.value;
                        const jigsElement = document.querySelector(`#batch-inputs-container [data-name="${baseName}"]`);
                        if (jigsElement && jigsElement.tagName === 'SELECT') {
                            // Get the currently selected option's text (the actual ability/food/drink name)
                            const selectedOption = jigsElement.options[jigsElement.selectedIndex];
                            if (selectedOption && selectedOption.text && selectedOption.text !== 'Empty') {
                                staticItemName = selectedOption.text.trim();
                            }
                        } else if (jigsElement) {
                            staticItemName = jigsElement.dataset.originalValue;
                        }
                        // Use translated "Level" label
                        const levelI18nKey = nameToI18nMap['Level'];
                        const levelLabel = (levelI18nKey && typeof i18next !== 'undefined')
                            ? i18next.t(levelI18nKey).replace(/<br\s*\/?>/gi, ' ').trim()
                            : 'Level';
                        let levelText = `${levelLabel} ${upgrade.level.originalValue} -> ${upgrade.level.value}`;
                        partLabel = itemChanged ? `${partLabel} & ${levelText}` : `${staticItemName}: ${levelText}`;
                    }
                }
                if (upgrade.triggerChange) {
                    let triggerLabel = 'Trigger Change';
                     if (upgrade.triggerChange.data && upgrade.triggerChange.data.value) {
                        triggerLabel += ` (Val: ${upgrade.triggerChange.data.value})`;
                    }
                    if (!upgrade.isTriggerOnly) {
                        // Get the actual item name for non-trigger-only changes
                        let triggerBaseName = upgrade.value;
                        const jigsElement = document.querySelector(`#batch-inputs-container [data-name="${upgrade.name}"]`);
                        if (jigsElement && jigsElement.tagName === 'SELECT') {
                            const selectedOption = jigsElement.options[jigsElement.selectedIndex];
                            if (selectedOption && selectedOption.text && selectedOption.text !== 'Empty') {
                                triggerBaseName = selectedOption.text.trim();
                            }
                        } else if (jigsElement) {
                            triggerBaseName = jigsElement.dataset.originalValue;
                        }
                        triggerLabel = `${triggerBaseName} ${triggerLabel}`;
                    } else {
                        const tc = upgrade.triggerChange;
                        const jigsName = `${tc.type.charAt(0).toUpperCase() + tc.type.slice(1)} ${parseInt(tc.index) + 1}`;
                        const associatedSelect = document.querySelector(`#batch-inputs-container [data-name="${jigsName}"]`);
                        if (associatedSelect && associatedSelect.tagName === 'SELECT') {
                            const selectedOption = associatedSelect.options[associatedSelect.selectedIndex];
                            if (selectedOption && selectedOption.text && selectedOption.text !== 'Empty') {
                                triggerLabel = `${selectedOption.text.trim()} ${triggerLabel}`;
                            }
                        } else if (associatedSelect) {
                            triggerLabel = `${associatedSelect.value} ${triggerLabel}`;
                        }
                    }
                    partLabel = partLabel ? `${partLabel} & ${triggerLabel}` : triggerLabel;
                }
            }
            if(partLabel) labelParts.push(partLabel);
        }
        return labelParts.filter(p => p).join(' & ');
    }

    function addChangesToQueue() {
        let allChanges = [];
        document.querySelectorAll("#batch-inputs-container input:not([type=checkbox]), #batch-inputs-container select").forEach(el => {
            const triggerContainer = el.closest('.trigger-container');
            if (el.id !== 'jigs-player-select' && !el.classList.contains('jigs-price-override') && !triggerContainer && !el.disabled && el.dataset.name && el.value !== el.dataset.originalValue) {
                const row = el.closest('.batch-input-row, .batch-input-row-equip, .batch-input-row-ability, .house-grid-item');
                const isConstant = row.querySelector('.jigs-constant-checkbox')?.checked || false;
                const change = {
                    element: el,
                    name: el.dataset.name,
                    value: el.value,
                    originalValue: el.dataset.originalValue,
                    isConstant: isConstant
                };
                if (row.classList.contains('batch-input-row-equip')) {
                    const priceInput = row.querySelector('.jigs-price-override');
                    if (priceInput && priceInput.value.trim() !== '') {
                        change.priceOverride = priceInput.value.trim();
                    }
                }
                allChanges.push(change);
            }
        });

        let allTriggerChanges = [];
        document.querySelectorAll('.trigger-container').forEach(container => {
            const mainRow = container.querySelector('.trigger-row');
            const rangeRow = container.querySelector('.trigger-range-row');
            const depEl = mainRow.querySelector('.jigs-trigger-dependency');
            const condEl = mainRow.querySelector('.jigs-trigger-condition');
            const compEl = mainRow.querySelector('.jigs-trigger-comparator');
            const valEl = mainRow.querySelector('.jigs-trigger-value');
            const rangeEl = rangeRow.querySelector('.jigs-trigger-range');
            const incEl = rangeRow.querySelector('.jigs-trigger-increment');
            const hasChanged = depEl.value !== depEl.dataset.originalValue ||
                                 condEl.value !== condEl.dataset.originalValue ||
                                 compEl.value !== compEl.dataset.originalValue ||
                                 valEl.value !== valEl.dataset.originalValue ||
                                 rangeEl.value !== rangeEl.dataset.originalValue ||
                                 incEl.value !== incEl.dataset.originalValue;
            if (hasChanged) {
                allTriggerChanges.push({
                    type: mainRow.dataset.triggerType,
                    index: mainRow.dataset.triggerIndex,
                    isConstant: false,
                    data: { dependency: depEl.value, condition: condEl.value, comparator: compEl.value, value: valEl.value },
                    range: rangeEl.value.trim(),
                    increment: incEl.value.trim()
                });
            }
        });

        const allGroupedChanges = groupAllChanges(allChanges, allTriggerChanges);
        if (allGroupedChanges.length === 0) {
            statusDiv.textContent = t('statusNoChanges');
            return;
        }

        const constantUpgrades = allGroupedChanges.filter(c => c.isConstant);
        const individualUpgrades = allGroupedChanges.filter(c => !c.isConstant);
        let itemsAdded = 0;

        if (individualUpgrades.length === 0 && constantUpgrades.length > 0) {
            const queueItem = { upgrades: constantUpgrades, label: generateQueueLabel(constantUpgrades) || t('constantsOnly') };
            simulationQueue.push(queueItem);
            itemsAdded = 1;
        } else {
             for (const individual of individualUpgrades) {
                const tc = individual.triggerChange;
                const hasRange = tc && tc.range && tc.increment;

                if (hasRange) {
                    const [startStr, endStr] = tc.range.split('-').map(s => s.trim());
                    const start = parseInt(startStr);
                    const end = parseInt(endStr);
                    const increment = parseInt(tc.increment);

                    if (!isNaN(start) && !isNaN(end) && !isNaN(increment) && increment > 0 && end >= start) {
                        for (let value = start; value <= end; value += increment) {
                            const simUpgrade = JSON.parse(JSON.stringify(individual));
                            simUpgrade.triggerChange.data.value = value;

                            const upgrades = [...constantUpgrades, simUpgrade];
                            simulationQueue.push({ upgrades, label: generateQueueLabel(upgrades) });
                            itemsAdded++;
                        }
                    } else {
                        const upgrades = [...constantUpgrades, individual];
                        simulationQueue.push({ upgrades, label: generateQueueLabel(upgrades) });
                        itemsAdded++;
                    }
                } else {
                    const upgrades = [...constantUpgrades, individual];
                    simulationQueue.push({ upgrades, label: generateQueueLabel(upgrades) });
                    itemsAdded++;
                }
            }
        }

        statusDiv.textContent = `${t('statusAddedToQueue')} ${itemsAdded} ${t('simulationsToQueue')}`;
        updateQueuePanelUI();
        resetInputsToBaseline();
    }

    async function startBatch() {
        if (simulationQueue.length === 0) {
            statusDiv.textContent = t('statusQueueEmpty');
            return;
        }
        const getPricesButton = document.getElementById('buttonGetPrices');
        if (getPricesButton) {
            console.log("JIGS DEBUG: Clicking 'Get Prices' button as a backup.");
            getPricesButton.click();
        }
        console.log("JIGS DEBUG: startBatch started.");
        updateBaselinesFromInputs();

        const isInfinite = document.getElementById('infinite-queue-checkbox').checked;
        let lastModifiedTriggers = [];
        setRunningState(true);

        try {
            await fetchMarketData();
            if (!isBatchRunning) { statusDiv.textContent = t('statusStoppedByUser'); return; }
            if (!marketData) { console.error("JIGS DEBUG: Market data not available."); setRunningState(false); return; }
            if (baselineDps === 0) { statusDiv.textContent = t('errorNoBaseline'); console.warn("JIGS DEBUG: baselineDps is 0."); setRunningState(false); return; }

            const jigsProgressContainer = document.getElementById('jigs-progress-container');
            const jigsProgressBar = document.getElementById('jigs-progress-bar');
            jigsProgressContainer.style.display = 'block';

            const simulationsToRun = [...simulationQueue];
            console.log(`JIGS DEBUG: Found ${simulationsToRun.length} simulations to run from queue. Infinite mode: ${isInfinite}`);

            const multiplier = parseInt(document.querySelector('#sim-settings-group [data-name="Multiplier"]').value) || 1;
            let totalSimsCompleted = 0;

            while (isBatchRunning) { // Main loop for infinite mode
                for (let i = 0; i < simulationsToRun.length; i++) {
                    const simulation = simulationsToRun[i];
                    if (!isBatchRunning) break;

                    jigsProgressBar.style.width = '0%'; // Reset progress for each item in the queue


// --- Reset all page elements to baseline ---
// Get current simulation mode
const currentSimMode = document.querySelector('input[name="jigs-sim-mode"]:checked')?.value || 'zone';

// First, ensure the correct mode is set in the simulator
const simDungeonToggleForReset = document.getElementById('simDungeonToggle');
if (simDungeonToggleForReset) {
    const shouldBeChecked = currentSimMode === 'dungeon';
    if (simDungeonToggleForReset.checked !== shouldBeChecked) {
        console.log(`JIGS DEBUG: Setting simulator dungeon mode to ${shouldBeChecked} during reset`);
        simDungeonToggleForReset.checked = shouldBeChecked;
        simDungeonToggleForReset.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100)); // Wait for mode change to apply
    }
}

jigsNameToPageElementMap.forEach((pageEl, name) => {
    // Skip Zone if in dungeon mode, skip Dungeon if in zone mode
    if ((name === 'Zone' && currentSimMode === 'dungeon') || (name === 'Dungeon' && currentSimMode === 'zone')) {
        return;
    }
    // Skip Duration if in dungeon mode, skip Dungeon Count if in zone mode
    if ((name === 'Duration' && currentSimMode === 'dungeon') || (name === 'Dungeon Count' && currentSimMode === 'zone')) {
        return;
    }

    const jigsEl = document.querySelector(`#batch-inputs-container [data-name="${name}"]`);
    if(jigsEl && pageEl) {
        const originalValue = jigsEl.dataset.originalValue;

        if (pageEl.tagName === 'SELECT') {
            const opt = findOptionByI18nOrText(pageEl, originalValue);
            if (opt) pageEl.value = opt.value;
        } else {
            // For all other inputs (including house number inputs)
            pageEl.value = originalValue;
        }

        // Dispatch change event
        pageEl.dispatchEvent(new Event('change', { bubbles: true }));

        // Dispatch input event for number/text inputs to ensure simulator updates immediately
        if (pageEl.tagName !== 'SELECT') {
            pageEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
});

                    // --- Reset all triggers to baseline ---
                    for (const triggerToReset of lastModifiedTriggers) {
                        const type = triggerToReset.type;
                        const index = triggerToReset.index;
                        const triggerRow = document.querySelector(`.trigger-row[data-trigger-type="${type}"][data-trigger-index="${index}"]`);
                        if (triggerRow) {
                            const originalState = {
                                type: type, index: index,
                                dependency: triggerRow.querySelector('.jigs-trigger-dependency').dataset.originalValue,
                                condition: triggerRow.querySelector('.jigs-trigger-condition').dataset.originalValue,
                                comparator: triggerRow.querySelector('.jigs-trigger-comparator').dataset.originalValue,
                                value: triggerRow.querySelector('.jigs-trigger-value').dataset.originalValue
                            };
                            await applyTriggerChanges(originalState);
                        }
                    }
                    lastModifiedTriggers = [];
                    await new Promise(r => setTimeout(r, 50));

                    let totalCost = 0;
                    let totalBooks = 0;
                    let timeToLevelText = '';

                    // --- Apply this simulation's specific upgrades ---
                    // Get current simulation mode
                    const applySimMode = document.querySelector('input[name="jigs-sim-mode"]:checked')?.value || 'zone';

                    for (const upgrade of simulation.upgrades) {
                        if (!upgrade.isTriggerOnly) {
                            const applyChange = (name, newValue) => {
                                // Skip Zone if in dungeon mode, skip Dungeon if in zone mode
                                if ((name === 'Zone' && applySimMode === 'dungeon') || (name === 'Dungeon' && applySimMode === 'zone')) {
                                    return;
                                }
                                // Skip Duration if in dungeon mode, skip Dungeon Count if in zone mode
                                if ((name === 'Duration' && applySimMode === 'dungeon') || (name === 'Dungeon Count' && applySimMode === 'zone')) {
                                    return;
                                }

                                const el = jigsNameToPageElementMap.get(name);
                                if (!el) { console.warn(`JIGS: Could not find page element for "${name}" to apply change.`); return; }
                                if (el.tagName === 'SELECT') {
                                    const opt = findOptionByI18nOrText(el, newValue);
                                    if (opt) el.value = opt.value;
                                } else {
                                    el.value = newValue;
                                }
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                            };

                            if (upgrade.value) { applyChange(upgrade.name, upgrade.value); }
                            if (upgrade.enhancement) { applyChange(upgrade.enhancement.name, upgrade.enhancement.value); }
                            if (upgrade.level) { applyChange(upgrade.level.name, upgrade.level.value); }
                        }
                        if (upgrade.triggerChange) {
                            const tc = upgrade.triggerChange;
                            await applyTriggerChanges({ ...tc.data, type: tc.type, index: tc.index });
                            lastModifiedTriggers.push(tc);
                        }
                    }

                    // --- Update status and run the simulation ---
                    const statusText = isInfinite
                        ? `${t('statusSimulating')} (${t('loopRun')} ${totalSimsCompleted + 1}): ${simulation.label}`
                        : `${t('statusSimulating')} (${i + 1}/${simulationsToRun.length}): ${simulation.label}`;
                    statusDiv.textContent = statusText;

                    const singleSimProgress = (progress) => {
                        const overallProgress = isInfinite
                            ? progress // In infinite mode, progress bar is for the current item only
                            : ((i + (progress / 100)) / simulationsToRun.length) * 100;
                        jigsProgressBar.style.width = `${overallProgress}%`;
                    };

                    const simResult = await runSimulationMultiple(multiplier, singleSimProgress);
                    const newDps = simResult.averageDps;
                    const newTeamDps = simResult.averageTeamDps;
                    const newProfit = simResult.averageProfit;
                    const newExp = simResult.averageExp;
                    const newEph = simResult.averageEph;
                    const newDph = simResult.averageDph;

                    totalSimsCompleted++;
                    if (isNaN(newDps)) { console.error(`JIGS DEBUG: DPS is NaN for this upgrade. Skipping.`); continue; }

                    // --- Calculate cost and process results ---
                    for (const upgrade of simulation.upgrades) {
                        if (upgrade.isTriggerOnly) continue;
                        let cost = 0;
                        let booksNeeded = 0;
                        try {
                            if (houseKeywords.includes(upgrade.name)) {
                                const startLvl = parseInt(upgrade.originalValue);
                                const endLvl = parseInt(upgrade.value);
                                const roomRecipes = HOUSE_RECIPES[upgrade.name];
                                if (roomRecipes) {
                                    for (let j = startLvl; j < endLvl; j++) {
                                        if (!isFinite(cost)) break;
                                        const recipe = roomRecipes[j + 1];
                                        if (recipe) {
                                            cost += recipe.gold;
                                            for (const materialId in recipe.materials) {
                                                const materialName = ITEM_ID_TO_NAME_MAP[materialId];
                                                if (!materialName) { cost = Infinity; break; }
                                                const materialKey = materialName.replace(/'/g, '').toLowerCase();
                                                const price = marketData[materialKey]?.seller === -1 ? Infinity : marketData[materialKey]?.seller || Infinity;
                                                if (price === Infinity) { cost = Infinity; break; }
                                                cost += price * recipe.materials[materialId];
                                            }
                                        }
                                    }
                                }
                            } else if (skillKeywords.includes(upgrade.name)) {
                                cost = 0;
                                const startLvl = parseInt(upgrade.originalValue);
                                const endLvl = parseInt(upgrade.value);
                                if (endLvl > startLvl) {
                                    const xpRate = getSkillXpRate(upgrade.name);
                                    if (xpRate > 0) {
                                        const startXp = ABILITY_XP_LEVELS[startLvl] || 0;
                                        const endXp = ABILITY_XP_LEVELS[endLvl] || 0;
                                        const xpNeeded = endXp - startXp;
                                        if (xpNeeded > 0) {
                                            const hoursNeeded = xpNeeded / xpRate;
                                            const daysNeeded = hoursNeeded / 24;
                                            timeToLevelText = daysNeeded < 1 ? `(${(hoursNeeded).toFixed(1)} hrs)` : `(${(daysNeeded).toFixed(1)} days)`;
                                        }
                                    }
                                }
                            } else if (equipmentKeywords.includes(upgrade.name)) {
                                let newPrice = Infinity;
                                if (upgrade.priceOverride) {
                                    const parsedPrice = parseGold(upgrade.priceOverride);
                                    if (isFinite(parsedPrice)) { newPrice = parsedPrice; }
                                } else {
                                    const baseName = upgrade.name;
                                    const newSimName = upgrade.value || document.querySelector(`#batch-inputs-container [data-name="${baseName}"]`)?.dataset.originalValue;
                                    const newMarketName = SIMULATOR_TO_MARKET_MAP[newSimName] || newSimName;
                                    const newEnhName = `${baseName} Enhancement`;
                                    const newEnh = upgrade.enhancement ? upgrade.enhancement.value : document.querySelector(`#batch-inputs-container [data-name="${newEnhName}"]`)?.dataset.originalValue || 0;
                                    const newKey = newEnh == 0 ? newMarketName.replace(/'/g, '').toLowerCase() : `${newMarketName.replace(/'/g, '').toLowerCase()} +${newEnh}`;
                                    const newPriceRaw = marketData[newKey]?.seller;
                                    newPrice = (newPriceRaw === undefined || newPriceRaw === -1) ? Infinity : newPriceRaw;
                                }

                                const baseName = upgrade.name;
                                const oldSimName = upgrade.originalValue || document.querySelector(`#batch-inputs-container [data-name="${baseName}"]`)?.dataset.originalValue;
                                if (!oldSimName) { throw new Error(`Could not determine original item name for ${baseName}`); }

                                const oldMarketName = SIMULATOR_TO_MARKET_MAP[oldSimName] || oldSimName;
                                const oldEnhName = `${baseName} Enhancement`;
                                const oldEnh = upgrade.enhancement ? upgrade.enhancement.originalValue : document.querySelector(`#batch-inputs-container [data-name="${oldEnhName}"]`)?.dataset.originalValue || 0;
                                const oldKey = oldEnh == 0 ? oldMarketName.replace(/'/g, '').toLowerCase() : `${oldMarketName.replace(/'/g, '').toLowerCase()} +${oldEnh}`;
                                const oldPriceRaw = marketData[oldKey]?.buyer;
                                const oldPrice = (oldPriceRaw === undefined || oldPriceRaw === -1 || oldMarketName === 'Empty') ? 0 : oldPriceRaw;

                                cost = newPrice - oldPrice;
                            } else if (upgrade.name.startsWith('Ability')) {
                                const baseName = upgrade.name;
                                const abilityName = upgrade.value || document.querySelector(`#batch-inputs-container [data-name="${baseName}"]`)?.dataset.originalValue;

                                // Get English name via i18n from the page element
                                let marketItemName = abilityName;
                                const pageSelect = jigsNameToPageElementMap.get(baseName);
                                if (pageSelect && pageSelect.tagName === 'SELECT') {
                                    // Find the option matching the current ability name
                                    const matchingOption = Array.from(pageSelect.options).find(opt => {
                                        const optText = opt.textContent.trim();
                                        const optValue = opt.value;
                                        return optText === abilityName || optValue === abilityName;
                                    });

                                    if (matchingOption) {
                                        const i18nKey = matchingOption.getAttribute('data-i18n');
                                        if (i18nKey && typeof i18next !== 'undefined') {
                                            try {
                                                const englishName = i18next.t(i18nKey, { lng: 'en' });
                                                if (englishName && englishName !== i18nKey) {
                                                    marketItemName = englishName;
                                                }
                                            } catch (e) {
                                                console.warn('JIGS: Failed to get English translation for ability in cost calculation', i18nKey, e);
                                            }
                                        }
                                    }
                                }

                                const correctlyCasedKey = Object.keys(SPELL_BOOK_XP).find(k => k.toLowerCase() === marketItemName.toLowerCase());
                                const xpPerBook = correctlyCasedKey ? SPELL_BOOK_XP[correctlyCasedKey] : undefined;
                                if (abilityName === 'Empty' || xpPerBook === undefined) { cost = 0; } else {
                                    const materialKey = marketItemName.replace(/'/g, '').toLowerCase();
                                    const priceOfThisBook = marketData[materialKey]?.seller === -1 ? Infinity : marketData[materialKey]?.seller || Infinity;
                                    const levelName = `${baseName} Level`;
                                    const startLvl = upgrade.level ? upgrade.level.originalValue : document.querySelector(`#batch-inputs-container [data-name="${levelName}"]`)?.dataset.originalValue;
                                    const endLvl = upgrade.level ? upgrade.level.value : document.querySelector(`#batch-inputs-container [data-name="${levelName}"]`)?.dataset.originalValue;
                                    if (Number(endLvl) > Number(startLvl)) {
                                        const startXp = ABILITY_XP_LEVELS[startLvl] || 0;
                                        const endXp = ABILITY_XP_LEVELS[endLvl] || 0;
                                        const xpNeeded = endXp - startXp;
                                        booksNeeded = Math.ceil(xpNeeded / xpPerBook);
                                        cost = booksNeeded * priceOfThisBook;
                                    }
                                }
                            }
                        } catch (e) {
                            cost = Infinity;
                        }
                        if (isFinite(cost)) {
                            totalCost += cost;
                        } else {
                            totalCost = Infinity;
                        }
                        totalBooks += booksNeeded;
                    }

                    const dpsGain = newDps - baselineDps;
                    const percentChange = calcPercentChange(dpsGain, baselineDps);
                    const teamDpsGain = newTeamDps - baselineTeamDps;
                    const percentTeamDpsChange = calcPercentChange(teamDpsGain, baselineTeamDps);
                    const profitChange = newProfit - baselineProfit;
                    const percentProfitChange = calcPercentChange(profitChange, baselineProfit);
                    const expChange = newExp - baselineExp;
                    const percentExpChange = calcPercentChange(expChange, baselineExp);
                    const ephChange = newEph - baselineEph;
                    const percentEphChange = calcPercentChange(ephChange, baselineEph);
                    const dphChange = newDph - baselineDph;
                    const percentDphChange = (baselineDph > 0) ? (dphChange / baselineDph) * 100 : (dphChange !== 0 ? Infinity : 0);
                    const costPerPercent = calcCostPerPercent(totalCost, percentChange, dpsGain);
                    const costPerTeamDpsPercent = calcCostPerPercent(totalCost, percentTeamDpsChange, teamDpsGain);
                    const costPerProfitPercent = calcCostPerPercent(totalCost, percentProfitChange, profitChange);
                    const costPerExpPercent = calcCostPerPercent(totalCost, percentExpChange, expChange);
                    const costPerEphPercent = calcCostPerPercent(totalCost, percentEphChange, ephChange);
                    const timeToPurchaseDays = (baselineProfit > 0 && isFinite(totalCost)) ? (totalCost / baselineProfit) : Infinity;
                    const resultData = { upgrade: simulation.label, cost: totalCost, timeToPurchase: timeToPurchaseDays, dps: dpsGain, percent: percentChange, costPerDps: costPerPercent, teamDpsChange: teamDpsGain, percentTeamDpsChange: percentTeamDpsChange, costPerTeamDps: costPerTeamDpsPercent, books: totalBooks, averageDps: newDps, averageTeamDps: newTeamDps, individualRuns: simResult.individualRuns, profitChange: profitChange, percentProfitChange: percentProfitChange, costPerProfit: costPerProfitPercent, expChange: expChange, percentExpChange: percentExpChange, costPerExp: costPerExpPercent, ephChange: ephChange, percentEphChange: percentEphChange, costPerEph: costPerEphPercent, dphChange: dphChange, percentDphChange: percentDphChange, timeToLevelText: timeToLevelText };
                    addResultRow(resultData);
                    detailedResults.push(resultData);
                } // End for loop

                if (!isInfinite || !isBatchRunning) {
                    break; // Break the main while loop
                }
                console.log("JIGS DEBUG: Infinite run restarting queue.");
                statusDiv.textContent = t('statusRestartingQueue');
                await new Promise(r => setTimeout(r, 1000)); // Brief pause before restarting
            } // End while loop
        } finally {
            // --- Reset page elements back to their original baseline state ---
            document.querySelectorAll('#batch-inputs-container [data-original-value]').forEach(jigsEl => {
                const name = jigsEl.dataset.name;
                const originalValue = jigsEl.dataset.originalValue;
                const pageEl = jigsNameToPageElementMap.get(name);
                if (pageEl) {
                    if (pageEl.tagName === 'SELECT') {
                        const opt = findOptionByI18nOrText(pageEl, originalValue);
                        if (opt) pageEl.value = opt.value;
                    } else {
                        pageEl.value = originalValue;
                    }
                    pageEl.dispatchEvent(new Event('change', { bubbles: true }));
                    pageEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            for (const triggerToReset of lastModifiedTriggers) {
                 const type = triggerToReset.type;
                 const index = triggerToReset.index;
                 const triggerRow = document.querySelector(`.trigger-container [data-trigger-type="${type}"][data-trigger-index="${index}"]`);
                 if (triggerRow) {
                       const originalState = {
                           type: type, index: index,
                           dependency: triggerRow.querySelector('.jigs-trigger-dependency').dataset.originalValue,
                           condition: triggerRow.querySelector('.jigs-trigger-condition').dataset.originalValue,
                           comparator: triggerRow.querySelector('.jigs-trigger-comparator').dataset.originalValue,
                           value: triggerRow.querySelector('.jigs-trigger-value').dataset.originalValue
                       };
                       await applyTriggerChanges(originalState);
                 }
            }

            if (isBatchRunning) { statusDiv.textContent = t('statusDone'); } // Only shows on normal completion

            if (!isInfinite) {
                simulationQueue = [];
                updateQueuePanelUI();
            }

            if(detailedResults.length > 0) { document.getElementById('export-csv-button').disabled = false; }
            setRunningState(false);
            highlightResults();
            updateColumnVisibility();
        }
    }

    async function importTriggers(isCalledFromBaseline = false) {
        if (!isCalledFromBaseline) {
            console.log("JIGS DEBUG: Starting trigger import.");
            statusDiv.textContent = t('statusImportingTriggers');
            setRunningState(true);
        }

        const waitForModalContent = () => {
            return new Promise((resolve) => {
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    const dependencySelect = document.getElementById('selectTriggerDependency_0');
                    if (dependencySelect && dependencySelect.options.length > 1) {
                        clearInterval(interval);
                        resolve(true);
                    } else if (attempts > 20) { // Timeout after ~5 seconds
                        clearInterval(interval);
                        resolve(false);
                    }
                }, 250);
            });
        };

        try {
            const itemTypes = [
                { type: 'ability', count: 5, prefix: 'buttonAbilityTrigger_' },
                { type: 'food', count: 3, prefix: 'buttonFoodTrigger_' },
                { type: 'drink', count: 3, prefix: 'buttonDrinkTrigger_' }
            ];

            for (const item of itemTypes) {
                for (let i = 0; i < item.count; i++) {
                    if (!isBatchRunning && !isCalledFromBaseline) throw new Error('User stopped');

                    const buttonId = `${item.prefix}${i}`;
                    const triggerButton = document.getElementById(buttonId);
                    const jigsTriggerContainer = document.querySelector(`.trigger-container [data-trigger-type="${item.type}"][data-trigger-index="${i}"]`)?.closest('.trigger-container');
                    if (!triggerButton || !jigsTriggerContainer) continue;

                    if (!isCalledFromBaseline) {
                        statusDiv.textContent = `${t('statusImportingFor')} ${item.type} ${i + 1}...`;
                    }

                    triggerButton.click();

                    if (!await waitForModalContent()) {
                          console.warn(`JIGS: Modal content for ${buttonId} did not load.`);
                          const closeBtn = document.querySelector('#triggerModal button.btn-close');
                          if (closeBtn) closeBtn.click();
                          await new Promise(r => setTimeout(r, 250));
                          continue;
                    }

                    const scrapeAndSetSelect = (pageSelect, jigsSelect) => {
                        jigsSelect.innerHTML = '';
                        const selectedText = pageSelect.selectedOptions.length > 0 ? pageSelect.selectedOptions[0].text : '';
                        for (const option of pageSelect.options) {
                            jigsSelect.add(new Option(option.text, option.text));
                        }
                        jigsSelect.value = selectedText;
                        jigsSelect.dataset.originalValue = selectedText;
                    };

                    scrapeAndSetSelect(document.getElementById('selectTriggerDependency_0'), jigsTriggerContainer.querySelector('.jigs-trigger-dependency'));
                    scrapeAndSetSelect(document.getElementById('selectTriggerCondition_0'), jigsTriggerContainer.querySelector('.jigs-trigger-condition'));
                    scrapeAndSetSelect(document.getElementById('selectTriggerComparator_0'), jigsTriggerContainer.querySelector('.jigs-trigger-comparator'));

                    const valEl = document.getElementById('inputTriggerValue_0');
                    const jigsVal = jigsTriggerContainer.querySelector('.jigs-trigger-value');
                    jigsVal.value = valEl.value;
                    jigsVal.dataset.originalValue = valEl.value;

                    const rangeEl = jigsTriggerContainer.querySelector('.jigs-trigger-range');
                    rangeEl.value = '';
                    rangeEl.dataset.originalValue = '';
                    const incEl = jigsTriggerContainer.querySelector('.jigs-trigger-increment');
                    incEl.value = '';
                    incEl.dataset.originalValue = '';

                    document.querySelector('#triggerModal button.btn-close').click();
                    await new Promise(r => setTimeout(r, 250));
                }
            }
            if (!isCalledFromBaseline) {
                statusDiv.textContent = t('statusTriggerImportComplete');
            }
        } catch (e) {
            if (e.message === 'User stopped') {
                statusDiv.textContent = t('statusTriggerImportStopped');
            } else {
                console.error('JIGS: Error during trigger import.', e);
                statusDiv.textContent = t('errorTriggerImport');
            }
        } finally {
            if (!isCalledFromBaseline) {
                setRunningState(false);
            }
        }
    }

    function applySavedPanelStates() {
        const panels = [
            { id: 'batch-panel', toggleId: 'batch-toggle' },
            { id: 'jigs-results-panel', toggleId: 'results-toggle' },
            { id: 'jigs-queue-panel', toggleId: 'queue-toggle' }
        ];
        panels.forEach(p => {
            const panel = document.getElementById(p.id);
            if (!panel) return;

            const savedData = GM_getValue(`jigs_panel_positions_${p.id}`);
            if (savedData) {
                if (savedData.top && savedData.left) {
                    panel.style.top = savedData.top;
                    panel.style.left = savedData.left;
                    panel.style.bottom = 'auto';
                    panel.style.right = 'auto';
                }
                if (savedData.width) panel.style.width = savedData.width;
                if (savedData.height) panel.style.height = savedData.height;
            }

            const isMinimized = GM_getValue(`jigs_panel_minimized_${p.id}`, false);
            if (isMinimized) {
                panel.classList.add('jigs-minimized');
                const toggleButton = document.getElementById(p.toggleId);
                if (toggleButton) toggleButton.textContent = '+';
            }
        });
    }

    function updateUILanguage() {
        const updateElement = (id, key) => {
            const el = document.getElementById(id);
            if (el) el.textContent = t(key);
        };

        updateElement('capture-setup-button', 'manualCapture');
        updateElement('update-baseline-button', 'updateBaseline');
        updateElement('run-batch-button', 'runQueue');
        updateElement('add-to-queue-button', 'addToQueue');
        updateElement('reset-button', 'resetInputs');
        updateElement('stop-batch-button', 'stop');
        updateElement('clear-results-button', 'clearResults');
        updateElement('export-csv-button', 'exportCsv');
        updateElement('clear-queue-button', 'clearQueue');

        const resetButtons = document.querySelectorAll('#reset-panels-button, #reset-panels-button-results, #reset-panels-button-queue');
        resetButtons.forEach(btn => btn.title = t('tooltipResetPanels'));

        const importTriggerCheckbox = document.getElementById('import-triggers-checkbox');
        if (importTriggerCheckbox) importTriggerCheckbox.title = t('tooltipImportTriggers');

        const importTriggerLabel = document.querySelector('label[for="import-triggers-checkbox"]');
        if (importTriggerLabel) importTriggerLabel.textContent = t('importTriggers');

        const infiniteLabel = document.getElementById('infinite-run-label');
        if (infiniteLabel) {
            const checkbox = infiniteLabel.querySelector('input');
            infiniteLabel.innerHTML = '';
            infiniteLabel.appendChild(checkbox);
            infiniteLabel.appendChild(document.createTextNode(' ' + t('infinite')));
        }

        document.querySelectorAll('#baseline-container label').forEach((label, index) => {
            const keys = ['baselineDps', 'baselineTeamDps', 'profitDay', 'expHour', 'eph', 'dph'];
            if (keys[index]) label.textContent = t(keys[index]);
        });

        document.querySelectorAll('#column-checkboxes label').forEach(label => {
            const checkbox = label.querySelector('input');
            const col = checkbox?.dataset.col;
            if (col) {
                const keyMap = {
                    'ttp-col': 'timeToPurchase',
                    'dps-col': 'dpsCol',
                    'team-dps-col': 'dpsCol',
                    'profit-col': 'profitCol',
                    'exp-col': 'experienceCol',
                    'eph-col': 'eph',
                    'dph-col': 'dph'
                };
                if (keyMap[col]) {
                    label.innerHTML = '';
                    label.appendChild(checkbox);
                    const prefix = col === 'team-dps-col' ? 'Team ' : '';
                    label.appendChild(document.createTextNode(' ' + prefix + t(keyMap[col])));
                }
            }
        });

        const showColumnsText = document.querySelector('#column-checkboxes').previousSibling;
        if (showColumnsText && showColumnsText.nodeType === Node.TEXT_NODE) {
            showColumnsText.textContent = t('showColumns') + ' ';
        }

        document.querySelectorAll('details summary').forEach(summary => {
            const parent = summary.parentElement;
            const keyMap = {
                'sim-settings-group': 'simSettings',
                'skills-group': 'skills',
                'equipment-group': 'equipment',
                'abilities-group': 'abilities',
                'food-drink-group': 'foodDrink',
                'house-group': 'house'
            };
            const key = keyMap[parent.id];
            if (key) summary.textContent = t(key);
        });

        document.querySelectorAll('#batch-results-table thead th').forEach(th => {
            const keyMap = {
                'upgrade': 'upgrade',
                'cost': 'upgradeCost',
                'timeToPurchase': 'timeToPurchase',
                'dpsChange': 'dpsChange',
                'percentChange': 'percentDpsChange',
                'costPerDps': 'goldPerDps',
                'profitChange': 'profitChange',
                'percentProfitChange': 'percentProfitChange',
                'costPerProfit': 'goldPerProfit',
                'expChange': 'expChange',
                'percentExpChange': 'percentExpChange',
                'costPerExp': 'goldPerExp',
                'ephChange': 'ephChange',
                'percentEphChange': 'percentEphChange',
                'costPerEph': 'goldPerEph',
                'dphChange': 'dphChange',
                'percentDphChange': 'percentDphChange'
            };
            const tooltipKeyMap = {
                'upgrade': 'tooltipUpgrade',
                'cost': 'tooltipCost',
                'timeToPurchase': 'tooltipTimeToPurchase',
                'dpsChange': 'tooltipDpsChange',
                'percentChange': 'tooltipPercentChange',
                'costPerDps': 'tooltipCostPerDps',
                'profitChange': 'tooltipProfitChange',
                'percentProfitChange': 'tooltipPercentProfitChange',
                'costPerProfit': 'tooltipCostPerProfit',
                'expChange': 'tooltipExpChange',
                'percentExpChange': 'tooltipPercentExpChange',
                'costPerExp': 'tooltipCostPerExp',
                'ephChange': 'tooltipEphChange',
                'percentEphChange': 'tooltipPercentEphChange',
                'costPerEph': 'tooltipCostPerEph',
                'dphChange': 'tooltipDphChange',
                'percentDphChange': 'tooltipPercentDphChange'
            };
            const sortKey = th.dataset.sortKey;
            if (sortKey && keyMap[sortKey]) {
                const classes = th.className;
                th.textContent = t(keyMap[sortKey]);
                th.className = classes;
                if (tooltipKeyMap[sortKey]) {
                    th.title = t(tooltipKeyMap[sortKey]);
                }
            }
        });

        const headerSpans = [
            { selector: '#batch-header span', key: 'jigs' },
            { selector: '#jigs-results-header span', key: 'results' },
            { selector: '#jigs-queue-header span', key: 'simulationQueue' }
        ];
        headerSpans.forEach(({selector, key}) => {
            const span = document.querySelector(selector);
            if (span) span.textContent = t(key);
        });

        // Update special labels that are dynamically generated (abilities with numbers, food/drink with numbers, Multiplier)
        document.querySelectorAll('#batch-inputs-container label').forEach(label => {
            // Check if this is an ability label (Ability 2-5, shown as Ability 1-4 with numbers)
            const abilityIndex = label.getAttribute('data-jigs-ability-index');
            const abilityI18n = label.getAttribute('data-jigs-ability-i18n');
            if (abilityIndex && abilityI18n && typeof i18next !== 'undefined') {
                const abilityText = i18next.t(abilityI18n).replace(/<br\s*\/?>/gi, ' ').trim();
                label.textContent = `${abilityText} ${abilityIndex}`;
                label.title = label.textContent;
                return;
            }

            // Check if this is a food/drink label (with numbers)
            const consumableType = label.getAttribute('data-jigs-consumable-type');
            const consumableIndex = label.getAttribute('data-jigs-consumable-index');
            const consumableI18n = label.getAttribute('data-jigs-consumable-i18n');
            if (consumableType && consumableIndex && consumableI18n && typeof i18next !== 'undefined') {
                const typeText = i18next.t(consumableI18n).replace(/<br\s*\/?>/gi, ' ').trim();
                label.textContent = `${typeText} ${consumableIndex}`;
                label.title = label.textContent;
                return;
            }

            // Check if this is a JIGS custom label (Multiplier, SelectPlayer, Dungeon Count)
            const customKey = label.getAttribute('data-jigs-custom');
            if (customKey) {
                label.textContent = t(customKey);
                label.title = label.textContent;
                return;
            }

            // All other labels with data-i18n will be updated automatically by the game's updateContent()
        });
    }

    function setupLanguageChangeListener() {
        if (typeof i18next !== 'undefined' && i18next.on) {
            i18next.on('languageChanged', (lng) => {
                console.log('JIGS: Language changed to', lng);
                currentLang = getCurrentLanguage();
                updateUILanguage();
                updateQueueEstimate();
                // Delay queue update to allow game's i18next to update DOM first
                setTimeout(() => {
                    updateQueuePanelUI();
                }, 100);
            });
            console.log('JIGS: Language change listener registered');
        }
    }

    // --- 5. INITIALIZATION ---
    async function initializeScript() {
        console.log("JIGS DEBUG: Step 1 - initializeScript started.");
        if (!await fetchJigsData()) {
            statusDiv.textContent = 'Error: Could not load critical JIGS data. The script cannot continue.';
            return;
        }
        console.log("JIGS DEBUG: Step 2 - fetchJigsData successful.");
        const controlsPanel = document.getElementById('batch-panel');
        controlsPanel.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            switch (button.id) {
                case 'batch-toggle':
                    controlsPanel.classList.toggle('jigs-minimized');
                    button.textContent = controlsPanel.classList.contains('jigs-minimized') ? '+' : '-';
                    GM_setValue(`jigs_panel_minimized_batch-panel`, controlsPanel.classList.contains('jigs-minimized'));
                    break;
                case 'run-batch-button':
                    startBatch();
                    break;
                case 'stop-batch-button':
                    isBatchRunning = false;
                    statusDiv.textContent = t('statusStopping');
                    const stopSimButton = document.getElementById('buttonStopSimulation');
                    if (stopSimButton) {
                        stopSimButton.click();
                    }
                    break;
                case 'capture-setup-button':
                    buildInputsUI();
                    break;
                case 'update-baseline-button':
                    const importTriggers = document.getElementById('import-triggers-checkbox').checked;
                    updateBaseline(importTriggers);
                    break;
                case 'reset-button':
                    resetInputsToBaseline();
                    break;
                case 'add-to-queue-button':
                    addChangesToQueue();
                    break;
                case 'reset-panels-button':
                    resetPanelPositions();
                    break;
            }
        });

        const resultsPanel = document.getElementById('jigs-results-panel');
        resultsPanel.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            switch (button.id) {
                case 'reset-panels-button-results':
                    resetPanelPositions();
                    break;
                case 'results-toggle':
                    resultsPanel.classList.toggle('jigs-minimized');
                    button.textContent = resultsPanel.classList.contains('jigs-minimized') ? '+' : '-';
                    GM_setValue(`jigs_panel_minimized_jigs-results-panel`, resultsPanel.classList.contains('jigs-minimized'));
                    break;
                case 'clear-results-button':
                    console.log("JIGS DEBUG: Clearing all results.");
                    document.querySelector('#batch-results-table tbody').innerHTML = '';
                    detailedResults = [];
                    document.getElementById('export-csv-button').disabled = true;
                    break;
                case 'export-csv-button':
                    exportResultsToCSV();
                    break;
            }
        });

const queuePanel = document.getElementById('jigs-queue-panel');
        queuePanel.addEventListener('click', (event) => {
            const target = event.target;

            // Added check for reset button below
            if (target.matches('#queue-toggle') || target.matches('#clear-queue-button') || target.matches('#reset-panels-button-queue')) {
                switch (target.id) {
                    case 'reset-panels-button-queue':
                        resetPanelPositions();
                        break;
                    case 'queue-toggle':
                        queuePanel.classList.toggle('jigs-minimized');
                        target.textContent = queuePanel.classList.contains('jigs-minimized') ? '+' : '-';
                        GM_setValue(`jigs_panel_minimized_jigs-queue-panel`, queuePanel.classList.contains('jigs-minimized'));
                        break;
                    case 'clear-queue-button':
                        console.log("JIGS DEBUG: Clearing simulation queue.");
                        simulationQueue = [];
                        updateQueuePanelUI();
                        break;
                }
                return;
            }

            if (target.classList.contains('jigs-remove-queue-item-button')) {
                const indexToRemove = parseInt(target.dataset.index, 10);
                if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < simulationQueue.length) {
                    console.log(`JIGS DEBUG: Removing item at index ${indexToRemove} from queue.`);
                    simulationQueue.splice(indexToRemove, 1);
                    updateQueuePanelUI();
                }
            }
        });

        queuePanel.addEventListener('change', (event) => {
            if (event.target.id === 'infinite-queue-checkbox') {
                updateQueueEstimate();
            }
        });

        const inputsContainer = document.getElementById('batch-inputs-container');
        if (inputsContainer) {
            inputsContainer.addEventListener('change', (event) => {
                if (event.target.dataset.name === 'Multiplier') {
                    updateQueueEstimate();
                }
                if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
                    updateModifiedIndicator(event.target);
                }
            }, true);
        }

        controlsPanel.addEventListener('change', async (event) => {
            if (event.target.id === 'jigs-player-select') {
                const selectedPlayerName = event.target.value;
                switchPlayerAndCapture(selectedPlayerName);
            }
        });
        const columnToggleContainer = document.getElementById('column-toggle-container');
        if (columnToggleContainer) {
            columnToggleContainer.addEventListener('change', updateColumnVisibility);
        }
        document.getElementById('baseline-dps-input').addEventListener('change', updateBaselinesFromInputs);
        document.getElementById('baseline-team-dps-input').addEventListener('change', updateBaselinesFromInputs);
        document.getElementById('baseline-profit-input').addEventListener('change', updateBaselinesFromInputs);
        document.getElementById('baseline-exp-input').addEventListener('change', updateBaselinesFromInputs);
        document.getElementById('baseline-eph-input').addEventListener('change', updateBaselinesFromInputs);
        document.getElementById('baseline-dph-input').addEventListener('change', updateBaselinesFromInputs);
        const resultsThead = document.querySelector('#batch-results-table thead');
        if (resultsThead) {
            resultsThead.addEventListener('click', (event) => {
                const headerCell = event.target.closest('th');
                if (!headerCell) return;
                const sortKey = headerCell.dataset.sortKey;
                if (!sortKey) return;
                const tbody = headerCell.closest('table').querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                const isDesc = headerCell.classList.contains('sorted-desc');
                const direction = isDesc ? 1 : -1;
                rows.sort((a, b) => {
                    const valA = a.dataset[sortKey];
                    const valB = b.dataset[sortKey];
                    const numA = parseFloat(valA);
                    const numB = parseFloat(valB);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return (numA - numB) * direction;
                    }
                    return valA.localeCompare(valB) * direction;
                });
                tbody.innerHTML = '';
                rows.forEach(row => tbody.appendChild(row));
                headerCell.parentElement.querySelectorAll('th').forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
                if (direction === 1) {
                    headerCell.classList.add('sorted-asc');
                } else {
                    headerCell.classList.add('sorted-desc');
                }
            });
        } else {
            console.error("JIGS Error: Could not find the results table header to attach the sort listener.");
        }
        statusDiv.textContent = t('statusReady');
        document.getElementById('capture-setup-button').disabled = false;
        const findButtonInterval = setInterval(() => {
            const importButton = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Import solo/group'));
            if (importButton) {
                clearInterval(findButtonInterval);
                importButton.addEventListener('click', () => {
                    statusDiv.textContent = t('importInitiated');
                    const resultsContainer = document.getElementById('simulationResultTotalDamageDone');
                    if (resultsContainer) resultsContainer.innerHTML = '';
                    const baselineObserver = new MutationObserver(() => {
                        const dpsVal = getDpsValue();
                        const teamDpsVal = getTeamDpsValue();
                        if (dpsVal) {
                            baselineObserver.disconnect();
                            baselineDps = normalizeAndParseFloat(dpsVal);
                            baselineTeamDps = teamDpsVal ? normalizeAndParseFloat(teamDpsVal) : 0;
                            baselineProfit = getProfitValue() || 0;
                            baselineExp = getExpValue() || 0;
                            baselineEph = getEphValue() || 0;
                            baselineDph = getDphValue() || 0;
                            document.getElementById('baseline-dps-input').value = baselineDps.toFixed(2);
                            document.getElementById('baseline-team-dps-input').value = baselineTeamDps.toFixed(2);
                            document.getElementById('baseline-profit-input').value = formatGold(baselineProfit);
                            document.getElementById('baseline-exp-input').value = baselineExp.toLocaleString();
                            document.getElementById('baseline-eph-input').value = baselineEph.toFixed(2);
                            document.getElementById('baseline-dph-input').value = baselineDph.toFixed(2);

                            captureBaselineSkillRates();
                            updateQueueEstimate();
                        }
                    });
                    baselineObserver.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                    let uiBuildAttempt = 0;
                    const uiBuilderInterval = setInterval(() => {
                        uiBuildAttempt++;
                        const playerTabs = Array.from(document.querySelectorAll('a[id^="player"][id$="-tab"]'));
                        const namesAreLoaded = playerTabs.length > 0 && playerTabs.some(tab => !tab.textContent.trim().startsWith('Player '));
                        if (namesAreLoaded) {
                            clearInterval(uiBuilderInterval);
                            buildInputsUI();
                        } else if (uiBuildAttempt > 50) {
                            clearInterval(uiBuilderInterval);
                            statusDiv.textContent = t('couldNotDetectNames');
                        }
                    }, 200);
                });
            }
        }, 500);
        updateColumnVisibility();

        makeDraggable(document.getElementById('batch-panel'), document.getElementById('batch-header'));
        makeResizable(document.getElementById('batch-panel'));

        makeDraggable(document.getElementById('jigs-results-panel'), document.getElementById('jigs-results-header'));
        makeResizable(document.getElementById('jigs-results-panel'));

        makeDraggable(document.getElementById('jigs-queue-panel'), document.getElementById('jigs-queue-header'));
        makeResizable(document.getElementById('jigs-queue-panel'));

        applySavedPanelStates();
        setupLanguageChangeListener();
    }
    initializeScript();
})();