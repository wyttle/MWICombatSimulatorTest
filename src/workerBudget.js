// 模拟线程的内存预算。
//
// 单个线程跑一轮地下城模拟时，堆峰值实测在 160-175 MB（2000 场 163 MB、10000 场 175 MB），
// 而其中真正存活的数据只有 11-14 MB：剩下全是 V8 还没回收的垃圾。
// 给 Node 加 --max-old-space-size=64 后同样能跑完，峰值降到 76 MB 且耗时几乎不变，
// 说明这是 V8「有多少用多少」的回收策略，不是泄漏。浏览器里没有对应的 worker 堆上限开关。
//
// 后果是并行线程数直接等比放大内存占用：按 CPU 核数开满，16 核机器会开 15 个线程、
// 光模拟就要 3 GB，地下城场次越多线程存活越久，最终整个页面 OOM 崩溃。
// 所以并发上限除了 CPU，还要过一道内存预算。
export const WORKER_PEAK_MB = 200;
export const WORKER_MEMORY_BUDGET_MB = 1600;

// 在 CPU 给出的上限之上再压一道内存上限。
export function maxParallelWorkers(cpuLimit) {
    const memoryCap = Math.max(1, Math.floor(WORKER_MEMORY_BUDGET_MB / WORKER_PEAK_MB));
    return Math.max(1, Math.min(cpuLimit, memoryCap));
}
