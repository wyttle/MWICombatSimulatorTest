// 队伍优化器的浏览器持久化：历史报告、未完成运行的检查点、逐 seed 样本缓存。
// 全部放 IndexedDB：扫描报告含逐 seed 样本和多套完整队伍，localStorage 的 5 MB 上限不够。
const DB_NAME = "mwi-optimizer";
const DB_VERSION = 1;
const HISTORY_LIMIT = 20;

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
        open.onupgradeneeded = () => {
            const db = open.result;
            // reports: 完成、中止或失败的报告；runs: 仍需续跑的检查点；samples: 检查点对应的已完成 seed。
            db.createObjectStore("reports", { keyPath: "id" }).createIndex("finishedAt", "finishedAt");
            db.createObjectStore("runs", { keyPath: "id" });
            db.createObjectStore("samples");
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

function sampleRange(runId) {
    return IDBKeyRange.bound(`${runId}|`, `${runId}|\uffff`);
}

export function saveRun(run) {
    return transaction(["runs"], "readwrite", (tx) => request(tx.objectStore("runs").put(run)));
}

export function listRuns() {
    return transaction(["runs"], "readonly", (tx) => request(tx.objectStore("runs").getAll()));
}

// 运行结束（完成、中止或失败）时一起删除检查点和样本缓存，之后不会再被续跑。
export function deleteRun(runId) {
    return transaction(["runs", "samples"], "readwrite", async (tx) => {
        await request(tx.objectStore("runs").delete(runId));
        await request(tx.objectStore("samples").delete(sampleRange(runId)));
    });
}

export function saveSample(runId, key, seed, sample) {
    return transaction(["samples"], "readwrite", (tx) => request(tx.objectStore("samples").put(sample, `${runId}|${key}|${seed}`)));
}

export async function loadSamples(runId) {
    return transaction(["samples"], "readonly", async (tx) => {
        const store = tx.objectStore("samples");
        const range = sampleRange(runId);
        const [keys, values] = await Promise.all([request(store.getAllKeys(range)), request(store.getAll(range))]);
        return new Map(keys.map((key, index) => [key.slice(runId.length + 1), values[index]]));
    });
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
