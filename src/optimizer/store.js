// 队伍优化器的浏览器持久化：历史报告、未完成运行的检查点、逐 seed 样本缓存。
// 全部放 IndexedDB：扫描报告含逐 seed 样本和多套完整队伍，localStorage 的 5 MB 上限不够。
const DB_NAME = "mwi-optimizer";
const DB_VERSION = 2;
const HISTORY_LIMIT = 20;
// 样本按「配置 × seed」跨运行缓存：同一队伍再跑一轮时已测过的配置直接复用。每条约几百字节。
const SAMPLE_LIMIT = 60000;

let databasePromise = null;

function request(operation) {
    return new Promise((resolve, reject) => {
        operation.onsuccess = () => resolve(operation.result);
        operation.onerror = () => reject(operation.error);
    });
}

function database() {
    if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB 不可用"));
    databasePromise ??= new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = (event) => {
            const db = open.result;
            // reports: 完成、中止或失败的报告；runs: 仍需续跑的检查点；samples: 跨运行的逐 seed 样本缓存。
            if (event.oldVersion < 1) {
                db.createObjectStore("reports", { keyPath: "id" }).createIndex("finishedAt", "finishedAt");
                db.createObjectStore("runs", { keyPath: "id" });
            }
            // v1 的样本按运行 id 隔离，无法跨运行复用；直接换成按配置键缓存，旧的未完成运行会重新模拟。
            if (event.oldVersion >= 1 && event.oldVersion < 2) db.deleteObjectStore("samples");
            db.createObjectStore("samples").createIndex("at", "at");
        };
        open.onsuccess = () => {
            const db = open.result;
            // 其他标签页升级或删除数据库时主动让出连接，否则对方会一直阻塞；下次访问重新打开。
            db.onversionchange = () => {
                db.close();
                databasePromise = null;
            };
            resolve(db);
        };
        open.onerror = () => {
            databasePromise = null;
            reject(open.error);
        };
    });
    return databasePromise;
}

async function transaction(stores, mode, work) {
    const db = await database();
    const tx = db.transaction(stores, mode);
    const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
    const result = await work(tx);
    await done;
    return result;
}

// cyrb53 的两路独立种子拼成约 106 位摘要：非安全上下文（局域网 http）没有 crypto.subtle。
function cyrb53(text, seed) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function jobKey(value) {
    const text = JSON.stringify(value);
    return `${cyrb53(text, 1)}${cyrb53(text, 2)}`;
}

function sampleRange(key) {
    return IDBKeyRange.bound(`${key}|`, `${key}|\uffff`);
}

export function saveRun(run) {
    return transaction(["runs"], "readwrite", (tx) => request(tx.objectStore("runs").put(run)));
}

export function listRuns() {
    return transaction(["runs"], "readonly", (tx) => request(tx.objectStore("runs").getAll()));
}

// 运行结束（完成、中止或失败）时删除检查点，之后不会再被续跑；样本缓存保留给后续运行复用。
export function deleteRun(runId) {
    return transaction(["runs"], "readwrite", (tx) => request(tx.objectStore("runs").delete(runId)));
}

export function saveSample(key, seed, sample) {
    return transaction(["samples"], "readwrite", (tx) => request(tx.objectStore("samples").put({ sample, at: Date.now() }, `${key}|${seed}`)));
}

// 取某个配置键已缓存的全部 seed 样本。
export async function loadSamples(key) {
    return transaction(["samples"], "readonly", async (tx) => {
        const store = tx.objectStore("samples");
        const range = sampleRange(key);
        const [keys, values] = await Promise.all([request(store.getAllKeys(range)), request(store.getAll(range))]);
        return new Map(keys.map((storedKey, index) => [Number(storedKey.slice(key.length + 1)), values[index].sample]));
    });
}

// 超出上限时按写入时间淘汰最旧的样本。
export async function pruneSamples() {
    return transaction(["samples"], "readwrite", async (tx) => {
        const store = tx.objectStore("samples");
        const excess = (await request(store.count())) - SAMPLE_LIMIT;
        if (excess <= 0) return 0;
        const keys = await request(store.index("at").getAllKeys(null, excess));
        await Promise.all(keys.map((key) => request(store.delete(key))));
        return keys.length;
    });
}

export function clearSamples() {
    return transaction(["samples"], "readwrite", (tx) => request(tx.objectStore("samples").clear()));
}

// 只保留最近 HISTORY_LIMIT 份报告，旧的按完成时间淘汰。
export function saveReport(report) {
    return transaction(["reports"], "readwrite", async (tx) => {
        const store = tx.objectStore("reports");
        await request(store.put(report));
        const keys = await request(store.index("finishedAt").getAllKeys());
        for (const key of keys.slice(0, Math.max(0, keys.length - HISTORY_LIMIT))) await request(store.delete(key));
    });
}

export async function listReports() {
    const reports = await transaction(["reports"], "readonly", (tx) => request(tx.objectStore("reports").index("finishedAt").getAll()));
    return reports.reverse();
}

export function deleteReport(id) {
    return transaction(["reports"], "readwrite", (tx) => request(tx.objectStore("reports").delete(id)));
}

export function clearReports() {
    return transaction(["reports"], "readwrite", (tx) => request(tx.objectStore("reports").clear()));
}
