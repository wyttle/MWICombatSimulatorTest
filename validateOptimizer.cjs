// 队伍优化器与可复现随机源的行为校验。
// 需要 Node.js 22.15+ 或 24（依赖 module.registerHooks 直接加载 ESM + JSON 源码）。
//
// 运行：node validateOptimizer.cjs [../team.txt]
// 传入真实队伍文件时，额外跑一次海盗基地 T1 的配对评估与阈值扫描。

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const module_ = require("node:module");

// webpack 里 JSON 直接 import；Node 需要把 .json 当成 ESM 默认导出。
module_.registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.endsWith(".json")) {
            return {
                url: new URL(specifier, context.parentURL).href,
                shortCircuit: true,
                format: "json",
                importAttributes: { type: "json" },
            };
        }
        if (specifier.startsWith(".") && !path.extname(specifier)) {
            return nextResolve(specifier + ".js", context);
        }
        return nextResolve(specifier, context);
    },
});

function summarize(simResult) {
    let damage = 0;
    for (const [sourceHrid, targets] of Object.entries(simResult.attacks || {})) {
        if (!sourceHrid.startsWith("player")) continue;
        for (const abilities of Object.values(targets)) {
            for (const stats of Object.values(abilities)) damage += stats.totalDamage;
        }
    }
    const seconds = simResult.simulatedTime / 1e9;
    return {
        dps: seconds > 0 ? damage / seconds : 0,
        completed: simResult.dungeonsCompleted,
        failed: simResult.dungeonsFailed,
        simulatedTime: simResult.simulatedTime,
    };
}

async function main() {
    const { setSimulationSeed, spawnRandom, combatRandom, isSeeded } = await import("./src/combatsimulator/rng.js");
    const { comparePaired, seedList } = await import("./src/optimizer/stats.js");

    // 1. 随机源：同 seed 可复现，不同 seed 不同，两条流互相独立，清空后回到 Math.random。
    setSimulationSeed(7);
    const firstSpawn = Array.from({ length: 8 }, () => spawnRandom());
    const firstCombat = Array.from({ length: 8 }, () => combatRandom());
    setSimulationSeed(7);
    assert.deepEqual(Array.from({ length: 8 }, () => spawnRandom()), firstSpawn, "同一 seed 的刷怪流必须可复现");
    // 先多消耗战斗流，再取刷怪流：两条流不得互相影响。
    setSimulationSeed(7);
    for (let i = 0; i < 100; i++) combatRandom();
    assert.deepEqual(Array.from({ length: 8 }, () => spawnRandom()), firstSpawn, "战斗流的消耗次数不得影响刷怪流");
    setSimulationSeed(8);
    assert.notDeepEqual(Array.from({ length: 8 }, () => spawnRandom()), firstSpawn, "不同 seed 必须给出不同序列");
    assert.notDeepEqual(firstSpawn, firstCombat, "两条流不得完全相同");
    assert.equal(isSeeded(), true);
    setSimulationSeed(null);
    assert.equal(isSeeded(), false, "清空 seed 后必须回到 Math.random");
    for (const bad of [-1, 1.5, 2 ** 32, "3"]) {
        assert.throws(() => setSimulationSeed(bad), RangeError, `非法 seed 必须抛错：${bad}`);
    }

    // 2. seed 列表：确定性、互不相同、合法 uint32。
    const seeds = seedList(20260922, 16);
    assert.equal(seeds.length, 16);
    assert.equal(new Set(seeds).size, 16, "seed 不得重复");
    assert.ok(seeds.every((s) => Number.isInteger(s) && s >= 0 && s <= 0xffffffff));
    assert.deepEqual(seedList(20260922, 16), seeds, "相同主 seed 必须派生相同列表");
    assert.notDeepEqual(seedList(20260923, 16), seeds);

    // 3. 配对统计：自比为零、区间对称、seed 必须配得上、真实差异可识别。
    const base = seeds.slice(0, 6).map((seed, i) => ({ seed, dps: 1000 + i, completed: 10, failed: 0, deaths: 0, simulatedTime: 3.6e12 }));
    const same = comparePaired(base, base.map((r) => ({ ...r })));
    assert.equal(same.deltaDps, 0);
    assert.equal(same.status, "inconclusive", "完全相同的两组样本不得判定为有提升");
    const better = comparePaired(base, base.map((r) => ({ ...r, dps: r.dps * 1.1 })));
    assert.ok(better.deltaDps > 0 && better.status === "better", "一致的 10% 提升必须被识别");
    assert.ok(better.ciLow > 0, "置信区间下界必须大于零");
    const worse = comparePaired(base, base.map((r) => ({ ...r, dps: r.dps * 0.9 })));
    assert.equal(worse.status, "worse");
    assert.throws(() => comparePaired(base, base.map((r) => ({ ...r, seed: r.seed + 1 }))), /seed/i, "seed 不匹配必须抛错");
    const zeroBase = base.map((r) => ({ ...r, dps: 0 }));
    assert.equal(comparePaired(zeroBase, zeroBase).deltaPercent, null, "基线为零时百分比必须是未知而不是 0 或 Infinity");
    const single = comparePaired(base.slice(0, 1), base.slice(0, 1));
    assert.equal(single.ciLow, null, "单样本不得给出置信区间");
    assert.equal(single.status, "inconclusive");

    // 4. 死亡与团灭：失败样本必须进入统计而不是被丢弃。
    const risky = base.map((r, i) => ({ ...r, dps: r.dps * 1.2, failed: i < 3 ? 4 : 0, completed: i < 3 ? 6 : 10, deaths: 2 }));
    const risk = comparePaired(base, risky);
    assert.ok(risk.wipeRateDelta > 0, "团灭率上升必须被报告");
    assert.ok(risk.deathsPerHourDelta > 0, "死亡数上升必须被报告");
    assert.ok(risk.clearsPerHourDelta < 0, "通关数下降必须被报告");

    // 5. 成本：缺价必须是未知而不是免费，卖出按 5% 扣税。
    const { priceItem, priceChanges, SALE_TAX } = await import("./src/optimizer/cost.js");
    assert.equal(SALE_TAX, 0.05);
    const marketData = { "/items/holy_sword": { 0: { a: 1000, b: 900 }, 3: { a: 8000, b: 7000 } } };
    const ctx = { marketData, prices: { "/items/holy_sword": { ask: 1000, bid: 900, vendor: 10 } } };
    assert.equal(priceItem(marketData, "/items/holy_sword", 3, { ...ctx, side: "ask" }).price, 8000, "必须按强化等级取价");
    assert.equal(priceItem(marketData, "/items/unknown_item", 0, { ...ctx, side: "ask" }).price, null, "缺价必须返回 null");
    assert.equal(priceItem(marketData, "/items/holy_sword", 9, { ...ctx, side: "ask" }).estimated, true, "回落价必须标记为估值");

    // 6. 阈值扫描：原始配置必须始终是候选，预算耗尽必须如实标记。
    const { scanThresholds, estimateScanBudget } = await import("./src/optimizer/search.js");
    const { parseTeamStates, cloneTeamState, getTriggers } = await import("./src/optimizer/teamState.js");

    // 6a. 由粗到细：用已知峰值的合成目标函数验证收敛、网格对齐与预算。
    const syntheticTeam = (values) => ({
        players: values.map((value, index) => ({
            id: String(index + 1),
            state: { triggerMap: { "/abilities/test": [{ conditionHrid: "/c", comparatorHrid: "/combat_trigger_comparators/greater_than_equal", value }] } },
        })),
    });
    // 把单配置评估函数包装成批量接口；reverse 时倒序完成，模拟并行线程乱序返回。
    const batchOf = (evaluateOne, { reverse = false } = {}) => async (states, onResult) => {
        const results = new Array(states.length);
        const order = states.map((_, index) => index);
        if (reverse) order.reverse();
        for (const index of order) {
            results[index] = await evaluateOne(states[index]);
            onResult?.(index, results[index]);
        }
        return results;
    };
    const syntheticScan = async (peaks, { min, max, step, budget }, options) => {
        const scanSeeds = [1, 2, 3, 4];
        return scanThresholds({
            teamState: syntheticTeam(peaks.map(() => min)),
            variables: peaks.map((_, index) => ({ playerId: String(index + 1), abilityHrid: "/abilities/test", triggerIndex: 0, min, max, step })),
            evaluateBatch: batchOf(async (state) => {
                const values = state.players.map((player) => player.state.triggerMap["/abilities/test"][0].value);
                const distance = values.reduce((sum, value, index) => sum + Math.abs(value - peaks[index]), 0);
                return scanSeeds.map((seed) => ({ seed, dps: 1000 - distance / 100, completed: 1, failed: 0, deaths: 0, simulatedTime: 3.6e12, consumablesUsed: {} }));
            }, options),
            seeds: scanSeeds,
            maxEvaluations: budget,
        });
    };

    // 200 个网格点的区间：逐级收窄必须用远少于全枚举的评估次数命中精确峰值。
    const fine = await syntheticScan([7350], { min: 0, max: 10000, step: 50, budget: 500 });
    assert.deepEqual(fine.bestValues, [7350], "由粗到细必须收敛到精确峰值");
    assert.ok(fine.evaluations < 40, `全枚举需 200 次，逐级收窄应远少于此，实际 ${fine.evaluations}`);
    assert.ok(fine.curve.map((entry) => entry.step).every((step) => step >= 50), "任何一级都不得比用户步长更细");

    // 多阈值共享预算：全部命中峰值，且每个值都对齐到用户网格。
    const many = await syntheticScan([3200, 3400, 3600, 3800, 4000], { min: 3000, max: 6000, step: 200, budget: 500 });
    assert.deepEqual(many.bestValues, [3200, 3400, 3600, 3800, 4000], "多个阈值必须各自收敛");
    assert.ok(many.bestValues.every((value) => (value - 3000) % 200 === 0), "最优值必须对齐用户步长");
    assert.equal(many.truncated, false);

    // 预算不足：必须如实标记截断，且粗级先跑完，让每个阈值都被探过而不是前几个吃光预算。
    const tight = await syntheticScan([3200, 3400, 3600, 3800, 4000, 4200, 4400, 4600, 4800, 5000], { min: 3000, max: 6000, step: 200, budget: 40 });
    assert.equal(tight.truncated, true, "预算耗尽必须如实标记");
    assert.ok(tight.evaluations <= 40, "扫描不得超出评估预算");
    assert.ok(new Set(tight.curve.map((entry) => `${entry.playerId}`)).size >= 5, "预算不足时也要覆盖到多个阈值，而不是耗在前几个上");

    // 并行乱序完成不得改变搜索结果：历史顺序、曲线和最优值必须与顺序完成一致。
    for (const budget of [40, 500]) {
        const peaks = [3200, 3600, 4400, 5000];
        const inOrder = await syntheticScan(peaks, { min: 3000, max: 6000, step: 200, budget });
        const shuffled = await syntheticScan(peaks, { min: 3000, max: 6000, step: 200, budget }, { reverse: true });
        assert.deepEqual(shuffled.history.map((entry) => entry.values), inOrder.history.map((entry) => entry.values), "乱序完成不得改变评估记录顺序");
        assert.deepEqual(shuffled.curve.map((entry) => [entry.id, entry.accepted]), inOrder.curve.map((entry) => [entry.id, entry.accepted]), "乱序完成不得改变曲线与接受顺序");
        assert.deepEqual(shuffled.bestValues, inOrder.bestValues);
        assert.equal(shuffled.stopReason, inOrder.stopReason);
    }

    // 6b. 预算估算：界面用它替用户填「最大评估次数」，必须真的够跑完，否则提示会骗人。
    const budgetCases = [
        { peaks: [4400], min: 3000, max: 6000, step: 200 },
        { peaks: [4400, 5200], min: 3000, max: 6000, step: 200 },
        { peaks: [3200, 3400, 3600, 3800, 4000, 4200, 4400, 4600, 4800, 5000], min: 3000, max: 6000, step: 200 },
        { peaks: [7350], min: 0, max: 10000, step: 50 },
        { peaks: [3], min: 0, max: 5, step: 1 },
        { peaks: [70], min: 0, max: 100, step: 10 },
    ];
    for (const { peaks, min, max, step } of budgetCases) {
        const variables = peaks.map((_, index) => ({ playerId: String(index + 1), abilityHrid: "/abilities/test", triggerIndex: 0, min, max, step }));
        const budget = estimateScanBudget(variables);
        const run = await syntheticScan(peaks, { min, max, step, budget });
        assert.equal(run.truncated, false, `估算的预算 ${budget} 必须够跑完 ${peaks.length} 个阈值 ${min}-${max}/${step}`);
        assert.deepEqual(run.bestValues, peaks, "在估算预算内必须收敛到峰值");
        assert.ok(budget >= run.evaluations, `估算 ${budget} 不得低于实际评估数 ${run.evaluations}`);
    }
    assert.equal(estimateScanBudget([]), 0, "没有勾选阈值时不给建议");
    assert.equal(estimateScanBudget([{ min: 0, max: 100, step: 0 }]), 0, "非法步长不给建议");
    assert.equal(estimateScanBudget([{ min: 100, max: 0, step: 10 }]), 0, "区间颠倒不给建议");
    assert.equal(estimateScanBudget([{ min: 0, max: NaN, step: 10 }]), 0, "区间未填完不给建议");

    // 较低的粗网格峰细化后更高：不能在第一次粗扫后丢掉第二个峰区。
    const peakSeeds = [11, 22, 33, 44];
    const peakVariable = { playerId: "1", abilityHrid: "/abilities/test", triggerIndex: 0, min: 0, max: 10000, step: 100 };
    const observedConfigs = new Set();
    const multiPeak = await scanThresholds({
        teamState: syntheticTeam([0]), variables: [peakVariable], seeds: peakSeeds,
        maxEvaluations: 200,
        evaluateBatch: batchOf(async (state) => {
            const value = state.players[0].state.triggerMap[peakVariable.abilityHrid][0].value;
            assert.ok(!observedConfigs.has(value), "同一完整配置不得重复模拟");
            observedConfigs.add(value);
            const dps = 100 + Math.max(10 - Math.abs(value - 1600) / 1000, 12 - Math.abs(value - 7300) / 200);
            return peakSeeds.map((seed) => ({ seed, dps, completed: 1, failed: 0, deaths: 0, simulatedTime: 3.6e12 }));
        }),
    });
    assert.deepEqual(multiPeak.bestValues, [7300], "必须保留并细化较低的粗网格峰");
    assert.equal(multiPeak.history.length, observedConfigs.size, "每次新评估均可追溯");
    assert.equal(new Set(multiPeak.alternatives.map((entry) => JSON.stringify(entry.values))).size, multiPeak.alternatives.length);
    for (const point of many.curve) {
        if (!point.contextId) continue;
        const context = many.contexts.find((entry) => entry.id === point.contextId);
        assert.ok(context, "曲线必须指向固定其他坐标的对比组");
        for (let index = 0; index < point.values.length; index++) {
            if (index !== context.variableIndex) assert.equal(point.values[index], context.values[index], "不得混画不同配置背景");
        }
    }

    // 6c. 贝叶斯优化：单独改任一阈值都变差、一起改才变好时，必须找到联动组合；坐标搜索在此必然失败。
    const { optimizeThresholds, batchSizeFor } = await import("./src/optimizer/bayes.js");
    const jointSeeds = [5, 6, 7, 8];
    const jointVariables = [0, 1, 2].map((index) => ({ playerId: String(index + 1), abilityHrid: "/abilities/test", triggerIndex: 0, min: 0, max: 10000, step: 100 }));
    const jointDps = ([a, b, c]) => {
        const inA = a >= 3000 && a <= 6000;
        const inB = b >= 3000 && b <= 6000;
        return 100 + (inA && inB ? 6 : 0) - (inA !== inB ? 1 : 0) + Math.exp(-(((c - 7000) / 2000) ** 2));
    };
    const jointRun = async ({ reverse = false, batchSize = 4 } = {}) => {
        const seen = new Set();
        const batches = [];
        const evaluate = batchOf(async (state) => {
            const values = state.players.map((player) => player.state.triggerMap["/abilities/test"][0].value);
            const key = JSON.stringify(values);
            assert.ok(!seen.has(key), "同一完整配置不得重复模拟");
            seen.add(key);
            assert.ok(values.every((value) => value % 100 === 0 && value >= 0 && value <= 10000), `候选必须落在用户网格上：${key}`);
            // seed 间有共同噪声，配对差值里被抵消，模拟真实数据的结构。
            return jointSeeds.map((seed) => ({ seed, dps: jointDps(values) + (seed % 3) * 2, completed: 1, failed: 0, deaths: 0, simulatedTime: 3.6e12 }));
        }, { reverse });
        const result = await optimizeThresholds({
            teamState: syntheticTeam([0, 0, 0]), variables: jointVariables, seeds: jointSeeds, maxEvaluations: 60, batchSize,
            evaluateBatch: (states, onResult) => {
                batches.push(states.length);
                return evaluate(states, onResult);
            },
        });
        return { result, batches, simulated: seen.size };
    };
    const joint = await jointRun();
    assert.ok(jointDps(joint.result.bestValues) - jointDps([0, 0, 0]) > 5, `必须找到联动区，实际 ${joint.result.bestValues}`);
    assert.deepEqual(joint.result.history[0].values, [0, 0, 0], "第一条记录必须是原始配置");
    assert.ok(joint.result.evaluations <= 60 && joint.simulated === joint.result.evaluations, "不得超出预算，每次评估都要可追溯");
    // 基线和初始设计不依赖模型，整批提交；之后按模型选点，每批不得超过 batchSize。
    assert.ok(joint.batches.length > 3 && joint.batches.slice(2).every((size) => size <= 4), `每批配置数不得超过 batchSize：${joint.batches}`);
    assert.ok(joint.result.modelSlices.every((slice) => slice.points.every((point) => Number.isFinite(point.mean) && point.sd >= 0)), "模型切片必须是有限值");
    const jointCoordinate = await scanThresholds({
        teamState: syntheticTeam([0, 0, 0]), variables: jointVariables, seeds: jointSeeds, maxEvaluations: 60,
        evaluateBatch: batchOf(async (state) => {
            const values = state.players.map((player) => player.state.triggerMap["/abilities/test"][0].value);
            return jointSeeds.map((seed) => ({ seed, dps: jointDps(values), completed: 1, failed: 0, deaths: 0, simulatedTime: 3.6e12 }));
        }),
    });
    assert.ok(jointDps(jointCoordinate.bestValues) - jointDps([0, 0, 0]) < 5, "对照：坐标搜索找不到联动区，否则这个用例测不出区别");
    // 续跑靠重放：乱序完成必须走出完全相同的路径。
    const jointShuffled = await jointRun({ reverse: true });
    assert.deepEqual(jointShuffled.result.history.map((entry) => entry.values), joint.result.history.map((entry) => entry.values), "乱序完成不得改变贝叶斯优化的选点");
    assert.deepEqual(jointShuffled.result.bestValues, joint.result.bestValues);
    assert.equal(batchSizeFor(15, 16), 6, "15 线程 × 16 seed 时一批 6 个配置，线程利用率才能过 90%");
    assert.equal(batchSizeFor(16, 16), 1);
    const teamFile = process.argv[2];
    if (!teamFile) {
        console.log("随机源、统计、成本校验通过（未提供队伍文件，跳过端到端评估）。");
        return;
    }

    const raw = fs.readFileSync(path.resolve(teamFile), "utf8");
    const parsed = JSON.parse(raw);
    const group = parsed.players ?? parsed;
    const ids = Object.keys(group).filter((id) => /^[1-5]$/.test(id));
    const teamState = parseTeamStates(group, ids);
    assert.ok(teamState.players.length >= 1);

    // 往返：解析 → 回写 → 再解析，不得丢字段。
    const { teamStateToPlayerDataMap } = await import("./src/optimizer/teamState.js");
    const roundTrip = parseTeamStates(teamStateToPlayerDataMap(teamState), ids);
    assert.deepEqual(roundTrip.players.map((p) => p.state), teamState.players.map((p) => p.state), "队伍状态往返不得丢字段");

    // 真实模拟：同 seed 必须逐位可复现，改 seed 必须给出不同结果。
    const { default: CombatSimulator } = await import("./src/combatsimulator/combatSimulator.js");
    const { default: Player } = await import("./src/combatsimulator/player.js");
    const { default: Zone } = await import("./src/combatsimulator/zone.js");
    const { teamStateToDTOs } = await import("./src/optimizer/teamState.js");

    const runOnce = async (state, seed) => {
        setSimulationSeed(seed);
        const zone = new Zone("/actions/combat/pirate_cove", 1);
        const players = teamStateToDTOs(state).map((dto) => {
            const p = Player.createFromDTO(structuredClone(dto));
            p.zoneBuffs = zone.buffs;
            p.extraBuffs = [];
            return p;
        });
        const simulator = new CombatSimulator(players, zone, null, { enableHpMpVisualization: false });
        return summarize(await simulator.simulateDungeonByCount(2));
    };

    const a1 = await runOnce(teamState, 101);
    const a2 = await runOnce(teamState, 101);
    assert.deepEqual(a2, a1, "同一 seed 的地下城模拟必须逐位可复现");
    const b1 = await runOnce(teamState, 202);
    assert.notDeepEqual(b1, a1, "不同 seed 必须产生不同的战斗结果");
    assert.equal(a1.completed + a1.failed, 2, "成功与团灭都要计入指定次数");

    // 阈值扫描：用真实队伍的第一个数值触发条件跑一轮，预算必须被遵守。
    const target = teamState.players.flatMap((p) =>
        Object.entries(p.state.triggerMap || {})
            .filter(([hrid]) => hrid.startsWith("/abilities/"))
            .flatMap(([hrid, triggers]) =>
                (triggers || []).map((trigger, triggerIndex) => ({ playerId: p.id, abilityHrid: hrid, triggerIndex, trigger }))
            )
    ).find((entry) => entry.trigger?.comparatorHrid?.endsWith("greater_than_equal") && Number.isFinite(entry.trigger.value) && entry.trigger.value > 0);
    assert.ok(target, "队伍里需要至少一个数值触发条件");

    const evaluate = async (state) => {
        const runs = [];
        for (const seed of [11, 12]) runs.push({ seed, ...(await runOnce(state, seed)), deaths: 0 });
        return runs;
    };
    const base0 = target.trigger.value;
    const scan = await scanThresholds({
        teamState: cloneTeamState(teamState),
        variables: [{ playerId: target.playerId, abilityHrid: target.abilityHrid, triggerIndex: target.triggerIndex, min: Math.max(0, base0 - 400), max: base0 + 400, step: 400 }],
        evaluateBatch: batchOf(evaluate),
        maxEvaluations: 4,
        seeds: [11, 12],
    });
    assert.ok(scan.evaluations <= 4, "扫描不得超出评估预算");
    assert.ok(scan.curve.length > 0, "扫描必须留下完整曲线");
    const bestValue = getTriggers(scan.bestTeamState.players.find((p) => p.id === target.playerId).state, target.abilityHrid)[target.triggerIndex].value;
    assert.ok(Number.isFinite(bestValue), "扫描结果必须给出合法阈值");
    console.log("Pirate Cove T1 扫描：", JSON.stringify({ evaluations: scan.evaluations, truncated: scan.truncated, bestValue, baseValue: base0 }));
    console.log("队伍优化器行为校验通过。");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
