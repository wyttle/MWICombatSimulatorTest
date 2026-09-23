import houseRoomDetailMap from "../combatsimulator/data/houseRoomDetailMap.json";

export const SALE_TAX = 0.05;

function validPrice(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function priceItem(marketData, itemHrid, enhancementLevel, { prices, side }) {
    if (!["buy", "sell", "ask", "bid"].includes(side)) throw new Error("价格方向无效");
    if (!Number.isInteger(enhancementLevel) || enhancementLevel < 0) throw new Error("价格强化等级无效");
    if (itemHrid === "/items/coin") return { price: 1, estimated: false };
    const buying = side === "buy" || side === "ask";
    const marketPrice = marketData?.[itemHrid]?.[String(enhancementLevel)]?.[buying ? "a" : "b"];
    if (validPrice(marketPrice)) return { price: marketPrice, estimated: false };
    const fallback = prices?.[itemHrid];
    const keys = buying ? ["ask", "bid", "vendor"] : ["bid", "ask", "vendor"];
    for (const key of keys) {
        if (validPrice(fallback?.[key])) return { price: fallback[key], estimated: true };
    }
    return { price: null, estimated: false };
}

export function priceChanges(changes, ctx) {
    const lines = [];
    let grossCost = 0;
    let resaleValue = 0;
    const addLine = (change, itemHrid, enhancementLevel, quantity, side, roomHrid) => {
        const quote = priceItem(ctx.marketData, itemHrid, enhancementLevel, { prices: ctx.prices, side });
        const total = quote.price === null ? null : quote.price * quantity * (side === "sell" ? 1 - SALE_TAX : 1);
        lines.push({
            kind: change.kind, playerId: change.playerId, itemHrid, roomHrid,
            enhancementLevel, quantity, side, ...quote, total,
        });
        if (side === "sell") resaleValue = total === null || resaleValue === null ? null : resaleValue + total;
        else grossCost = total === null || grossCost === null ? null : grossCost + total;
    };
    for (const change of changes) {
        if (change.kind === "equipment") {
            const { before, after } = change;
            if (before?.itemHrid === after?.itemHrid && before?.enhancementLevel === after?.enhancementLevel) continue;
            if (after) addLine(change, after.itemHrid, Number(after.enhancementLevel ?? 0), 1, "buy");
            if (before) addLine(change, before.itemHrid, Number(before.enhancementLevel ?? 0), 1, "sell");
        } else if (change.kind === "house") {
            if (!Number.isInteger(change.before) || !Number.isInteger(change.after) || change.before < 0 || change.after < change.before) {
                throw new Error("房间升级等级无效");
            }
            const room = houseRoomDetailMap[change.roomHrid];
            for (let level = change.before + 1; level <= change.after; level++) {
                const costs = room?.upgradeCostsMap?.[String(level)];
                if (!Array.isArray(costs)) throw new Error("房间升级成本不存在");
                for (const cost of costs) addLine(change, cost.itemHrid, 0, cost.count, "buy", change.roomHrid);
            }
        } else if (change.kind !== "trigger") {
            throw new Error("未知改动类型");
        }
    }
    const known = grossCost !== null && resaleValue !== null;
    return { grossCost, resaleValue, netCost: known ? grossCost - resaleValue : null, known, lines };
}

function consumableRates(samples) {
    if (!Array.isArray(samples) || !samples.length) throw new Error("消耗品样本不能为空");
    const counts = new Map();
    let hours = 0;
    for (const sample of samples) {
        if (!Number.isFinite(sample.simulatedTime) || sample.simulatedTime < 0) throw new Error("模拟时间无效");
        hours += sample.simulatedTime / 3.6e12;
        for (const [playerHrid, items] of Object.entries(sample.consumablesUsed || {})) {
            if (!playerHrid.startsWith("player")) continue;
            for (const [itemHrid, count] of Object.entries(items)) {
                if (!Number.isFinite(count) || count < 0) throw new Error("消耗品使用次数无效");
                counts.set(itemHrid, (counts.get(itemHrid) || 0) + count);
            }
        }
    }
    return { counts, hours };
}

export function priceConsumableDelta(baselineSamples, candidateSamples, ctx) {
    const before = consumableRates(baselineSamples);
    const after = consumableRates(candidateSamples);
    const lines = [];
    let coinPerHourDelta = before.hours > 0 && after.hours > 0 ? 0 : null;
    for (const itemHrid of new Set([...before.counts.keys(), ...after.counts.keys()])) {
        const baselinePerHour = before.hours > 0 ? (before.counts.get(itemHrid) || 0) / before.hours : null;
        const candidatePerHour = after.hours > 0 ? (after.counts.get(itemHrid) || 0) / after.hours : null;
        const quantityPerHourDelta = baselinePerHour === null || candidatePerHour === null ? null : candidatePerHour - baselinePerHour;
        const quote = priceItem(ctx.marketData, itemHrid, 0, { prices: ctx.prices, side: "buy" });
        const delta = quantityPerHourDelta === null || quote.price === null ? null : quantityPerHourDelta * quote.price;
        lines.push({ itemHrid, baselinePerHour, candidatePerHour, quantityPerHourDelta, ...quote, coinPerHourDelta: delta });
        coinPerHourDelta = coinPerHourDelta === null || delta === null ? null : coinPerHourDelta + delta;
    }
    return { coinPerHourDelta, lines };
}
