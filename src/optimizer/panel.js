import combatTriggerComparatorDetailMap from "../combatsimulator/data/combatTriggerComparatorDetailMap.json";
import { createTriggerListEditor, isTriggerListValid } from "../triggerEditor.js";
import { cloneTeamState, teamStateToDTOs, listAbilitySlots, getTriggers, setTriggers } from "./teamState.js";
import { EvaluationRunner } from "./runner.js";
import { comparePaired, seedList } from "./stats.js";
import { priceChanges, priceConsumableDelta } from "./cost.js";
import { listEquipmentCandidates, buildChange, applyChanges, validateChanges, generateUpgradeCandidates } from "./candidates.js";
import { scanThresholds, estimateScanBudget } from "./search.js";
import { WORKER_PEAK_MB } from "../workerBudget.js";
import { resolveScanVariables } from "./ranges.js";
import { renderSearchAnalysis } from "./searchPlot.js";

const EQUIPMENT_SLOTS = ["head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "pouch", "neck", "earrings", "ring", "back", "charm"].map((slot) => `/equipment_types/${slot}`);

export function initOptimizer({ getTeamSnapshot, applyTeamSnapshot, getPrices }) {
    const ids = ["optimizerModal", "optParticipants", "optButtonSelectAllPlayers", "optSelectDungeon", "optSelectDifficulty", "optInputDungeonCount", "optInputParallelCount", "optParallelCountDisplay", "optInputSeedCount", "optInputMaxEvaluations", "optScanEstimate", "optMemoryEstimate", "optTabTriggers", "optTabUpgrades", "optTabResults", "optTriggerContainer", "optSelectPlayer", "optSelectSlot", "optSelectItem", "optInputEnhancement", "optButtonAddCandidate", "optCandidateList", "optButtonGenerateUpgrades", "optStatus", "optProgress", "optResults", "optButtonRun", "optButtonScan", "optButtonStop", "optButtonApply", "optButtonExport"];
    const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
    ui.optInputSearchCount = document.getElementById("optInputSearchCount");
    const modal = ui.optimizerModal;
    let snapshot = null;
    let originalTeamState = null;
    let draftTeamState = null;
    // 整份名单与参战名单分开存：取消勾选只是退出本次模拟，已编辑的触发条件仍然保留。
    let rosterOriginal = null;
    let rosterDraft = null;
    let activeIds = [];
    let selectedTeamState = null;
    let candidates = [];
    let results = [];
    let report = null;
    let mode = "triggers";
    let running = false;
    let runner = null;
    let controller = null;
    let disabledControls = new Map();
    const variables = new Map();
    // 用户一旦手填评估次数，就不再用估算值覆盖他的选择。
    let budgetTouched = false;
    const t = (key, options) => window.i18next.t(`common:optimizer.${key}`, options);
    const translate = () => window.updateContent?.();

    function element(tag, className = "", key = null, options = null) {
        const node = document.createElement(tag);
        node.className = className;
        if (key) node.setAttribute("data-i18n", key);
        // 插值参数交给全局翻译器，切换语言时随 updateContent 一起重算。
        if (options) node.setAttribute("data-i18n-options", JSON.stringify(options));
        return node;
    }

    function label(key, className = "", options = null) {
        return element("span", className, `common:optimizer.${key}`, options);
    }

    function playerLabel(id) {
        return label("player", "", { id });
    }

    function status(key, options) {
        ui.optStatus.setAttribute("data-i18n", `common:optimizer.${key}`);
        if (options) ui.optStatus.setAttribute("data-i18n-options", JSON.stringify(options));
        else ui.optStatus.removeAttribute("data-i18n-options");
        ui.optStatus.textContent = t(key, options);
    }

    // 把当前草稿里的编辑回写整份名单，再按参战勾选重新切出本次要模拟的队伍。
    function syncActiveTeams() {
        if (draftTeamState) {
            for (const player of draftTeamState.players) {
                const target = rosterDraft.players.find((entry) => entry.id === player.id);
                if (target) target.state = player.state;
            }
        }
        const pick = (roster) => ({
            players: roster.players.filter((player) => activeIds.includes(player.id)).map((player) => structuredClone(player)),
        });
        originalTeamState = pick(rosterOriginal);
        draftTeamState = pick(rosterDraft);
    }

    function renderParticipants() {
        ui.optParticipants.replaceChildren();
        for (const player of rosterDraft?.players ?? []) {
            const wrapper = element("div", "form-check form-check-inline m-0");
            const box = element("input", "form-check-input");
            box.type = "checkbox";
            box.id = `optParticipant_${player.id}`;
            box.checked = activeIds.includes(player.id);
            box.disabled = running;
            box.addEventListener("change", () => toggleParticipant(player.id, box.checked));
            const text = label("player", "form-check-label ms-1", { id: player.id });
            text.setAttribute("for", box.id);
            wrapper.append(box, text);
            ui.optParticipants.append(wrapper);
        }
    }

    function setParticipants(next) {
        if (running) return;
        const roster = rosterDraft?.players.map((player) => player.id) ?? [];
        const wanted = roster.filter((id) => next.includes(id));
        if (!wanted.length) {
            // 至少留一人，否则没有可模拟的队伍。
            renderParticipants();
            return status("errors.noTeam");
        }
        if (wanted.join() === activeIds.join()) return;
        activeIds = wanted;
        syncActiveTeams();
        // 阵容变了，候选与结果都不再可比。
        candidates = candidates.filter((changes) => changes.every((change) => activeIds.includes(String(change.playerId))));
        variables.clear();
        resetResults();
        renderParticipants();
        renderTriggers();
        renderEquipment();
        renderCandidates();
        status("errors.rosterChanged");
        updateActions();
        translate();
    }

    function toggleParticipant(id, checked) {
        setParticipants(checked ? [...activeIds, id] : activeIds.filter((entry) => entry !== id));
    }

    function toggleAllParticipants() {
        const roster = rosterDraft?.players.map((player) => player.id) ?? [];
        if (!roster.length) return;
        // 全选，已经全选则收回到第一名队员；参战人数不允许为零。
        setParticipants(activeIds.length === roster.length ? roster.slice(0, 1) : roster);
    }

    function format(value, digits = 2) {
        if (!Number.isFinite(value)) return t("result.unavailable");
        // 四舍五入到显示精度后再判零，避免把 -0.0004 显示成「-0」。
        const scale = 10 ** digits;
        const rounded = Math.round(value * scale) / scale;
        return new Intl.NumberFormat(window.i18next.language, { maximumFractionDigits: digits }).format(rounded === 0 ? 0 : rounded);
    }

    function setProgress(value) {
        const percent = Math.max(0, Math.min(100, value));
        ui.optProgress.classList.remove("d-none");
        const bar = ui.optProgress.querySelector(".progress-bar");
        bar.style.width = `${percent}%`;
        bar.setAttribute("aria-valuenow", String(percent));
        bar.textContent = `${format(percent, 0)}%`;
    }

    function updateActions() {
        ui.optButtonStop.disabled = !running;
        ui.optButtonRun.disabled = running || !draftTeamState?.players.length;
        ui.optButtonScan.disabled = running || !draftTeamState?.players.length;
        ui.optButtonApply.disabled = running || !draftTeamState?.players.length;
        ui.optButtonExport.disabled = !report;
    }

    function setRunning(value) {
        running = value;
        if (value) {
            disabledControls = new Map();
            for (const control of modal.querySelectorAll("button, input, select")) {
                disabledControls.set(control, control.disabled);
                control.disabled = control !== ui.optButtonStop;
            }
        } else {
            for (const control of modal.querySelectorAll("button, input, select")) {
                control.disabled = disabledControls.get(control) ?? false;
            }
            disabledControls.clear();
        }
        updateActions();
    }

    function resetResults() {
        results = [];
        report = null;
        selectedTeamState = null;
        ui.optResults.replaceChildren(label("noResults", "text-muted"));
        updateActions();
    }

    function draftChanged() {
        selectedTeamState = null;
        for (const input of ui.optResults.querySelectorAll('input[type="radio"]')) input.checked = false;
        status("status.ready");
    }

    function variableKey(playerId, abilityHrid, triggerIndex) {
        return `${playerId}:${abilityHrid}:${triggerIndex}`;
    }

    function triggerSignature(trigger) {
        return JSON.stringify([trigger.dependencyHrid, trigger.conditionHrid, trigger.comparatorHrid]);
    }

    function replaceTriggers(playerId, state, abilityHrid, next) {
        const previous = getTriggers(state, abilityHrid);
        const saved = previous.map((trigger, index) => ({ trigger, record: variables.get(variableKey(playerId, abilityHrid, index)), used: false }));
        previous.forEach((_, index) => variables.delete(variableKey(playerId, abilityHrid, index)));
        // 删除一行后按条件身份移动扫描设置，避免把下一行误当成被删除的变量。
        next.forEach((trigger, index) => {
            const match = saved.find((entry) => !entry.used && JSON.stringify(entry.trigger) === JSON.stringify(trigger))
                ?? saved.find((entry) => !entry.used && triggerSignature(entry.trigger) === triggerSignature(trigger))
                ?? (previous.length === next.length && !saved[index].used ? saved[index] : null);
            if (!match) return;
            match.used = true;
            if (match.record) variables.set(variableKey(playerId, abilityHrid, index), match.record);
        });
        setTriggers(state, abilityHrid, next);
    }

    // 上下界留空时按战斗模型推导；步长仍由用户控制最终精度。
    const COUNT_CONDITIONS = ["/combat_trigger_conditions/number_of_active_units", "/combat_trigger_conditions/number_of_dead_units"];

    function niceStep(span) {
        const raw = span / 10;
        if (!(raw > 0)) return 1;
        const magnitude = 10 ** Math.floor(Math.log10(raw));
        for (const factor of [1, 2, 5]) {
            if (raw <= factor * magnitude) return factor * magnitude;
        }
        return 10 * magnitude;
    }

    function defaultScanRange(trigger) {
        const value = Number(trigger.value);
        const current = Number.isFinite(value) ? value : 0;
        if (COUNT_CONDITIONS.includes(trigger.conditionHrid)) {
            return { min: "", max: "", step: 1 };
        }
        if (trigger.conditionHrid === "/combat_trigger_conditions/lowest_hp_percentage") {
            return { min: "", max: "", step: 10 };
        }
        const max = Math.max(1000, Math.ceil(current * 2));
        return { min: "", max: "", step: Math.max(1, niceStep(max)) };
    }

    function renderVariables(container, playerId, state, abilityHrid, synchronize) {
        container.replaceChildren();
        getTriggers(state, abilityHrid).forEach((trigger, triggerIndex) => {
            if (!combatTriggerComparatorDetailMap[trigger.comparatorHrid]?.allowValue) return;
            const key = variableKey(playerId, abilityHrid, triggerIndex);
            if (!variables.has(key)) {
                variables.set(key, { playerId, abilityHrid, triggerIndex, checked: false, ...defaultScanRange(trigger) });
            }
            const record = variables.get(key);
            record.triggerIndex = triggerIndex;
            const row = element("div", "row g-2 align-items-center mb-2");
            const checkColumn = element("div", "col-md-6");
            const checkLabel = element("label", "form-check-label d-flex gap-2 align-items-center");
            const checkbox = element("input", "form-check-input");
            checkbox.type = "checkbox";
            checkbox.checked = record.checked;
            checkbox.addEventListener("change", () => {
                record.checked = checkbox.checked;
                synchronize();
            });
            checkLabel.append(checkbox, label("scanThreshold"), document.createTextNode(` ${triggerIndex + 1}`));
            checkColumn.append(checkLabel);
            const terms = element("div", "small text-muted");
            for (const [namespace, hrid] of [["combatTriggerDependencyNames", trigger.dependencyHrid], ["combatTriggerConditionNames", trigger.conditionHrid], ["combatTriggerComparatorNames", trigger.comparatorHrid]]) {
                terms.append(element("span", "me-1", `${namespace}.${hrid}`));
            }
            checkColumn.append(terms);
            row.append(checkColumn);
            checkColumn.append(label("autoRangeHint", "small text-muted d-block"));
            for (const [field, keyName] of [["min", "minimum"], ["max", "maximum"], ["step", "step"]]) {
                const column = element("div", "col-md-2");
                const inputLabel = element("label", "d-block");
                const input = element("input", "form-control");
                input.type = "number";
                input.step = "any";
                input.value = record[field];
                if (field === "step") input.min = "0";
                input.addEventListener("change", () => {
                    record[field] = input.value === "" ? "" : Number(input.value);
                    synchronize();
                });
                inputLabel.append(label(keyName), input);
                column.append(inputLabel);
                row.append(column);
            }
            container.append(row);
        });
    }

    function renderTriggers() {
        ui.optTriggerContainer.replaceChildren();
        if (!draftTeamState) return;
        for (const { id, state } of draftTeamState.players) {
            const section = element("section", "mb-3");
            const heading = element("h5");
            heading.append(playerLabel(id));
            section.append(heading);
            const slots = listAbilitySlots(state);
            const groups = new Map();
            for (const { slotIndex, abilityHrid } of slots) {
                const details = element("details", "border rounded p-2 mb-2");
                const summary = element("summary");
                summary.append(element("span", "me-2", `abilityNames.${abilityHrid}`), label("slot"), document.createTextNode(` ${slotIndex + 1}`));
                details.append(summary);
                if (slots.filter((slot) => slot.abilityHrid === abilityHrid).length > 1) {
                    details.append(label("sharedTriggers", "d-block small text-muted my-2"));
                }
                const editorContainer = element("div", "container-fluid mt-2");
                const scanContainer = element("div", "container-fluid mt-2");
                details.append(editorContainer, scanContainer);
                if (!groups.has(abilityHrid)) groups.set(abilityHrid, []);
                const group = groups.get(abilityHrid);
                const synchronizeVariables = () => {
                    for (const entry of group) renderVariables(entry.scanContainer, id, state, abilityHrid, synchronizeVariables);
                    updateScanEstimate();
                    translate();
                };
                const editor = createTriggerListEditor(editorContainer, {
                    hrid: abilityHrid,
                    getTriggers: () => getTriggers(state, abilityHrid),
                    setTriggers: (triggers) => replaceTriggers(id, state, abilityHrid, triggers),
                    onChange: () => {
                        draftChanged();
                        for (const entry of group) entry.editor.render();
                        synchronizeVariables();
                    },
                });
                group.push({ editor, scanContainer });
                renderVariables(scanContainer, id, state, abilityHrid, synchronizeVariables);
                section.append(details);
            }
            ui.optTriggerContainer.append(section);
        }
        updateScanEstimate();
    }

    function currentPlayer() {
        return draftTeamState?.players.find(({ id }) => String(id) === ui.optSelectPlayer.value);
    }

    function conflictingSlots(slot) {
        if (slot === "/equipment_types/two_hand") return ["/equipment_types/main_hand", "/equipment_types/off_hand"];
        if (slot === "/equipment_types/main_hand" || slot === "/equipment_types/off_hand") return ["/equipment_types/two_hand"];
        return [];
    }

    function fillItems() {
        const selected = currentPlayer();
        ui.optSelectItem.replaceChildren();
        const empty = element("option", "", "characterSelectPage.slots.empty");
        empty.value = "";
        ui.optSelectItem.append(empty);
        if (selected) {
            // 列表以转换后的手持槽位为准；移除冲突装备会显式加入候选及成本。
            const state = structuredClone(selected.state);
            const conflicts = conflictingSlots(ui.optSelectSlot.value).map((slot) => slot.replace("/equipment_types/", "/item_locations/"));
            state.player.equipment = (state.player.equipment ?? []).filter((item) => !conflicts.includes(item.itemLocationHrid));
            for (const item of listEquipmentCandidates(state, { slot: ui.optSelectSlot.value, playerId: selected.id })) {
                const option = element("option", "", `itemNames.${item.hrid}`);
                option.value = item.hrid;
                ui.optSelectItem.append(option);
            }
        }
        translate();
    }

    function renderEquipment() {
        ui.optSelectPlayer.replaceChildren();
        for (const { id } of draftTeamState?.players ?? []) {
            const option = element("option", "", "common:optimizer.player", { id });
            option.value = String(id);
            ui.optSelectPlayer.append(option);
        }
        ui.optSelectSlot.replaceChildren();
        for (const slot of EQUIPMENT_SLOTS) {
            const option = element("option", "", `equipmentTypeNames.${slot}`);
            option.value = slot;
            ui.optSelectSlot.append(option);
        }
        ui.optInputEnhancement.value = "0";
        fillItems();
        renderCandidates();
    }

    function describeChanges(changes) {
        const list = element("ul", "mb-2");
        for (const change of changes) {
            const row = element("li");
            row.append(playerLabel(change.playerId), document.createTextNode(" · "));
            if (change.kind === "equipment") {
                row.append(element("span", "me-2", `equipmentTypeNames.${change.slot}`));
                for (const [index, equipment] of [change.before, change.after].entries()) {
                    if (index) row.append(document.createTextNode(" → "));
                    row.append(element("span", "", equipment ? `itemNames.${equipment.itemHrid}` : "characterSelectPage.slots.empty"));
                    if (equipment) row.append(document.createTextNode(` +${equipment.enhancementLevel}`));
                }
            } else if (change.kind === "house") {
                row.append(element("span", "me-2", `houseRoomNames.${change.roomHrid}`), document.createTextNode(`${change.before} → ${change.after}`));
            } else {
                row.append(element("span", "me-2", `abilityNames.${change.abilityHrid}`), label("result.triggerChange"));
            }
            list.append(row);
        }
        return list;
    }

    function renderCandidates() {
        ui.optCandidateList.replaceChildren();
        if (!candidates.length) ui.optCandidateList.append(label("noCandidates", "text-muted"));
        candidates.forEach((changes, index) => {
            const row = element("div", "border rounded p-2 mb-2");
            const title = element("div", "d-flex gap-2 align-items-center mb-2");
            const remove = element("button", "btn btn-danger btn-sm", "common:optimizer.removeCandidate");
            remove.type = "button";
            remove.addEventListener("click", () => {
                candidates.splice(index, 1);
                renderCandidates();
                translate();
            });
            title.append(label("result.candidate"), document.createTextNode(` ${index + 1}`), remove);
            row.append(title, describeChanges(changes));
            ui.optCandidateList.append(row);
        });
    }

    function addCandidate() {
        if (running || !draftTeamState) return;
        const selected = currentPlayer();
        if (!selected) return status("errors.noTeam");
        const enhancementLevel = Number(ui.optInputEnhancement.value);
        if (ui.optInputEnhancement.value === "" || !Number.isInteger(enhancementLevel) || enhancementLevel < 0 || !ui.optInputEnhancement.checkValidity()) return status("errors.invalidSettings");
        try {
            const change = buildChange(draftTeamState, { kind: "equipment", playerId: selected.id, slot: ui.optSelectSlot.value, itemHrid: ui.optSelectItem.value || null, enhancementLevel });
            if (JSON.stringify(change.before) === JSON.stringify(change.after)) return status("unchanged");
            const changes = [change];
            if (change.after) {
                for (const slot of conflictingSlots(change.slot)) {
                    const removal = buildChange(draftTeamState, { kind: "equipment", playerId: selected.id, slot, itemHrid: null });
                    if (removal.before) changes.unshift(removal);
                }
            }
            if (!validateChanges(draftTeamState, changes).valid) return status("errors.invalidCandidate");
            if (!candidates.some((candidate) => JSON.stringify(candidate) === JSON.stringify(changes))) candidates.push(changes);
            renderCandidates();
            status("status.ready");
            translate();
        } catch (error) {
            console.error(error);
            status("errors.invalidCandidate");
        }
    }

    function generateCandidates() {
        if (running || !draftTeamState) return;
        const selected = currentPlayer();
        if (!selected) return status("errors.noTeam");
        try {
            const generated = generateUpgradeCandidates(draftTeamState, selected.id);
            for (const changes of generated) {
                if (!candidates.some((candidate) => JSON.stringify(candidate) === JSON.stringify(changes))) candidates.push(changes);
            }
            renderCandidates();
            status(generated.length ? "status.ready" : "errors.noCandidate");
            translate();
        } catch (error) {
            console.error(error);
            status("errors.invalidCandidate");
        }
    }

    function validTriggers(teamState) {
        return teamState.players.every(({ state }) => listAbilitySlots(state).every(({ abilityHrid }) => isTriggerListValid(getTriggers(state, abilityHrid))));
    }

    function settingsFromInputs() {
        const integer = (input) => {
            const value = Number(input.value);
            if (!Number.isSafeInteger(value) || value < 1 || !input.checkValidity()) throw new Error(t("errors.invalidSettings"));
            return value;
        };
        const difficultyTier = Number(ui.optSelectDifficulty.value);
        if (!ui.optSelectDungeon.value || !Number.isInteger(difficultyTier) || difficultyTier < 0) throw new Error(t("errors.invalidSettings"));
        return {
            zone: { zoneHrid: ui.optSelectDungeon.value, difficultyTier },
            dungeonCount: integer(ui.optInputDungeonCount),
            concurrency: integer(ui.optInputParallelCount),
            searchDungeonCount: Math.min(integer(ui.optInputSearchCount), integer(ui.optInputDungeonCount)),
            seedCount: integer(ui.optInputSeedCount),
            maxEvaluations: integer(ui.optInputMaxEvaluations),
            extra: structuredClone(snapshot.extra),
            guildShrineLevels: structuredClone(snapshot.guildShrineLevels),
        };
    }

    function selectedVariables() {
        const active = [];
        for (const { id, state } of draftTeamState.players) {
            for (const abilityHrid of new Set(listAbilitySlots(state).map((slot) => slot.abilityHrid))) {
                getTriggers(state, abilityHrid).forEach((trigger, triggerIndex) => {
                    const record = variables.get(variableKey(id, abilityHrid, triggerIndex));
                    if (!record?.checked || !combatTriggerComparatorDetailMap[trigger.comparatorHrid]?.allowValue) return;
                    if (!Number.isFinite(record.step) || record.step <= 0) throw new Error(t("errors.invalidSettings"));
                    active.push({ playerId: id, abilityHrid, triggerIndex, min: record.min === "" ? null : record.min, max: record.max === "" ? null : record.max, step: record.step });
                });
            }
        }
        return resolveScanVariables({
            teamState: draftTeamState, variables: active,
            zone: { zoneHrid: ui.optSelectDungeon.value, difficultyTier: Number(ui.optSelectDifficulty.value) },
            extra: snapshot.extra, guildShrineLevels: snapshot.guildShrineLevels,
        });
    }

    // 「最大评估次数」是机时闸门，但没人算得出跑完全部分辨率要多少次。
    // 勾选阈值后给出上界估算与折算的地下城场次；只要用户没手动改过这个框，就跟着勾选集合走。
    function updateScanEstimate() {
        let active = [];
        try {
            active = draftTeamState ? selectedVariables() : [];
        } catch {
            // 区间填到一半是常态，等填完再估。
            active = [];
        }
        const budget = estimateScanBudget(active);
        if (!budget) return ui.optScanEstimate.replaceChildren();
        const runs = budget * Number(ui.optInputSeedCount.value) * Math.min(Number(ui.optInputSearchCount.value), Number(ui.optInputDungeonCount.value));
        // 估算值可能超过输入框允许的上限；此时填满上限，提示里仍给出真实需求，让截断可预期。
        const cap = Number(ui.optInputMaxEvaluations.max) || budget;
        if (!budgetTouched) ui.optInputMaxEvaluations.value = String(Math.min(budget, cap));
        ui.optScanEstimate.replaceChildren(label("scanEstimate", "", {
            thresholds: format(active.length, 0),
            evaluations: format(budget, 0),
            runs: Number.isFinite(runs) ? format(runs, 0) : t("result.unavailable"),
        }));
        for (const variable of active) {
            const row = element("div", "small");
            row.append(playerLabel(variable.playerId), document.createTextNode(" · "),
                element("span", "me-1", `abilityNames.${variable.abilityHrid}`),
                label("resolvedRange", "", { min: format(variable.min), max: format(variable.max), step: format(variable.step) }));
            ui.optScanEstimate.append(row);
        }
        translate();
    }

    // 并行线程数直接决定峰值内存，UI 不写明的话没人会把「16 核」和「3 GB」联系起来。
    function updateMemoryEstimate() {
        const workers = Number(ui.optInputParallelCount.value);
        if (!Number.isFinite(workers) || workers < 1) return ui.optMemoryEstimate.replaceChildren();
        const megabytes = workers * WORKER_PEAK_MB;
        ui.optMemoryEstimate.replaceChildren(label("memoryEstimate", "", {
            memory: megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${megabytes} MB`,
            perWorker: `${WORKER_PEAK_MB} MB`,
        }));
        translate();
    }

    function changesBetween(before, after) {
        const changes = [];
        for (const { id, state } of after.players) {
            const previous = before.players.find((entry) => String(entry.id) === String(id)).state;
            for (const slot of EQUIPMENT_SLOTS) {
                const location = slot.replace("/equipment_types/", "/item_locations/");
                const oldItem = previous.player.equipment.find((item) => item.itemLocationHrid === location) ?? null;
                const newItem = state.player.equipment.find((item) => item.itemLocationHrid === location) ?? null;
                if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) changes.push(buildChange(before, { kind: "equipment", playerId: id, slot, itemHrid: newItem?.itemHrid ?? null, enhancementLevel: newItem?.enhancementLevel ?? 0 }));
            }
            for (const roomHrid of new Set([...Object.keys(previous.houseRooms ?? {}), ...Object.keys(state.houseRooms ?? {})])) {
                const level = Number(state.houseRooms?.[roomHrid] ?? 0);
                if (level !== Number(previous.houseRooms?.[roomHrid] ?? 0)) changes.push(buildChange(before, { kind: "house", playerId: id, roomHrid, level }));
            }
            for (const abilityHrid of new Set(listAbilitySlots(state).map((slot) => slot.abilityHrid))) {
                const triggers = getTriggers(state, abilityHrid);
                if (JSON.stringify(getTriggers(previous, abilityHrid)) !== JSON.stringify(triggers)) changes.push(buildChange(before, { kind: "trigger", playerId: id, abilityHrid, triggers }));
            }
        }
        return changes;
    }

    function appendMetric(container, key, value) {
        const row = element("div", "row mb-1");
        const heading = element("div", "col-md-5");
        const content = element("div", "col-md");
        heading.append(label(key));
        if (value instanceof Node) content.append(value);
        else content.textContent = value;
        row.append(heading, content);
        container.append(row);
    }

    function sampleRate(samples, kind) {
        let sum = 0;
        for (const sample of samples) {
            const denominator = kind === "wipe" ? sample.completed + sample.failed : sample.simulatedTime / 3.6e12;
            if (!(denominator > 0)) return null;
            sum += (kind === "wipe" ? sample.failed : kind === "deaths" ? sample.deaths : sample.completed) / denominator;
        }
        return sum / samples.length;
    }

    function rateMetric(samples, kind, delta) {
        const before = sampleRate(report.baselineSamples, kind);
        const after = sampleRate(samples, kind);
        const display = (value) => Number.isFinite(value) ? `${format(kind === "wipe" ? value * 100 : value)}${kind === "wipe" ? "%" : ""}` : t("result.unavailable");
        return `${display(before)} → ${display(after)} (Δ ${display(delta)})`;
    }

    function renderPriceLines(lines, consumables = false) {
        const list = element("ul", "small mb-2");
        for (const line of lines) {
            const row = element("li");
            row.append(element("span", "me-2", line.itemHrid ? `itemNames.${line.itemHrid}` : `houseRoomNames.${line.roomHrid}`));
            if (line.enhancementLevel != null) row.append(document.createTextNode(` +${line.enhancementLevel} `));
            if (!consumables) row.append(label(line.side === "sell" ? "result.resaleValue" : "result.grossCost", "me-2"));
            const value = consumables ? line.coinPerHourDelta : line.total;
            row.append(Number.isFinite(value) ? document.createTextNode(format(value)) : label("result.unknownPrice"));
            if (line.estimated) row.append(label("result.estimated", "ms-2 text-muted"));
            list.append(row);
        }
        return list;
    }

    function appendDetailsSection(container, key, ...content) {
        const section = element("section", "mt-3");
        section.append(element("h6", "mb-2", `common:optimizer.${key}`), ...content);
        container.append(section);
    }

    function renderResults() {
        ui.optResults.replaceChildren();
        if (report?.scan && results.length) ui.optResults.append(label("holdoutNote", "d-block alert alert-info"));
        for (const [index, result] of results.entries()) {
            const card = element("section", "border rounded p-3 mb-3");
            const heading = element("h5");
            heading.append(label("result.candidate"), document.createTextNode(` ${index + 1}`));
            const selectionLabel = element("label", "form-check-label d-flex align-items-center gap-2 mb-2");
            const selection = element("input", "form-check-input");
            selection.type = "radio";
            selection.name = "optimizer-result-selection";
            selection.checked = selectedTeamState === result.teamState;
            selection.disabled = running;
            selection.addEventListener("change", () => {
                if (selection.checked) selectedTeamState = result.teamState;
            });
            selectionLabel.append(selection, label("selectCandidate"));
            card.append(heading, selectionLabel);
            const comparison = result.comparison;
            appendMetric(card, "result.baselineDps", format(comparison.baselineDps));
            appendMetric(card, "result.candidateDps", format(comparison.candidateDps));
            appendMetric(card, "result.deltaDps", `${format(comparison.deltaDps)} (${Number.isFinite(comparison.deltaPercent) ? `${format(comparison.deltaPercent)}%` : t("result.unavailable")})`);
            appendMetric(card, "result.interval", `[${format(comparison.ciLow)}, ${format(comparison.ciHigh)}]`);
            appendMetric(card, "result.samples", format(comparison.n, 0));
            appendMetric(card, "result.deathsPerHour", rateMetric(result.samples, "deaths", comparison.deathsPerHourDelta));
            appendMetric(card, "result.wipeRate", rateMetric(result.samples, "wipe", comparison.wipeRateDelta));
            appendMetric(card, "result.clearsPerHour", rateMetric(result.samples, "clears", comparison.clearsPerHourDelta));
            card.append(label(`result.${comparison.status}`, "badge bg-secondary mb-2"));
            appendMetric(card, "result.grossCost", Number.isFinite(result.cost.grossCost) ? format(result.cost.grossCost) : label("result.unknownPrice"));
            appendMetric(card, "result.resaleValue", Number.isFinite(result.cost.resaleValue) ? format(result.cost.resaleValue) : label("result.unknownPrice"));
            appendMetric(card, "result.netCost", result.cost.known ? format(result.cost.netCost) : label("result.unknownPrice"));
            let efficiency;
            if (!result.cost.known) {
                efficiency = label("result.efficiencyUnknownPrice");
            } else if (comparison.deltaDps <= 0 || result.cost.netCost <= 0) {
                efficiency = element("div");
                if (comparison.deltaDps <= 0) efficiency.append(label("result.efficiencyNoDpsGain", "d-block"));
                if (result.cost.netCost <= 0) efficiency.append(label(result.cost.netCost < 0 ? "result.efficiencyNetRecovery" : "result.efficiencyZeroCost", "d-block"));
            } else {
                efficiency = format(comparison.deltaDps * 1e6 / result.cost.netCost);
            }
            appendMetric(card, "result.efficiency", efficiency);
            appendMetric(card, "result.consumableDelta", Number.isFinite(result.consumableCost.coinPerHourDelta) ? format(result.consumableCost.coinPerHourDelta) : label("result.unknownPrice"));
            const changeDetails = element("div");
            changeDetails.append(label("result.candidateChanges", "d-block fw-semibold mb-1"), describeChanges(result.candidateChanges));
            if (result.draftChanges.length) {
                changeDetails.append(label("result.draftChanges", "d-block fw-semibold mb-1"), describeChanges(result.draftChanges));
                changeDetails.append(element("p", "small text-muted mb-2", "common:optimizer.result.draftComparisonNote"));
            }
            appendDetailsSection(card, "result.changes", changeDetails);
            // 只改触发条件时没有任何买卖，成本明细整节不显示。
            if (result.cost.lines.length) appendDetailsSection(card, "result.costDetails", renderPriceLines(result.cost.lines));
            // 缺价项保留为未知；仅过滤确定的零值，不修改导出报告中的原始明细。
            const consumableLines = result.consumableCost.lines
                .filter((line) => line.coinPerHourDelta !== 0)
                .sort((left, right) => {
                    const leftKnown = Number.isFinite(left.coinPerHourDelta);
                    const rightKnown = Number.isFinite(right.coinPerHourDelta);
                    if (leftKnown !== rightKnown) return leftKnown ? 1 : -1;
                    return leftKnown ? Math.abs(right.coinPerHourDelta) - Math.abs(left.coinPerHourDelta) : 0;
                });
            if (consumableLines.length) appendDetailsSection(card, "result.consumableDetails", renderPriceLines(consumableLines, true));
            ui.optResults.append(card);
        }
        if (report?.scan) {
            ui.optResults.append(label("scanEvaluations", "d-block", { count: report.scan.evaluations }));
            ui.optResults.append(label(`searchStop.${report.scan.stopReason ?? "running"}`, "d-block text-muted mb-2"));
            for (const [index, variable] of report.scan.variables.entries()) {
                const value = report.scan.bestValues?.[index];
                if (value !== variable.min && value !== variable.max) continue;
                const row = element("div", "small text-warning");
                row.append(playerLabel(variable.playerId), document.createTextNode(" · "),
                    element("span", "me-1", `abilityNames.${variable.abilityHrid}`), label("boundaryHit", "", { value: format(value) }));
                ui.optResults.append(row);
            }
            ui.optResults.append(renderSearchAnalysis({
                scan: report.scan, variables: report.scan.variables, t,
                abilityName: (hrid) => window.i18next.t(`abilityNames.${hrid}`),
                playerName: (id) => t("player", { id }),
                onSelect: (alternative) => {
                    if (running) return status("errors.running");
                    draftTeamState = cloneTeamState(alternative.teamState);
                    selectedTeamState = null;
                    renderTriggers();
                    window.bootstrap.Tab.getOrCreateInstance(ui.optTabTriggers).show();
                    status("alternativeLoaded");
                },
            }));
        }
        translate();
    }

    function showResults() {
        window.bootstrap.Tab.getOrCreateInstance(ui.optTabResults).show();
    }

    function abortable(promise, signal) {
        return new Promise((resolve, reject) => {
            const abort = () => reject(new DOMException("", "AbortError"));
            if (signal.aborted) return abort();
            signal.addEventListener("abort", abort, { once: true });
            Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
        });
    }

    async function run(scan) {
        if (running) return status("errors.running");
        if (!draftTeamState?.players.length) return status("errors.noTeam");
        if (!validTriggers(originalTeamState) || !validTriggers(draftTeamState)) return status("errors.invalidTriggers");
        let settings;
        let scanVariables;
        try {
            settings = settingsFromInputs();
            scanVariables = scan ? selectedVariables() : [];
        } catch (error) {
            console.error(error);
            return status("errors.invalidSettings");
        }
        if (scan && !scanVariables.length) return status("errors.noVariables");
        const equipmentRun = !scan && mode === "upgrades";
        if (equipmentRun && !candidates.length) return status("errors.noCandidate");
        if (!scan && !equipmentRun && JSON.stringify(teamStateToDTOs(originalTeamState)) === JSON.stringify(teamStateToDTOs(draftTeamState))) return status("unchanged");
        let teams;
        try {
            teams = equipmentRun ? candidates.map((changes) => {
                if (!validateChanges(draftTeamState, changes).valid) throw new Error(t("errors.invalidCandidate"));
                return applyChanges(draftTeamState, changes);
            }) : [cloneTeamState(draftTeamState)];
        } catch (error) {
            console.error(error);
            return status("errors.invalidCandidate");
        }
        resetResults();
        controller = new AbortController();
        const signal = controller.signal;
        setRunning(true);
        setProgress(0);
        const masterSeed = window.crypto.getRandomValues(new Uint32Array(1))[0];
        const seeds = seedList(masterSeed, settings.seedCount);
        report = { settings, masterSeed, seeds, originalTeamState: cloneTeamState(originalTeamState), draftTeamState: cloneTeamState(draftTeamState), baselineSamples: [], results, scan: null, status: "running" };
        updateActions();
        try {
            runner = new EvaluationRunner({ concurrency: settings.concurrency });
            status("status.pricing");
            let prices;
            try {
                prices = await abortable(getPrices(), signal);
            } catch (error) {
                if (signal.aborted) throw error;
                // 行情获取失败不抹去有效模拟，成本模块按未知价格处理。
                prices = { prices: {}, marketData: {} };
                report.pricingError = String(error);
            }
            signal.throwIfAborted();
            status("status.running", { done: 0, total: seeds.length });
            const validationSeeds = scan
                ? seedList(masterSeed, settings.seedCount * 2).slice(settings.seedCount)
                : seeds;
            report.validationSeeds = validationSeeds;
            const evaluateBatch = (teamStates, { start, width, exploration = false, onResult }) => runner.evaluateBatch(
                teamStates.map((teamState) => ({
                    players: teamStateToDTOs(teamState),
                    dungeonCount: exploration ? settings.searchDungeonCount : settings.dungeonCount,
                    seeds: exploration ? seeds : validationSeeds,
                })), {
                    zone: settings.zone, extra: settings.extra, guildShrineLevels: settings.guildShrineLevels, signal, onResult,
                    onProgress: ({ finished, total, progress }) => {
                        status("status.running", { done: finished, total });
                        setProgress(start + width * (Number.isFinite(progress) ? progress : finished / total));
                    },
                });
            let pairedStart = 0;
            if (scan) {
                let evaluations = 0;
                report.scan = { variables: scanVariables, history: [], contexts: [], curve: [], alternatives: [], evaluations: 0, stopReason: "running" };
                updateActions();
                const search = await scanThresholds({
                    teamState: cloneTeamState(draftTeamState), variables: scanVariables,
                    evaluateBatch: (teamStates, onResult) => evaluateBatch(teamStates, {
                        start: 80 * evaluations / settings.maxEvaluations,
                        width: 80 * teamStates.length / settings.maxEvaluations,
                        exploration: true, onResult,
                    }),
                    seeds, maxEvaluations: settings.maxEvaluations, signal,
                    onProgress: (progress) => {
                        evaluations = progress.evaluations;
                        report.scan.evaluations = evaluations;
                        report.scan.bestValues = progress.bestValues;
                        if (progress.context && !report.scan.contexts.some((context) => context.id === progress.context.id)) report.scan.contexts.push(progress.context);
                        if (progress.historyEntry) report.scan.history.push(progress.historyEntry);
                        if (progress.entry) report.scan.curve.push(progress.entry);
                    },
                });
                signal.throwIfAborted();
                report.scan = { ...search, variables: scanVariables };
                draftTeamState = cloneTeamState(search.bestTeamState);
                teams = [cloneTeamState(draftTeamState)];
                pairedStart = 80;
            }
            // 最终验证用未参与搜索的 seed，避免把搜索择优偏差当成可靠收益。
            // 原方案与全部候选整批并行；候选结果按顺序在原方案完成后逐个展示。
            const draftChanges = equipmentRun ? changesBetween(report.originalTeamState, report.draftTeamState) : [];
            const batch = [originalTeamState, ...teams];
            const completed = new Array(batch.length);
            let shown = 0;
            const flush = () => {
                const baselineSamples = completed[0];
                if (!baselineSamples) return;
                report.baselineSamples = baselineSamples;
                while (shown < teams.length && completed[shown + 1]) {
                    const teamState = teams[shown];
                    const samples = completed[shown + 1];
                    const changes = changesBetween(originalTeamState, teamState);
                    results.push({
                        teamState, changes, samples, comparison: comparePaired(baselineSamples, samples),
                        candidateChanges: equipmentRun ? changesBetween(report.draftTeamState, teamState) : changes,
                        draftChanges,
                        cost: priceChanges(changes, prices), consumableCost: priceConsumableDelta(baselineSamples, samples, prices),
                    });
                    if (results.length === 1) selectedTeamState = results[0].teamState;
                    shown++;
                    renderResults();
                }
            };
            await evaluateBatch(batch, {
                start: pairedStart, width: 100 - pairedStart,
                onResult: (index, samples) => {
                    completed[index] = samples;
                    flush();
                },
            });
            signal.throwIfAborted();
            flush();
            report.draftTeamState = cloneTeamState(draftTeamState);
            report.status = "done";
            status(report.scan?.truncated ? "scanTruncated" : "status.done");
            setProgress(100);
        } catch (error) {
            report.status = signal.aborted || error.name === "AbortError" ? "stopped" : "error";
            if (report.scan) report.scan.stopReason = report.status;
            if (report.status === "error") {
                report.error = String(error);
                console.error(error);
            }
            status(`status.${report.status}`);
        } finally {
            runner?.dispose();
            runner = null;
            controller = null;
            setRunning(false);
            if (scan) renderTriggers();
            if (results.length || report.scan) {
                renderResults();
                showResults();
            }
            translate();
        }
    }

    modal.addEventListener("show.bs.modal", (event) => {
        if (running) {
            event.preventDefault();
            status("errors.running");
            return;
        }
        try {
            snapshot = getTeamSnapshot();
            rosterOriginal = cloneTeamState(snapshot.teamState);
            rosterDraft = cloneTeamState(snapshot.teamState);
            const roster = rosterDraft.players.map((player) => player.id);
            activeIds = roster.filter((id) => snapshot.playerIds.map(String).includes(id));
            if (!activeIds.length) activeIds = roster.slice(0, 1);
            draftTeamState = null;
            syncActiveTeams();
            candidates = [];
            variables.clear();
            resetResults();
            ui.optSelectDungeon.replaceChildren();
            for (const hrid of snapshot.dungeonOrder) {
                if (!hrid) continue;
                const option = element("option", "", `actionNames.${hrid}`);
                option.value = hrid;
                ui.optSelectDungeon.append(option);
            }
            ui.optSelectDungeon.value = snapshot.zone.zoneHrid;
            ui.optSelectDifficulty.value = String(snapshot.zone.difficultyTier);
            ui.optInputDungeonCount.value = String(snapshot.dungeonCount);
            ui.optInputParallelCount.max = String(snapshot.parallelMax);
            ui.optInputParallelCount.value = String(snapshot.parallelCount);
            ui.optParallelCountDisplay.textContent = ui.optInputParallelCount.value;
            updateMemoryEstimate();
            ui.optProgress.classList.add("d-none");
            renderParticipants();
            renderTriggers();
            renderEquipment();
            mode = "triggers";
            window.bootstrap.Tab.getOrCreateInstance(ui.optTabTriggers).show();
            status(draftTeamState.players.length ? "status.ready" : "errors.noTeam");
            translate();
        } catch (error) {
            console.error(error);
            snapshot = null;
            originalTeamState = null;
            draftTeamState = null;
            rosterOriginal = null;
            rosterDraft = null;
            activeIds = [];
            ui.optParticipants.replaceChildren();
            resetResults();
            ui.optTriggerContainer.replaceChildren();
            ui.optCandidateList.replaceChildren();
            status("status.error");
        }
        updateActions();
    });

    modal.addEventListener("hide.bs.modal", (event) => {
        if (running) {
            event.preventDefault();
            status("errors.running");
        }
    });
    ui.optTabTriggers.addEventListener("shown.bs.tab", () => { mode = "triggers"; });
    ui.optTabUpgrades.addEventListener("shown.bs.tab", () => { mode = "upgrades"; });
    ui.optInputParallelCount.addEventListener("input", () => {
        ui.optParallelCountDisplay.textContent = ui.optInputParallelCount.value;
        updateMemoryEstimate();
    });
    ui.optInputMaxEvaluations.addEventListener("input", () => { budgetTouched = true; });
    ui.optInputSeedCount.addEventListener("input", updateScanEstimate);
    ui.optInputDungeonCount.addEventListener("input", updateScanEstimate);
    ui.optInputSearchCount.addEventListener("input", updateScanEstimate);
    ui.optSelectDungeon.addEventListener("change", updateScanEstimate);
    ui.optSelectDifficulty.addEventListener("change", updateScanEstimate);
    // 结果区与候选列表把词条、编号和本地化数字混排在同一行，逐节点替换靠不住，
    // 语言切换后整体重建；选中的候选由 selectedTeamState 保持，不会被重置。
    window.i18next?.on?.("languageChanged", () => {
        if (results.length || report?.scan) renderResults();
        if (draftTeamState) renderCandidates();
        updateScanEstimate();
    });
    ui.optButtonSelectAllPlayers.addEventListener("click", toggleAllParticipants);
    ui.optSelectPlayer.addEventListener("change", fillItems);
    ui.optSelectSlot.addEventListener("change", fillItems);
    ui.optButtonAddCandidate.addEventListener("click", addCandidate);
    ui.optButtonGenerateUpgrades.addEventListener("click", generateCandidates);
    ui.optButtonRun.addEventListener("click", () => { void run(false); });
    ui.optButtonScan.addEventListener("click", () => { void run(true); });
    ui.optButtonStop.addEventListener("click", () => {
        controller?.abort();
        runner?.dispose();
        status("status.stopped");
    });
    ui.optButtonApply.addEventListener("click", () => {
        if (running) return status("errors.running");
        const teamState = selectedTeamState ?? draftTeamState;
        if (!teamState?.players.length) return status("errors.noTeam");
        if (!validTriggers(teamState)) return status("errors.invalidTriggers");
        try {
            applyTeamSnapshot(cloneTeamState(teamState), [...activeIds]);
            status("applied");
        } catch (error) {
            console.error(error);
            status("status.error");
        }
    });
    ui.optButtonExport.addEventListener("click", () => {
        if (!report) return status("noResults");
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `optimizer-${report.masterSeed}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        status("exported");
    });
    updateActions();
}
