import Heap from "heap-js";

/**
 * Optimized EventQueue with O(1) lookups by type and source
 * Uses auxiliary indexes to avoid O(n) scans on clearMatching/getMatching
 */
class EventQueue {
    constructor() {
        this.minHeap = new Heap((a, b) => a.time - b.time);
        // Index: type -> Set of events
        this.byType = new Map();
        // Index: source -> Set of events
        this.bySource = new Map();
        // Index: target -> Set of events
        this.byTarget = new Map();
        // Track deleted events (lazy deletion)
        this.deleted = new WeakSet();
    }

    addEvent(event) {
        this.minHeap.push(event);

        // Index by type
        if (event.type !== undefined) {
            if (!this.byType.has(event.type)) {
                this.byType.set(event.type, new Set());
            }
            this.byType.get(event.type).add(event);
        }

        // Index by source
        if (event.source !== undefined) {
            if (!this.bySource.has(event.source)) {
                this.bySource.set(event.source, new Set());
            }
            this.bySource.get(event.source).add(event);
        }

        // Index by target
        if (event.target !== undefined) {
            if (!this.byTarget.has(event.target)) {
                this.byTarget.set(event.target, new Set());
            }
            this.byTarget.get(event.target).add(event);
        }
    }

    getNextEvent() {
        // Skip deleted events (lazy deletion)
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
            const typeSet = this.byType.get(event.type);
            if (typeSet) {
                typeSet.delete(event);
            }
        }
        if (event.source !== undefined) {
            const sourceSet = this.bySource.get(event.source);
            if (sourceSet) {
                sourceSet.delete(event);
            }
        }
        if (event.target !== undefined) {
            const targetSet = this.byTarget.get(event.target);
            if (targetSet) {
                targetSet.delete(event);
            }
        }
    }

    _markDeleted(event) {
        this.deleted.add(event);
        this._removeFromIndexes(event);
    }

    containsEventOfType(type) {
        const typeSet = this.byType.get(type);
        return typeSet && typeSet.size > 0;
    }

    containsEventOfTypeAndHrid(type, hrid) {
        const typeSet = this.byType.get(type);
        if (!typeSet) return false;

        for (const event of typeSet) {
            if (event.hrid === hrid) {
                return true;
            }
        }
        return false;
    }

    clear() {
        this.minHeap = new Heap((a, b) => a.time - b.time);
        this.byType.clear();
        this.bySource.clear();
        this.byTarget.clear();
        this.deleted = new WeakSet();
    }

    clearEventsForUnit(unit) {
        // Get events where unit is source or target
        // Copy to array first to avoid modifying Set during iteration
        const sourceEvents = this.bySource.get(unit);
        const targetEvents = this.byTarget.get(unit);

        if (sourceEvents) {
            const eventsToDelete = [...sourceEvents];
            for (const event of eventsToDelete) {
                this._markDeleted(event);
            }
        }
        if (targetEvents) {
            const eventsToDelete = [...targetEvents];
            for (const event of eventsToDelete) {
                this._markDeleted(event);
            }
        }
    }

    clearEventsOfType(type) {
        const typeSet = this.byType.get(type);
        if (!typeSet) return;

        // Copy to array first to avoid modifying Set during iteration
        const eventsToDelete = [...typeSet];
        for (const event of eventsToDelete) {
            this._markDeleted(event);
        }
        this.byType.delete(type);
    }

    // Optimized clearMatching - tries to use indexes when possible
    clearMatching(fn) {
        let cleared = false;

        // We still need to iterate, but use lazy deletion
        const heapEvents = this.minHeap.toArray();

        for (const event of heapEvents) {
            if (this.deleted.has(event)) continue;
            if (fn(event)) {
                this._markDeleted(event);
                cleared = true;
            }
        }
        return cleared;
    }

    // Optimized: clear by type and source (common pattern)
    clearByTypeAndSource(type, source) {
        const typeSet = this.byType.get(type);
        if (!typeSet) return false;

        let cleared = false;
        // Copy to array first to avoid modifying Set during iteration
        const eventsToCheck = [...typeSet];
        for (const event of eventsToCheck) {
            if (event.source === source) {
                this._markDeleted(event);
                cleared = true;
            }
        }
        return cleared;
    }

    // Optimized: clear by type and target (common pattern)
    clearByTypeAndTarget(type, target) {
        const typeSet = this.byType.get(type);
        if (!typeSet) return false;

        let cleared = false;
        // Copy to array first to avoid modifying Set during iteration
        const eventsToCheck = [...typeSet];
        for (const event of eventsToCheck) {
            if (event.target === target) {
                this._markDeleted(event);
                cleared = true;
            }
        }
        return cleared;
    }

    // Optimized getMatching - tries to use indexes when possible
    getMatching(fn) {
        const heapEvents = this.minHeap.toArray();

        for (const event of heapEvents) {
            if (this.deleted.has(event)) continue;
            if (fn(event)) {
                return event;
            }
        }
        return null;
    }

    // Optimized: get by type and source (common pattern)
    getByTypeAndSource(type, source) {
        const typeSet = this.byType.get(type);
        if (!typeSet) return null;

        for (const event of typeSet) {
            if (event.source === source) {
                return event;
            }
        }
        return null;
    }

    // Optimized: get by type and target
    getByTypeAndTarget(type, target) {
        const typeSet = this.byType.get(type);
        if (!typeSet) return null;

        for (const event of typeSet) {
            if (event.target === target) {
                return event;
            }
        }
        return null;
    }

    // Check if any event matches type and source exists
    hasEventOfTypeAndSource(type, source) {
        const typeSet = this.byType.get(type);
        if (!typeSet) return false;

        for (const event of typeSet) {
            if (event.source === source) {
                return true;
            }
        }
        return false;
    }

    // Optimized: clear by type and hrid (for PlayerRespawnEvent)
    clearByTypeAndHrid(type, hrid) {
        const typeSet = this.byType.get(type);
        if (!typeSet) return false;

        let cleared = false;
        // Copy to array first to avoid modifying Set during iteration
        const eventsToCheck = [...typeSet];
        for (const event of eventsToCheck) {
            if (event.hrid === hrid) {
                this._markDeleted(event);
                cleared = true;
            }
        }
        return cleared;
    }
}

export default EventQueue;
