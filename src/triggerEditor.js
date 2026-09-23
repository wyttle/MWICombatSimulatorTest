import combatTriggerDependencyDetailMap from "./combatsimulator/data/combatTriggerDependencyDetailMap.json";
import combatTriggerConditionDetailMap from "./combatsimulator/data/combatTriggerConditionDetailMap.json";
import combatTriggerComparatorDetailMap from "./combatsimulator/data/combatTriggerComparatorDetailMap.json";
import abilityDetailMap from "./combatsimulator/data/abilityDetailMap.json";
import itemDetailMap from "./combatsimulator/data/itemDetailMap.json";

export const MAX_TRIGGERS = 4;

export function fillDependencySelect(element) {
    element.length = 0;
    element.add(new Option("", ""));

    for (const dependency of Object.values(combatTriggerDependencyDetailMap).sort(
        (a, b) => a.sortIndex - b.sortIndex
    )) {
        let opt = new Option(dependency.name, dependency.hrid);
        opt.setAttribute("data-i18n", "combatTriggerDependencyNames." + dependency.hrid);
        element.add(opt);
    }
}

export function fillConditionSelect(element, dependencyHrid) {
    let dependency = combatTriggerDependencyDetailMap[dependencyHrid];

    let conditions;
    if (dependency.isSingleTarget) {
        conditions = Object.values(combatTriggerConditionDetailMap).filter((condition) => condition.isSingleTarget);
    } else {
        conditions = Object.values(combatTriggerConditionDetailMap).filter((condition) => condition.isMultiTarget);
    }

    element.length = 0;
    element.add(new Option("", ""));

    for (const condition of Object.values(conditions).sort((a, b) => a.sortIndex - b.sortIndex)) {
        let opt = new Option(condition.name, condition.hrid);
        opt.setAttribute("data-i18n", "combatTriggerConditionNames." + condition.hrid);
        element.add(opt);
    }
}

export function fillComparatorSelect(element, conditionHrid) {
    let condition = combatTriggerConditionDetailMap[conditionHrid];

    let comparators = condition.allowedComparatorHrids.map((hrid) => combatTriggerComparatorDetailMap[hrid]);

    element.length = 0;
    element.add(new Option("", ""));

    for (const comparator of Object.values(comparators).sort((a, b) => a.sortIndex - b.sortIndex)) {
        let opt = new Option(comparator.name, comparator.hrid);
        opt.setAttribute("data-i18n", "combatTriggerComparatorNames." + comparator.hrid);
        element.add(opt);
    }
}

export function isTriggerListValid(triggers) {
    return Array.isArray(triggers) && triggers.length <= MAX_TRIGGERS && triggers.every((trigger) => {
        if (!trigger) return false;
        const dependency = combatTriggerDependencyDetailMap[trigger.dependencyHrid];
        const condition = combatTriggerConditionDetailMap[trigger.conditionHrid];
        const comparator = combatTriggerComparatorDetailMap[trigger.comparatorHrid];
        return Boolean(dependency && condition && comparator
            && (dependency.isSingleTarget ? condition.isSingleTarget : condition.isMultiTarget)
            && condition.allowedComparatorHrids.includes(trigger.comparatorHrid)
            && (!comparator.allowValue || Number.isFinite(trigger.value)));
    });
}

export function defaultTriggersFor(hrid) {
    const triggers = hrid.startsWith("/items/")
        ? itemDetailMap[hrid].consumableDetail.defaultCombatTriggers
        : abilityDetailMap[hrid].defaultCombatTriggers;
    return structuredClone(triggers);
}

// 默认条件必须由技能或物品 HRID 确定，不能把打开编辑器时的配置当成默认值。
export function createTriggerListEditor(container, { hrid, getTriggers, setTriggers, onChange }) {
    function commit(triggers) {
        setTriggers(triggers);
        render();
        onChange?.();
    }

    function change(index, patch) {
        const triggers = structuredClone(getTriggers());
        Object.assign(triggers[index], patch);
        commit(triggers);
    }

    function element(tag, className, parent, key) {
        const node = document.createElement(tag);
        node.className = className;
        if (key) node.setAttribute("data-i18n", key);
        parent.appendChild(node);
        return node;
    }

    function render() {
        container.replaceChildren();
        const triggers = getTriggers();
        const body = element("div", "container-fluid", container);
        const heading = element("div", "row mb-2", body);
        element("div", "col", heading, "combatTriggersSetting.activateWhen");

        triggers.slice(0, MAX_TRIGGERS).forEach((trigger, index) => {
            const row = element("div", "row mb-2", body);
            const fields = element("div", "col-md-10", row);
            if (index > 0) {
                const andRow = element("div", "row mb-2", fields);
                const andColumn = element("div", "col", andRow);
                element("b", "", andColumn, "combatTriggersSetting.and");
            }
            const dependencyRow = element("div", "row mb-2", fields);
            const dependencyColumn = element("div", "col", dependencyRow);
            const dependencySelect = element("select", "form-select", dependencyColumn);
            fillDependencySelect(dependencySelect);
            dependencySelect.value = trigger.dependencyHrid;
            dependencySelect.addEventListener("change", () => change(index, {
                dependencyHrid: dependencySelect.value,
                conditionHrid: "",
                comparatorHrid: "",
                value: 0,
            }));

            const conditionRow = element("div", "row mb-2", fields);
            const conditionColumn = element("div", "col", conditionRow);
            const conditionSelect = element("select", "form-select", conditionColumn);
            conditionSelect.hidden = !combatTriggerDependencyDetailMap[trigger.dependencyHrid];
            if (!conditionSelect.hidden) {
                fillConditionSelect(conditionSelect, trigger.dependencyHrid);
                conditionSelect.value = trigger.conditionHrid;
            }
            conditionSelect.addEventListener("change", () => change(index, {
                conditionHrid: conditionSelect.value,
                comparatorHrid: "",
                value: 0,
            }));

            const comparisonRow = element("div", "row", fields);
            const comparatorColumn = element("div", "col-md-6", comparisonRow);
            const comparatorSelect = element("select", "form-select", comparatorColumn);
            comparatorSelect.hidden = conditionSelect.hidden || !combatTriggerConditionDetailMap[trigger.conditionHrid];
            if (!comparatorSelect.hidden) {
                fillComparatorSelect(comparatorSelect, trigger.conditionHrid);
                comparatorSelect.value = trigger.comparatorHrid;
            }
            comparatorSelect.addEventListener("change", () => change(index, {
                comparatorHrid: comparatorSelect.value,
            }));

            const valueColumn = element("div", "col-md-6", comparisonRow);
            const valueInput = element("input", "form-control", valueColumn);
            valueInput.type = "number";
            valueInput.step = "any";
            valueInput.hidden = comparatorSelect.hidden
                || !combatTriggerComparatorDetailMap[trigger.comparatorHrid]?.allowValue;
            valueInput.value = trigger.value;
            valueInput.addEventListener("change", () => change(index, { value: valueInput.valueAsNumber }));

            const removeColumn = element("div", "col-md-2 align-self-center", row);
            const removeButton = element("button", "btn btn-danger", removeColumn);
            removeButton.type = "button";
            removeButton.textContent = "×";
            removeButton.addEventListener("click", () => {
                const next = structuredClone(getTriggers());
                next.splice(index, 1);
                commit(next);
            });
        });

        const actions = element("div", "row mb-2", body);
        const addColumn = element("div", "col-md-6 text-center", actions);
        const addButton = element("button", "btn btn-primary", addColumn, "combatTriggersSetting.addCondition");
        addButton.type = "button";
        addButton.disabled = triggers.length >= MAX_TRIGGERS;
        addButton.addEventListener("click", () => {
            const next = structuredClone(getTriggers());
            if (next.length >= MAX_TRIGGERS) return;
            next.push({ dependencyHrid: "", conditionHrid: "", comparatorHrid: "", value: 0 });
            commit(next);
        });
        const resetColumn = element("div", "col-md-6 text-center", actions);
        const resetButton = element("button", "btn btn-primary", resetColumn, "combatTriggersSetting.resetDefault");
        resetButton.type = "button";
        resetButton.addEventListener("click", () => commit(defaultTriggersFor(hrid)));
    }

    render();
    return { render, isValid: () => isTriggerListValid(getTriggers()) };
}
