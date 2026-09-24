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
    modelCaveat: "This Gaussian-process curve estimates ΔDPS through the selected configuration with all other thresholds fixed. The shaded 95% band represents model uncertainty, not measurements; only overlaid points are measured. Unexplored regions have wider bands. Use this view to judge peak locations and multiple modes, not as validation.",
    modelChart: "Gaussian-process threshold slice with model uncertainty and measured paired intervals",
    modelHelp: "The solid line is the model mean; shading is mean ± 1.96 standard deviations. Overlaid points and their paired 95% intervals are measured configurations with exactly these fixed thresholds. The diamond marks the selected best threshold. Focus, hover, or select a point for exact values.",
    noModelSlice: "No finite model slice is available for this variable.",
    posteriorEstimate: "Model estimate ΔDPS: {{mean}}; model standard deviation: {{sd}}",
    bestValue: "Selected best threshold: {{value}}",
    sensitivity: "Threshold sensitivity",
    sensitivityHelp: "Relative influence estimated from the Gaussian-process length scales, not a measurement. Only meaningful after enough evaluations.",
    sensitivityLow: "The model rates this threshold as barely influential; consider unticking it next run to spend the budget on the others.",
    partialSamples: "partial: {{samples}}/{{total}}",
    partialHelp: "Hollow, smaller points have only some paired seed samples; their intervals are based on fewer samples and may be wider.",
    samplesTotal: "Paired samples / total seeds",
    phase: "Search phase",
    phaseBaseline: "Baseline",
    phaseInitial: "Initial",
    phaseAcquisition: "Acquisition",
    phasePromotion: "Promotion",
    axisScale: "Threshold axis scale",
    linearScale: "Linear",
    logScale: "Log-like (signed log1p)",
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

function extent(values, includeZero = false, paddingRatio = 0.06) {
    let low = includeZero ? 0 : Infinity;
    let high = includeZero ? 0 : -Infinity;
    for (const value of values) {
        if (!Number.isFinite(value)) continue;
        low = Math.min(low, value);
        high = Math.max(high, value);
    }
    if (!Number.isFinite(low)) return [0, 1];
    const padding = low === high ? Math.max(Math.abs(low) * 0.05, 1) : (high - low) * paddingRatio;
    return [low - padding, high + padding];
}

function linearTicks([low, high]) {
    const targetStep = (high - low) / 6;
    const magnitude = 10 ** Math.floor(Math.log10(targetStep));
    const fraction = targetStep / magnitude;
    const step = (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * magnitude;
    const values = [];
    // 按整数序号生成刻度，避免反复相加造成浮点误差与负零。
    for (let index = Math.ceil(low / step); index <= Math.floor(high / step); index++) values.push(index * step);
    return { values, digits: Math.min(10, Math.max(0, -Math.floor(Math.log10(step)))) };
}

function logTicks([low, high]) {
    const values = low <= 0 && high >= 0 ? [0] : [];
    const limit = Math.max(Math.abs(low), Math.abs(high));
    for (let exponent = 0; exponent <= Math.floor(Math.log10(limit)); exponent++) {
        const value = 10 ** exponent;
        if (-value >= low && -value <= high) values.push(-value);
        if (value >= low && value <= high) values.push(value);
    }
    return values.length >= 2 ? { values: values.sort((a, b) => a - b), digits: 0 } : linearTicks([low, high]);
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
    const locale = globalThis.window?.i18next?.language;
    const formatters = new Map();
    const format = (value, digits = 2, signed = false) => {
        if (!Number.isFinite(value)) return text("unavailable");
        const key = `${digits}:${signed}`;
        if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat(locale, { maximumFractionDigits: digits, signDisplay: signed ? "exceptZero" : "auto" }));
        const scale = 10 ** digits;
        const rounded = Math.round(value * scale) / scale;
        return formatters.get(key).format(rounded === 0 ? 0 : rounded);
    };
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
    const isBayes = scan.method === "bayes";
    const sampleCount = (entry) => entry.comparison?.n ?? entry.samples?.length;
    const isPartial = (entry) => isBayes && Number.isFinite(scan.seedCount) && sampleCount(entry) < scan.seedCount;
    const sampleText = (entry) => {
        if (!isBayes) return exact(entry.comparison?.n);
        const samples = exact(sampleCount(entry));
        if (!Number.isFinite(scan.seedCount)) return samples;
        const total = exact(scan.seedCount);
        return isPartial(entry) ? text("partialSamples", { samples, total }) : `${samples}/${total}`;
    };
    const contexts = scan.contexts ?? [];
    const points = scan.curve?.length ? scan.curve : history;
    const evaluations = new Map(history.map((entry) => [configurationId(entry), entry.id]));
    const root = element("section", "border rounded p-3 mt-3");
    root.append(label("h5", "mb-2", "title"), label("p", "small text-muted", isBayes ? "modelCaveat" : "caveat"));
    if (isBayes && scan.sensitivity) {
        const sensitivity = element("section", "optimizer-sensitivity mb-3");
        sensitivity.append(label("h6", "mb-1", "sensitivity"), label("p", "small text-muted mb-2", "sensitivityHelp"));
        for (const { variableIndex, relevance } of [...scan.sensitivity].sort((a, b) => b.relevance - a.relevance)) {
            const row = element("div", "optimizer-sensitivity-row small mb-2");
            const heading = element("div", "d-flex justify-content-between gap-2");
            const percentage = `${format(relevance * 100, 1)}%`;
            heading.append(element("span", "text-break", variableLabel(variableIndex)), element("span", "text-nowrap", percentage));
            const track = element("div", "bg-secondary bg-opacity-25 rounded overflow-hidden");
            track.style.height = "0.4rem";
            track.setAttribute("aria-hidden", "true");
            const bar = element("div", "optimizer-sensitivity-bar bg-primary h-100");
            bar.style.width = `${relevance * 100}%`;
            track.append(bar);
            row.append(heading, track);
            if (relevance < 0.05) row.append(label("p", "optimizer-sensitivity-hint text-muted mb-0 mt-1", "sensitivityLow"));
            sensitivity.append(row);
        }
        root.append(sensitivity);
    }

    const controls = element("div", "row g-2 mb-2");
    const variableSelect = element("select", "form-select form-select-sm");
    const contextSelect = element("select", "form-select form-select-sm");
    const scaleSelect = isBayes ? element("select", "form-select form-select-sm optimizer-axis-scale") : null;
    if (scaleSelect) {
        for (const [value, key] of [["linear", "linearScale"], ["log-like", "logScale"]]) {
            const option = label("option", "", key);
            option.value = value;
            scaleSelect.append(option);
        }
    }
    for (const [key, select] of [["variable", variableSelect], isBayes ? ["axisScale", scaleSelect] : ["context", contextSelect]]) {
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
    const chartHelp = label("p", "small text-muted mt-2 mb-1", isBayes ? "modelHelp" : "chartHelp");
    const pointDetails = element("p", "small text-break mb-3");
    pointDetails.setAttribute("aria-live", "polite");
    root.append(controls, fixedValues, chartContainer, chartHelp, pointDetails);
    if (isBayes) root.append(label("p", "small text-muted mb-2", "partialHelp"));

    function drawContext() {
        chartContainer.replaceChildren();
        pointDetails.textContent = "";
        const variableIndex = Number(variableSelect.value);
        const slice = isBayes ? scan.modelSlices?.find((entry) => entry.variableIndex === variableIndex) : null;
        const context = isBayes ? slice && { values: slice.fixedValues } : contexts.find((entry) => String(entry.id) === contextSelect.value && entry.variableIndex === variableIndex);
        if (!context) {
            fixedValues.textContent = "";
            chartContainer.append(label("p", "text-muted", isBayes ? "noModelSlice" : "noContexts"));
            return;
        }
        const fixed = variables.flatMap((variable, index) => index === variableIndex ? [] : [`${variableLabel(index)} = ${exact(context.values?.[index])}`]);
        translated(fixedValues, "fixedValues", { values: fixed.join("; ") || text("noFixedValues") });
        // 模型切片只叠加其他坐标完全一致的实测点，不能把不同配置投影为可比观测。
        const modelPoints = (slice?.points ?? []).filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.mean) && Number.isFinite(entry.sd) && entry.sd >= 0).sort((a, b) => a.value - b.value);
        const variablePoints = isBayes
            ? history.filter((entry) => entry.values?.length === slice.fixedValues.length && slice.fixedValues.every((value, index) => index === variableIndex || entry.values[index] === value))
                .map((entry) => ({ ...entry, value: entry.values[variableIndex] }))
                .filter((entry) => Number.isFinite(pointValue(entry)) && Number.isFinite(entry.comparison?.deltaDps))
            : points.filter((entry) => entry.variableIndex === variableIndex && Number.isFinite(pointValue(entry)) && Number.isFinite(entry.comparison?.deltaDps));
        const selectedPoints = (isBayes ? variablePoints : variablePoints.filter((entry) => String(entry.contextId) === String(context.id))).sort((a, b) => pointValue(a) - pointValue(b));
        if (isBayes ? !modelPoints.length : !selectedPoints.length) {
            chartContainer.append(label("p", "text-muted", isBayes ? "noModelSlice" : "noPoints"));
            return;
        }
        // 同一变量的各背景复用相同坐标轴；仅当前背景内的点允许连线。
        const logScale = scaleSelect?.value === "log-like";
        const transform = (value) => logScale ? Math.sign(value) * Math.log1p(Math.abs(value)) : value;
        // 对数轴直接使用数据边界，避免变换空间的留白放大为极大的阈值外推。
        const xValues = variablePoints.map(pointValue);
        if (isBayes) xValues.push(...modelPoints.map((entry) => entry.value), slice.fixedValues[variableIndex]);
        const xDomain = extent(xValues, false, isBayes ? 0 : 0.06);
        const xBounds = xDomain.map(transform);
        const xTicks = logScale ? logTicks(xDomain) : linearTicks(xDomain);
        const yValues = variablePoints.flatMap((entry) => [entry.comparison.deltaDps, entry.comparison.ciLow, entry.comparison.ciHigh]);
        if (isBayes) yValues.push(...modelPoints.flatMap((entry) => [entry.mean - 1.96 * entry.sd, entry.mean + 1.96 * entry.sd]));
        const yBounds = extent(yValues, true);
        const yTicks = linearTicks(yBounds);
        const width = 800;
        const height = 370;
        const left = 100;
        const right = width - 30;
        const top = 48;
        const bottom = height - 62;
        const x = (value) => left + (transform(value) - xBounds[0]) / (xBounds[1] - xBounds[0]) * (right - left);
        const y = (value) => bottom - (value - yBounds[0]) / (yBounds[1] - yBounds[0]) * (bottom - top);
        const chartKey = isBayes ? "modelChart" : "chart";
        const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": text(chartKey) });
        if (isBayes) svg.setAttribute("class", "optimizer-model-slice");
        svg.style.width = "100%";
        svg.style.minWidth = "560px";
        svg.style.display = "block";
        svg.append(svgLabel("title", {}, chartKey), svgLabel("text", { x: left, y: 21, fill: "currentColor", "font-size": 13 }, "deltaDps"));
        for (const yValue of yTicks.values) {
            svg.append(
                svgElement("line", { x1: left, y1: y(yValue), x2: right, y2: y(yValue), stroke: "currentColor", opacity: 0.15 }),
                svgElement("text", { class: "optimizer-y-tick", x: left - 9, y: y(yValue) + 4, "text-anchor": "end", fill: "currentColor", "font-size": 12 }, format(yValue, yTicks.digits)),
            );
        }
        for (const xValue of xTicks.values) {
            svg.append(svgElement("text", { class: "optimizer-x-tick", x: x(xValue), y: bottom + 22, "text-anchor": "middle", fill: "currentColor", "font-size": 12 }, format(xValue, xTicks.digits)));
        }
        svg.append(
            svgElement("line", { x1: left, y1: top, x2: left, y2: bottom, stroke: "currentColor" }),
            svgElement("line", { x1: left, y1: bottom, x2: right, y2: bottom, stroke: "currentColor" }),
            svgElement("line", { x1: left, y1: y(0), x2: right, y2: y(0), stroke: "currentColor", "stroke-dasharray": "5 5", opacity: 0.6 }),
            svgLabel("text", { x: (left + right) / 2, y: height - 12, "text-anchor": "middle", fill: "currentColor", "font-size": 13 }, "threshold"),
        );
        if (isBayes) {
            const upper = modelPoints.map((entry) => `${x(entry.value)},${y(entry.mean + 1.96 * entry.sd)}`);
            const lower = modelPoints.map((entry) => `${x(entry.value)},${y(entry.mean - 1.96 * entry.sd)}`).reverse();
            svg.append(
                svgElement("polygon", { class: "optimizer-model-band", points: [...upper, ...lower].join(" "), fill: "var(--bs-primary, #0d6efd)", opacity: 0.16 }),
                svgElement("polyline", {
                    class: "optimizer-model-mean", points: modelPoints.map((entry) => `${x(entry.value)},${y(entry.mean)}`).join(" "),
                    fill: "none", stroke: "var(--bs-primary, #0d6efd)", "stroke-width": 2,
                }),
            );
            const bestValue = slice.fixedValues[variableIndex];
            if (Number.isFinite(bestValue)) {
                const cx = x(bestValue);
                const description = text("bestValue", { value: exact(bestValue) });
                const marker = svgElement("path", {
                    class: "optimizer-best-threshold", d: `M ${cx} ${bottom - 7} L ${cx + 6} ${bottom} L ${cx} ${bottom + 7} L ${cx - 6} ${bottom} Z`,
                    fill: "var(--bs-warning, #ffc107)", stroke: "currentColor", tabindex: 0, role: "img", "aria-label": description,
                });
                marker.append(svgElement("title", {}, description));
                const showDetails = () => { pointDetails.textContent = description; };
                marker.addEventListener("focus", showDetails);
                marker.addEventListener("pointerenter", showDetails);
                marker.addEventListener("click", showDetails);
                svg.append(svgElement("line", { x1: cx, y1: top, x2: cx, y2: bottom, stroke: "currentColor", "stroke-dasharray": "2 5", opacity: 0.5 }), marker);
            }
        } else if (selectedPoints.length > 1) {
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
                samples: sampleText(entry), id: entry.id ?? entry.historyId ?? evaluations.get(configurationId(entry)) ?? text("unavailable"),
                config: configurationId(entry),
            });
            const dot = svgElement("circle", {
                cx, cy: y(comparison.deltaDps), r: 5, fill: "var(--bs-primary, #0d6efd)",
                stroke: "currentColor", "stroke-width": 0.5, tabindex: 0, role: "img", "aria-label": description,
            });
            if (isBayes) dot.setAttribute("class", `optimizer-measured-point${isPartial(entry) ? " optimizer-partial-point" : ""}`);
            if (isPartial(entry)) {
                dot.setAttribute("r", "4");
                dot.setAttribute("fill", "var(--bs-body-bg, #fff)");
                dot.setAttribute("stroke", "var(--bs-primary, #0d6efd)");
                dot.setAttribute("stroke-width", "1.5");
            }
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
        if (isBayes) {
            const variable = variables[Number(variableSelect.value)];
            scaleSelect.value = variable && variable.max / (Math.abs(variable.min) + variable.step) > 50 ? "log-like" : "linear";
            drawContext();
            return;
        }
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
    scaleSelect?.addEventListener("change", drawContext);
    updateContexts();

    root.append(label("h6", "mt-3", "alternatives"), label("p", "small text-muted", "searchOnly"));
    const alternatives = (scan.alternatives ?? []).slice(0, 5);
    if (!alternatives.length) root.append(label("p", "small text-muted", "noAlternatives"));
    for (const alternative of alternatives) {
        const row = element("div", "border rounded p-2 mb-2 small");
        if (isPartial(alternative)) row.classList.add("optimizer-partial-configuration");
        const comparison = alternative.comparison ?? {};
        row.append(element("div", "text-break", `${text("configuration")}: ${configurationId(alternative)}`));
        row.append(element("div", "mb-2", `${text("candidateDps")}: ${exact(comparison.candidateDps)}; ${text("deltaDps")}: ${exact(comparison.deltaDps)}; ${text("ciLow")}: ${exact(comparison.ciLow)}; ${text("ciHigh")}: ${exact(comparison.ciHigh)}; ${text("samples")}: ${sampleText(alternative)}`));
        if (Number.isFinite(alternative.posteriorMean) && Number.isFinite(alternative.posteriorSd)) {
            row.append(label("div", "optimizer-posterior-estimate mb-2", "posteriorEstimate", { mean: format(alternative.posteriorMean, 2, true), sd: format(alternative.posteriorSd) }));
        }
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
        const columnKeys = ["evaluation", "configuration", "contextId", "variable", "value", "step", ...(isBayes ? ["phase"] : []), ...metrics.map(([key]) => key), "rawSamples"];
        const columnClass = (key) => isBayes && key === "samples" ? "optimizer-history-samples" : isBayes && key === "phase" ? "optimizer-history-phase" : "";
        for (const key of columnKeys) {
            const heading = label("th", `text-nowrap${columnClass(key) ? ` ${columnClass(key)}` : ""}`, isBayes && key === "samples" ? "samplesTotal" : key);
            heading.scope = "col";
            headings.append(heading);
        }
        head.append(headings);
        const body = element("tbody");
        for (const entry of history) {
            const row = element("tr");
            if (isPartial(entry)) row.classList.add("optimizer-partial-configuration");
            const phaseKey = { baseline: "phaseBaseline", initial: "phaseInitial", acquisition: "phaseAcquisition", promotion: "phasePromotion" }[entry.phase];
            const cells = [entry.id ?? text("unavailable"), configurationId(entry), entry.contextId ?? text("baseline"),
                variableLabel(entry.variableIndex), exact(pointValue(entry)), exact(entry.step),
                ...(isBayes ? [text(phaseKey ?? "unavailable")] : []),
                ...metrics.map(([, key]) => isBayes && key === "n" ? sampleText(entry) : exact(entry.comparison?.[key]))];
            for (const [index, value] of cells.entries()) {
                const className = columnClass(columnKeys[index]);
                row.append(element("td", `text-nowrap${className ? ` ${className}` : ""}`, String(value)));
            }
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
