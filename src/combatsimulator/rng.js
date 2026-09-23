// 可注入随机源。
//
// 为什么需要：模拟器原本全部直接调用 Math.random()，两次运行之间没有任何可复现性，
// 想比较「改一个触发条件到底有没有提升」只能靠各跑各的、比平均值，方差大到几百次
// 地下城也看不出 1~2% 的差异。引入可播种随机源后，同一组 seed 可以对两套配置做配对
// 实验，把「运气」这一项从差值里消掉。
//
// 为什么分两条流：改触发条件会改变战斗内随机数的消费次数，单条流会让同一个 seed 的
// 两次运行在第一次分歧之后完全脱轨，配对就失去意义。把「刷怪」与「战斗」拆成两条独立
// 的流之后，至少保证两边遇到的怪物阵容序列完全一致，这是方差最大的一项。战斗内部仍
// 会漂移，这一点靠样本量解决，不假装能消除。
//
// 不传 seed 时两条流都退化为 Math.random()，主界面行为与改造前逐位一致。

// mulberry32：状态小、分布够用、实现短，适合在 Worker 里按 seed 快速构造。
function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 由主 seed 派生子流 seed，避免两条流之间出现相关性。
function deriveSeed(seed, salt) {
    let value = (seed ^ salt) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
    return (value ^ (value >>> 16)) >>> 0;
}

const SPAWN_SALT = 0x9e3779b9;
const COMBAT_SALT = 0x85ebca6b;

let spawnStream = null;
let combatStream = null;

/**
 * 设置本次模拟使用的随机种子。
 * @param {number|null|undefined} seed uint32 种子；传 null/undefined 恢复 Math.random。
 */
export function setSimulationSeed(seed) {
    if (seed === null || seed === undefined) {
        spawnStream = null;
        combatStream = null;
        return;
    }

    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new RangeError("模拟种子必须是 0 到 4294967295 之间的整数");
    }

    spawnStream = mulberry32(deriveSeed(seed, SPAWN_SALT));
    combatStream = mulberry32(deriveSeed(seed, COMBAT_SALT));
}

/** 当前是否处于可复现模式。 */
export function isSeeded() {
    return combatStream !== null;
}

/** 刷怪流：决定每一波遇到哪些怪物。 */
export function spawnRandom() {
    return spawnStream ? spawnStream() : Math.random();
}

/** 战斗流：命中、暴击、伤害区间、控制、触发类效果等。 */
export function combatRandom() {
    return combatStream ? combatStream() : Math.random();
}
