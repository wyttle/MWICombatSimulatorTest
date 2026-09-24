const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const SEARCH_ANALYSIS_TEXT = {
    title: "Threshold search analysis",
    caveat: "Each curve is conditional on the other thresholds being fixed. Points are sampled configurations, not a continuous response function; unsampled peaks may exist. All ΔDPS values use the same original baseline. Search comparisons are exploratory, not independent validation or proof of convergence.",
    variable: "Threshold variable",
    variableName: "{{player}} · {{ability}} · trigger {{index}}",
    context: "Fixed-coordinate context",
    contextName: "{{id}} · step {{step}}",
    fixedValues: "Fixed thresholds: {{values}}",
    noFixedValues: "None (one variable)",
    threshold: "Threshold value",
    deltaDps: "ΔDPS vs original baseline",
    chart: "Sampled threshold effects with paired 95% confidence intervals",
    chartHelp: "Whiskers show paired 95% confidence intervals when available. Dashed segments only link sampled points within this context. Axis scales are shared across contexts of the selected variable. Focus, hover, or select a point for exact values.",
    noPoints: "No finite sampled points in this context.",
    noContexts: "No coordinate-search contexts were recorded.",
    point: "Value: {{value}}; ΔDPS: {{delta}}; 95% CI: {{interval}}; samples: {{samples}}; evaluation: {{id}}; configuration: {{config}}",
    alternatives: "Alternative configurations (up to 5)",
    searchOnly: "Ranked by mean search DPS. These configurations reuse search samples and have not been independently validated.",
    noAlternatives: "No alternative configurations were recorded.",
    select: "Select configuration {{id}}",
    history: "Full evaluation history ({{count}})",
    historyHelp: "Configuration IDs are exact threshold vectors in the variable order shown below. The history includes the original baseline and every new simulation evaluation; cached configurations may appear in multiple curve contexts without another evaluation. Numeric cells retain the recorded precision.",
    evaluation: "Evaluation ID",
    configuration: "Configuration ID / exact values",
    contextId: "Context ID",
    step: "Search step",
    value: "Scanned value",
    baseline: "Original baseline",
    baselineDps: "Baseline DPS",
    candidateDps: "Configuration DPS",
    deltaPercent: "ΔDPS (%)",
    ciLow: "95% CI lower",
    ciHigh: "95% CI upper",
    samples: "Paired samples",
    deaths: "Deaths/hour delta",
    wipes: "Wipe rate delta",
    clears: "Clears/hour delta",
    rawSamples: "Exact per-seed samples",
    noHistory: "No evaluations were recorded.",
    unavailable: "Unavailable",
};

function element(tag, className = "", text = null) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== null) node.textContent = text;
    return node;
}

function svgElement(tag, attributes = {}, text = null) {
    const node = document.createElementNS(SVG_NAMESPACE, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text !== null) node.textContent = text;
    return node;
}

function configurationId(entry) {
    // 完整向量本身作为稳定标识，避免把不同坐标背景下的同一阈值混为一谈。
    return JSON.stringify(entry.values ?? []);
}

function pointValue(entry) {
    return entry.value ?? entry.values?.[entry.variableIndex];
}

function extent(values, includeZero = false) {
    let low = includeZero ? 0 : Infinity;
    let high = includeZero ? 0 : -Infinity;
    for (const value of values) {
        if (!Number.isFinite(value)) continue;
        low = Math.min(low, value);
        high = Math.max(high, value);
    }
    if (!Number.isFinite(low)) return [0, 1];
    const padding = low === high ? Math.max(Math.abs(low) * 0.05, 1) : (high - low) * 0.06;
    return [low - padding, high + padding];
}

export function renderSearchAnalysis({ scan, variables, onSelect, t, abilityName, playerName }) {
    const text = (key, options = {}) => t(`analysis.${key}`, { defaultValue: SEARCH_ANALYSIS_TEXT[key], ...options });
    const translated = (node, key, options = {}) => {
        node.setAttribute("data-i18n", `common:optimizer.analysis.${key}`);
        node.setAttribute("data-i18n-options", JSON.stringify(options));
        node.textContent = text(key, options);
        return node;
    };
    const label = (tag, className, key, options) => translated(element(tag, className), key, options);
    const svgLabel = (tag, attributes, key, options) => translated(svgElement(tag, attributes), key, options);
    const exact = (value) => Number.isFinite(value) ? String(value) : text("unavailable");
    const tick = (value) => value === 0 ? "0" : Number(value.toPrecision(6)).toString();
    const variableLabel = (index) => {
        const variable = variables[index];
        if (!variable) return text("baseline");
        return text("variableName", {
            player: playerName(variable.playerId),
            ability: abilityName(variable.abilityHrid),
            index: variable.triggerIndex + 1,
        });
    };
    const interval = (comparison) => Number.isFinite(comparison?.ciLow) && Number.isFinite(comparison?.ciHigh)
        ? `[${exact(comparison.ciLow)}, ${exact(comparison.ciHigh)}]` : text("unavailable");
    const history = scan.history ?? [];
    const contexts = scan.contexts ?? [];
    const points = scan.curve?.length ? scan.curve : history;
    const evaluations = new Map(history.map((entry) => [configurationId(entry), entry.id]));
    const root = element("section", "border rounded p-3 mt-3");
    root.append(label("h5", "mb-2", "title"), label("p", "small text-muted", "caveat"));

    const controls = element("div", "row g-2 mb-2");
    const variableSelect = element("select", "form-select form-select-sm");
    const contextSelect = element("select", "form-select form-select-sm");
    for (const [key, select] of [["variable", variableSelect], ["context", contextSelect]]) {
        const wrapper = element("label", "col-md-6");
        wrapper.append(label("span", "d-block small mb-1", key), select);
        controls.append(wrapper);
    }
    for (let index = 0; index < variables.length; index++) {
        const option = element("option", "", variableLabel(index));
        option.value = String(index);
        variableSelect.append(option);
    }
    variableSelect.disabled = !variables.length;
    const fixedValues = element("p", "small text-break mb-2");
    const chartContainer = element("div", "overflow-auto");
    const chartHelp = label("p", "small text-muted mt-2 mb-1", "chartHelp");
    const pointDetails = element("p", "small text-break mb-3");
    pointDetails.setAttribute("aria-live", "polite");
    root.append(controls, fixedValues, chartContainer, chartHelp, pointDetails);

    function drawContext() {
        chartContainer.replaceChildren();
        pointDetails.textContent = "";
        const variableIndex = Number(variableSelect.value);
        const context = contexts.find((entry) => String(entry.id) === contextSelect.value && entry.variableIndex === variableIndex);
        if (!context) {
            fixedValues.textContent = "";
            chartContainer.append(label("p", "text-muted", "noContexts"));
            return;
        }
        const fixed = variables.flatMap((variable, index) => index === variableIndex ? [] : [`${variableLabel(index)} = ${exact(context.values?.[index])}`]);
        translated(fixedValues, "fixedValues", { values: fixed.join("; ") || text("noFixedValues") });
        const variablePoints = points.filter((entry) => entry.variableIndex === variableIndex && Number.isFinite(pointValue(entry)) && Number.isFinite(entry.comparison?.deltaDps));
        const selectedPoints = variablePoints.filter((entry) => String(entry.contextId) === String(context.id)).sort((a, b) => pointValue(a) - pointValue(b));
        if (!selectedPoints.length) {
            chartContainer.append(label("p", "text-muted", "noPoints"));
            return;
        }
        // 同一变量的各背景复用相同坐标轴；仅当前背景内的点允许连线。
        const xBounds = extent(variablePoints.map(pointValue));
        const yBounds = extent(variablePoints.flatMap((entry) => [entry.comparison.deltaDps, entry.comparison.ciLow, entry.comparison.ciHigh]), true);
        const width = 800;
        const height = 370;
        const left = 100;
        const right = width - 30;
        const top = 48;
        const bottom = height - 62;
        const x = (value) => left + (value - xBounds[0]) / (xBounds[1] - xBounds[0]) * (right - left);
        const y = (value) => bottom - (value - yBounds[0]) / (yBounds[1] - yBounds[0]) * (bottom - top);
        const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": text("chart") });
        svg.style.width = "100%";
        svg.style.minWidth = "560px";
        svg.style.display = "block";
        svg.append(svgLabel("title", {}, "chart"), svgLabel("text", { x: left, y: 21, fill: "currentColor", "font-size": 13 }, "deltaDps"));
        for (let index = 0; index <= 4; index++) {
            const xValue = xBounds[0] + (xBounds[1] - xBounds[0]) * index / 4;
            const yValue = yBounds[0] + (yBounds[1] - yBounds[0]) * index / 4;
            svg.append(
                svgElement("line", { x1: left, y1: y(yValue), x2: right, y2: y(yValue), stroke: "currentColor", opacity: 0.15 }),
                svgElement("text", { x: left - 9, y: y(yValue) + 4, "text-anchor": "end", fill: "currentColor", "font-size": 12 }, tick(yValue)),
                svgElement("text", { x: x(xValue), y: bottom + 22, "text-anchor": "middle", fill: "currentColor", "font-size": 12 }, tick(xValue)),
            );
        }
        svg.append(
            svgElement("line", { x1: left, y1: top, x2: left, y2: bottom, stroke: "currentColor" }),
            svgElement("line", { x1: left, y1: bottom, x2: right, y2: bottom, stroke: "currentColor" }),
            svgElement("line", { x1: left, y1: y(0), x2: right, y2: y(0), stroke: "currentColor", "stroke-dasharray": "5 5", opacity: 0.6 }),
            svgLabel("text", { x: (left + right) / 2, y: height - 12, "text-anchor": "middle", fill: "currentColor", "font-size": 13 }, "threshold"),
        );
        if (selectedPoints.length > 1) {
            svg.append(svgElement("polyline", {
                points: selectedPoints.map((entry) => `${x(pointValue(entry))},${y(entry.comparison.deltaDps)}`).join(" "),
                fill: "none", stroke: "var(--bs-primary, #0d6efd)", "stroke-dasharray": "3 4", opacity: 0.6,
            }));
        }
        for (const entry of selectedPoints) {
            const comparison = entry.comparison;
            const cx = x(pointValue(entry));
            if (Number.isFinite(comparison.ciLow) && Number.isFinite(comparison.ciHigh)) {
                const low = y(comparison.ciLow);
                const high = y(comparison.ciHigh);
                svg.append(svgElement("path", {
                    d: `M ${cx} ${low} V ${high} M ${cx - 5} ${low} H ${cx + 5} M ${cx - 5} ${high} H ${cx + 5}`,
                    fill: "none", stroke: "var(--bs-primary, #0d6efd)", "stroke-width": 1.5,
                }));
            }
            const description = text("point", {
                value: exact(pointValue(entry)), delta: exact(comparison.deltaDps), interval: interval(comparison),
                samples: exact(comparison.n), id: entry.id ?? entry.historyId ?? evaluations.get(configurationId(entry)) ?? text("unavailable"),
                config: configurationId(entry),
            });
            const dot = svgElement("circle", {
                cx, cy: y(comparison.deltaDps), r: 5, fill: "var(--bs-primary, #0d6efd)",
                stroke: "currentColor", "stroke-width": 0.5, tabindex: 0, role: "img", "aria-label": description,
            });
            dot.append(svgElement("title", {}, description));
            const showDetails = () => { pointDetails.textContent = description; };
            dot.addEventListener("focus", showDetails);
            dot.addEventListener("pointerenter", showDetails);
            dot.addEventListener("click", showDetails);
            svg.append(dot);
        }
        chartContainer.append(svg);
    }

    function updateContexts() {
        contextSelect.replaceChildren();
        const variableIndex = Number(variableSelect.value);
        for (const context of contexts) {
            if (context.variableIndex !== variableIndex) continue;
            const option = label("option", "", "contextName", { id: context.id, step: exact(context.step) });
            option.value = String(context.id);
            contextSelect.append(option);
        }
        contextSelect.disabled = !contextSelect.options.length;
        drawContext();
    }
    variableSelect.addEventListener("change", updateContexts);
    contextSelect.addEventListener("change", drawContext);
    updateContexts();

    root.append(label("h6", "mt-3", "alternatives"), label("p", "small text-muted", "searchOnly"));
    const alternatives = (scan.alternatives ?? []).slice(0, 5);
    if (!alternatives.length) root.append(label("p", "small text-muted", "noAlternatives"));
    for (const alternative of alternatives) {
        const row = element("div", "border rounded p-2 mb-2 small");
        const comparison = alternative.comparison ?? {};
        row.append(element("div", "text-break", `${text("configuration")}: ${configurationId(alternative)}`));
        row.append(element("div", "mb-2", `${text("candidateDps")}: ${exact(comparison.candidateDps)}; ${text("deltaDps")}: ${exact(comparison.deltaDps)}; ${text("ciLow")}: ${exact(comparison.ciLow)}; ${text("ciHigh")}: ${exact(comparison.ciHigh)}; ${text("samples")}: ${exact(comparison.n)}`));
        const button = label("button", "btn btn-sm btn-outline-primary", "select", { id: alternative.id });
        button.type = "button";
        button.disabled = typeof onSelect !== "function";
        button.addEventListener("click", () => onSelect?.(alternative));
        row.append(button);
        root.append(row);
    }

    const details = element("details", "mt-3");
    details.append(label("summary", "fw-semibold", "history", { count: history.length }));
    details.append(label("p", "small text-muted mt-2", "historyHelp"));
    const legend = element("ol", "small");
    for (let index = 0; index < variables.length; index++) legend.append(element("li", "", variableLabel(index)));
    details.append(legend);
    // 展开后才构造长表格，完整保留数值与逐 seed 原始样本，不截断历史。
    let historyRendered = false;
    details.addEventListener("toggle", () => {
        if (!details.open || historyRendered) return;
        historyRendered = true;
        if (!history.length) {
            details.append(label("p", "text-muted", "noHistory"));
            return;
        }
        const container = element("div", "table-responsive");
        const table = element("table", "table table-sm table-bordered small align-middle");
        const head = element("thead");
        const headings = element("tr");
        const metrics = [
            ["baselineDps", "baselineDps"], ["candidateDps", "candidateDps"], ["deltaDps", "deltaDps"],
            ["deltaPercent", "deltaPercent"], ["ciLow", "ciLow"], ["ciHigh", "ciHigh"], ["samples", "n"],
            ["deaths", "deathsPerHourDelta"], ["wipes", "wipeRateDelta"], ["clears", "clearsPerHourDelta"],
        ];
        for (const key of ["evaluation", "configuration", "contextId", "variable", "value", "step", ...metrics.map(([key]) => key), "rawSamples"]) {
            const heading = label("th", "text-nowrap", key);
            heading.scope = "col";
            headings.append(heading);
        }
        head.append(headings);
        const body = element("tbody");
        for (const entry of history) {
            const row = element("tr");
            const cells = [entry.id ?? text("unavailable"), configurationId(entry), entry.contextId ?? text("baseline"),
                variableLabel(entry.variableIndex), exact(pointValue(entry)), exact(entry.step),
                ...metrics.map(([, key]) => exact(entry.comparison?.[key]))];
            for (const value of cells) row.append(element("td", "text-nowrap", String(value)));
            const samplesCell = element("td");
            const sampleDetails = element("details");
            sampleDetails.append(label("summary", "text-nowrap", "rawSamples"));
            let samplesRendered = false;
            sampleDetails.addEventListener("toggle", () => {
                if (!sampleDetails.open || samplesRendered) return;
                samplesRendered = true;
                sampleDetails.append(element("pre", "mb-0", JSON.stringify(entry.samples ?? [], null, 2)));
            });
            samplesCell.append(sampleDetails);
            row.append(samplesCell);
            body.append(row);
        }
        table.append(head, body);
        container.append(table);
        details.append(container);
    });
    root.append(details);
    return root;
}
