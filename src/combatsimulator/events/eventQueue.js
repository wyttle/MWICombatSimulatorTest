class MinHeap {
    constructor() {
        this._data = [];
    }

    get length() { return this._data.length; }

    push(item) {
        const data = this._data;
        data.push(item);
        let i = data.length - 1;
        const t = item.time;
        while (i > 0) {
            const pi = (i - 1) >> 1;
            if (data[pi].time <= t) break;
            data[i] = data[pi];
            i = pi;
        }
        data[i] = item;
    }

    pop() {
        const data = this._data;
        const len = data.length;
        if (len === 0) return undefined;
        const top = data[0];
        if (len === 1) { data.length = 0; return top; }
        const last = data.pop();
        const n = data.length;
        const t = last.time;
        let i = 0;
        const half = n >> 1;
        while (i < half) {
            let ci = (i << 1) + 1;
            let ct = data[ci].time;
            const ri = ci + 1;
            if (ri < n && data[ri].time < ct) { ci = ri; ct = data[ri].time; }
            if (t <= ct) break;
            data[i] = data[ci];
            i = ci;
        }
        data[i] = last;
        return top;
    }

    toArray() { return this._data; }
}

class EventQueue {
    constructor() {
        this.minHeap = new MinHeap();
        this.byType = new Map();
        this.bySource = new Map();
        this.byTarget = new Map();
        this.deleted = new WeakSet();
    }

    addEvent(event) {
        this.minHeap.push(event);

        if (event.type !== undefined) {
            let s = this.byType.get(event.type);
            if (!s) { s = new Set(); this.byType.set(event.type, s); }
            s.add(event);
        }
        if (event.source !== undefined) {
            let s = this.bySource.get(event.source);
            if (!s) { s = new Set(); this.bySource.set(event.source, s); }
            s.add(event);
        }
        if (event.target !== undefined) {
            let s = this.byTarget.get(event.target);
            if (!s) { s = new Set(); this.byTarget.set(event.target, s); }
            s.add(event);
        }
    }

    getNextEvent() {
        while (this.minHeap.length > 0) {
            const event = this.minHeap.pop();
            if (!this.deleted.has(event)) {
                this._removeFromIndexes(event);
                return event;
            }
        }
        return undefined;
    }

    _removeFromIndexes(event) {
        if (event.type !== undefined) {
            const s = this.byType.get(event.type);
            if (s) s.delete(event);
        }
        if (event.source !== undefined) {
            const s = this.bySource.get(event.source);
            if (s) s.delete(event);
        }
        if (event.target !== undefined) {
            const s = this.byTarget.get(event.target);
            if (s) s.delete(event);
        }
    }

    _markDeleted(event) {
        this.deleted.add(event);
        this._removeFromIndexes(event);
    }

    containsEventOfType(type) {
        const s = this.byType.get(type);
        return s != null && s.size > 0;
    }

    containsEventOfTypeAndHrid(type, hrid) {
        const s = this.byType.get(type);
        if (!s) return false;
        for (const event of s) {
            if (event.hrid === hrid) return true;
        }
        return false;
    }

    clear() {
        this.minHeap = new MinHeap();
        this.byType.clear();
        this.bySource.clear();
        this.byTarget.clear();
        this.deleted = new WeakSet();
    }

    clearEventsForUnit(unit) {
        const sourceEvents = this.bySource.get(unit);
        const targetEvents = this.byTarget.get(unit);
        if (sourceEvents) {
            for (const event of [...sourceEvents]) this._markDeleted(event);
        }
        if (targetEvents) {
            for (const event of [...targetEvents]) this._markDeleted(event);
        }
    }

    clearEventsOfType(type) {
        const s = this.byType.get(type);
        if (!s) return;
        for (const event of [...s]) this._markDeleted(event);
        this.byType.delete(type);
    }

    clearMatching(fn) {
        let cleared = false;
        const heapEvents = this.minHeap.toArray();
        for (const event of heapEvents) {
            if (this.deleted.has(event)) continue;
            if (fn(event)) { this._markDeleted(event); cleared = true; }
        }
        return cleared;
    }

    clearByTypeAndSource(type, source) {
        const s = this.byType.get(type);
        if (!s) return false;
        let cleared = false;
        for (const event of [...s]) {
            if (event.source === source) { this._markDeleted(event); cleared = true; }
        }
        return cleared;
    }

    clearByTypeAndTarget(type, target) {
        const s = this.byType.get(type);
        if (!s) return false;
        let cleared = false;
        for (const event of [...s]) {
            if (event.target === target) { this._markDeleted(event); cleared = true; }
        }
        return cleared;
    }

    getMatching(fn) {
        const heapEvents = this.minHeap.toArray();
        for (const event of heapEvents) {
            if (this.deleted.has(event)) continue;
            if (fn(event)) return event;
        }
        return null;
    }

    getByTypeAndSource(type, source) {
        const s = this.byType.get(type);
        if (!s) return null;
        for (const event of s) {
            if (event.source === source) return event;
        }
        return null;
    }

    getByTypeAndTarget(type, target) {
        const s = this.byType.get(type);
        if (!s) return null;
        for (const event of s) {
            if (event.target === target) return event;
        }
        return null;
    }

    hasEventOfTypeAndSource(type, source) {
        const s = this.byType.get(type);
        if (!s) return false;
        for (const event of s) {
            if (event.source === source) return true;
        }
        return false;
    }

    clearByTypeAndHrid(type, hrid) {
        const s = this.byType.get(type);
        if (!s) return false;
        let cleared = false;
        for (const event of [...s]) {
            if (event.hrid === hrid) { this._markDeleted(event); cleared = true; }
        }
        return cleared;
    }
}

export default EventQueue;
