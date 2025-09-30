// deno-lint-ignore-file no-explicit-any
import {
  type CollectionName,
  type DataStore,
  type DocId,
  InMemoryDataStore,
} from "@/services/data-store.ts";
import { type Response, Status } from "@/types/operations.ts";
import type { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import type {
  Condition,
  QueryOperatorsWithNot,
  Table,
  WhereQuery,
} from "@/types/collection-manager.ts";
import Logger from "../utils/logger.ts";
import { MemoryManager, type MemoryConfig } from "@/services/memory-manager.ts";

const MAX_ALLOCATED_ENTRIES = 6_000_000;

class Mutex {
  private mutex: Promise<unknown> = Promise.resolve();

  // deno-lint-ignore require-await
  async lock<T>(fn: () => Promise<T>): Promise<T> {
    // queue fn onto the previous promise
    let resolveFn: (value: T | PromiseLike<T>) => void;
    let rejectFn: (reason?: unknown) => void;

    const run = new Promise<T>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    this.mutex = this.mutex.then(() => fn().then(resolveFn!, rejectFn!));

    return run;
  }
}

interface MapState<V extends Uint8Array> {
  map: InMemoryDataStore<V>;
  size: number;
}

export default class MapManager<V extends Uint8Array> implements DataStore<V> {
  private maps: Map<number, MapState<V>> = new Map();
  private currentMapIndex = 0;
  public readonly memoryManager: MemoryManager;
  private activeTransactions: Set<string> = new Set();
  private emergencyBrakeCount = 0;
  private lastEvictionTime = 0;

  private readonly mapMutex = new Mutex();

  constructor(
    readonly catalog: InMemoryCollectionsCatalog,
    memoryConfig?: MemoryConfig
  ) {
    this.maps.set(this.currentMapIndex, {
      map: new InMemoryDataStore(catalog),
      size: 0,
    });

    this.memoryManager = new MemoryManager(memoryConfig);
    this.setupMemoryCallbacks();
  }

  private setupMemoryCallbacks(): void {
    // Setup eviction callback
    this.memoryManager.onEviction(() => {
      this.performLRUEviction();
    });

    // Setup emergency callback to cancel active transactions
    this.memoryManager.onEmergency(() => {
      this.cancelActiveTransactions();
    });
  }

  private performLRUEviction(): void {
    const now = Date.now();

    // Emergency brake: prevent infinite eviction loops
    if (now - this.lastEvictionTime < 1000) {
      // Less than 1 second since last eviction
      this.emergencyBrakeCount++;
      if (this.emergencyBrakeCount > 3) {
        // Reduced from 5 to 3 for faster response
        Logger.error(
          "[MapManager] Emergency brake activated - stopping eviction attempts"
        );
        this.memoryManager.stopMonitoring();
        return;
      }
    } else {
      this.emergencyBrakeCount = 0; // Reset counter if enough time has passed
    }

    this.lastEvictionTime = now;

    const stats = this.memoryManager.getMemoryStats();
    const targetBytes = Math.floor(stats.rss * 0.2); // Evict 20% of current RSS

    const keysToEvict = this.memoryManager.getLRUKeysToEvict(targetBytes);

    Logger.warning(
      `[MapManager] Performing LRU eviction of ${keysToEvict.length} keys`
    );

    if (keysToEvict.length === 0) {
      Logger.warning(
        "[MapManager] No LRU keys available for eviction - memory may be from external sources"
      );

      // If we have no LRU keys and memory is still over limit, stop monitoring
      if (stats.isOverLimit) {
        Logger.error(
          "[MapManager] No LRU keys available and memory still over limit - stopping monitoring"
        );
        this.memoryManager.stopMonitoring();
        return;
      }

      // Force garbage collection as last resort
      if (typeof (globalThis as any).gc === "function") {
        (globalThis as any).gc();
        Logger.info("[MapManager] Forced garbage collection");
      }
      return;
    }

    let evictedCount = 0;
    for (const key of keysToEvict) {
      const [collectionName, docId] = this.parseLRUKey(key);
      if (collectionName && docId !== null) {
        const deleteResult = this.delete(collectionName, docId);
        if (deleteResult.status === Status.OK) {
          this.memoryManager.removeFromLRU(key);
          evictedCount++;
        }
      }
    }

    Logger.info(`[MapManager] Successfully evicted ${evictedCount} items`);
  }

  private cancelActiveTransactions(): void {
    Logger.error(
      `[MapManager] Cancelling ${this.activeTransactions.size} active transactions due to memory limit`
    );
    this.activeTransactions.clear();
  }

  private parseLRUKey(key: string): [string | null, number | null] {
    const parts = key.split(":");
    if (parts.length !== 2) return [null, null];

    const docId = parseInt(parts[1], 10);
    return [parts[0], isNaN(docId) ? null : docId];
  }

  private createLRUKey(collectionName: string, docId: number): string {
    return `${collectionName}:${docId}`;
  }

  private getCurrentMap(): Promise<MapState<V>> {
    // deno-lint-ignore require-await
    return this.mapMutex.lock(async () => {
      const currentMap = this.maps.get(this.currentMapIndex)!;

      if (currentMap.size >= MAX_ALLOCATED_ENTRIES) {
        this.currentMapIndex++;
        const map = new InMemoryDataStore<V>(this.catalog);

        this.catalog
          .getAll()
          .data?.keys()
          .forEach((c) => {
            map.ensureState(c, {
              nextId: currentMap.map.size(c).data! + 1,
              size: currentMap.map.size(c).data!,
            });
          });

        this.maps.set(this.currentMapIndex, { map, size: 0 });
      }

      return this.maps.get(this.currentMapIndex)!;
    });
  }

  private findIdInMap(name: CollectionName, docId: DocId): MapState<V> | null {
    for (const [, m] of this.maps) {
      if (m.map.get(name, docId).status === Status.OK) {
        return m;
      }
    }
    return null;
  }

  get(name: CollectionName, docId: DocId): Response<{ id: DocId; doc: V }> {
    const res = this.findIdInMap(name, docId);
    if (!res) return { status: Status.ERROR };

    const result = res.map.get(name, docId);

    // Track access for LRU
    if (result.status === Status.OK && result.data) {
      const lruKey = this.createLRUKey(name, docId);
      const size = this.memoryManager.estimateDataSize(result.data.doc);
      this.memoryManager.trackAccess(lruKey, size);
    }

    return result;
  }

  async set(name: CollectionName, doc: V): Promise<Response<{ id: DocId }>> {
    const currentMap = await this.getCurrentMap();

    currentMap.size++;
    const result = await currentMap.map.set(name, doc);

    // Track for LRU if successful
    if (result.status === Status.OK && result.data) {
      const lruKey = this.createLRUKey(name, result.data.id);
      const size = this.memoryManager.estimateDataSize(doc);
      this.memoryManager.trackAccess(lruKey, size);
    }

    return result;
  }

  update(
    name: CollectionName,
    docId: DocId,
    doc: V
  ): Response<{ id: DocId; doc: V }> {
    const res = this.findIdInMap(name, docId);
    if (!res) return { status: Status.ERROR };

    return res.map.update(name, docId, doc);
  }

  delete(name: CollectionName, docId: DocId): Response<{ id: DocId }> {
    const res = this.findIdInMap(name, docId);
    if (!res) return { status: Status.ERROR };

    res.size--;
    const result = res.map.delete(name, docId);

    // Remove from LRU cache if successful
    if (result.status === Status.OK) {
      const lruKey = this.createLRUKey(name, docId);
      this.memoryManager.removeFromLRU(lruKey);
    }

    return result;
  }

  size(): number {
    return Array.from(this.maps.values())
      .map((m) => m.size)
      .reduce((sum, s) => sum + s, 0);
  }

  mapsCount(): number {
    return this.maps.size;
  }

  getMany(name: CollectionName, docIds: DocId[]): Response<Map<DocId, V>> {
    const results = new Map<DocId, V>();

    for (const id of docIds) {
      const res = this.get(name, id);
      if (res.status === Status.OK && res.data) {
        results.set(id, res.data.doc);
      }
    }

    return { status: Status.OK, data: results };
  }

  async setMany(
    name: CollectionName,
    docs: V[],
    isChunked: boolean = false
  ): Promise<Response<{ ids: DocId[] }>> {
    const transactionId = `setMany_${name}_${Date.now()}_${Math.random()}`;

    try {
      // Add to active transactions
      this.activeTransactions.add(transactionId);

      // Optimize memory estimation for large batches
      const docsLength = docs.length;

      // Use bulk estimation for better performance
      const estimatedSize =
        this.memoryManager.estimateDataSizeBulk(docs) +
        docsLength * 32 + // Reduced overhead per document (more accurate)
        Math.min(docsLength * 50, 512 * 1024); // Reduced linear overhead for large batches

      // Check if we can allocate this much memory
      if (!this.memoryManager.canAllocate(estimatedSize)) {
        // Try chunked processing for large datasets (only if not already chunked)
        if (docsLength > 10000 && !isChunked) {
          // Only chunk for reasonably large datasets
          Logger.info(
            `[MapManager] Large dataset detected (${docsLength} docs), using chunked processing`
          );
          return await this.setManyChunked(name, docs);
        }

        const stats = this.memoryManager.getMemoryStats();
        const projectedRSS = stats.rss + estimatedSize;

        Logger.warning(
          `[MapManager] setMany rejected: would exceed memory limits. ` +
            `Estimated size: ${(estimatedSize / 1024 / 1024 / 1024).toFixed(
              2
            )}GB, ` +
            `Current RSS: ${(stats.rss / 1024 / 1024 / 1024).toFixed(2)}GB, ` +
            `Projected RSS: ${(projectedRSS / 1024 / 1024 / 1024).toFixed(
              2
            )}GB, ` +
            `Limit: ${(
              this.memoryManager.getConfig().maxRSSBytes /
              1024 /
              1024 /
              1024
            ).toFixed(2)}GB`
        );
        // Stop monitoring temporarily to prevent infinite loops
        this.memoryManager.stopMonitoring();
        return { status: Status.ERROR };
      }

      // Check current memory usage
      const stats = this.memoryManager.getMemoryStats();
      if (stats.isOverLimit) {
        Logger.warning(
          `[MapManager] setMany rejected: memory limit already exceeded`
        );
        return { status: Status.ERROR };
      }

      const currentMap = await this.getCurrentMap();
      currentMap.size += docs.length;

      const result = await currentMap.map.setMany(name, docs);

      // Track for LRU if successful - use bulk tracking for better performance
      if (result.status === Status.OK && result.data) {
        const idsLength = result.data.ids.length;
        const lruEntries: Array<{ key: string; size: number }> = new Array(
          idsLength
        );

        for (let i = 0; i < idsLength; i++) {
          lruEntries[i] = {
            key: this.createLRUKey(name, result.data.ids[i]),
            size: this.memoryManager.estimateDataSize(docs[i]),
          };
        }

        this.memoryManager.trackAccessBulk(lruEntries);
      }

      return result;
    } finally {
      // Remove from active transactions
      this.activeTransactions.delete(transactionId);
    }
  }

  private async setManyChunked(
    name: CollectionName,
    docs: V[]
  ): Promise<Response<{ ids: DocId[] }>> {
    const docsLength = docs.length;
    const stats = this.memoryManager.getMemoryStats();
    const availableMemory =
      this.memoryManager.getConfig().maxRSSBytes - stats.rss;

    // Calculate optimal chunk size based on available memory
    // Use 80% of available memory for better performance
    const sampleDoc = docs[0];
    const sampleSize = this.memoryManager.estimateDataSize(sampleDoc);
    const safeAvailableMemory = Math.max(availableMemory, 200 * 1024 * 1024); // At least 200MB
    const maxChunkSize = Math.floor((safeAvailableMemory * 0.8) / sampleSize);
    const chunkSize = Math.max(Math.min(maxChunkSize, 50000), 1000); // Cap at 50k docs, min 1k docs per chunk

    // If chunk size is still too small, use a fixed small chunk size
    let finalChunkSize = chunkSize < 1000 ? 1000 : chunkSize;

    // If memory is critically low, use even smaller chunks
    if (availableMemory < 100 * 1024 * 1024) {
      // Less than 100MB available
      finalChunkSize = Math.min(finalChunkSize, 5000); // Max 5k docs per chunk
      Logger.warning(
        `[MapManager] Low memory detected, using smaller chunks of ${finalChunkSize}`
      );
    }

    Logger.info(
      `[MapManager] Processing ${docsLength} docs in chunks of ${finalChunkSize} ` +
        `(available memory: ${(availableMemory / 1024 / 1024 / 1024).toFixed(
          2
        )}GB)`
    );

    const allIds: DocId[] = [];
    let processed = 0;

    for (let i = 0; i < docsLength; i += finalChunkSize) {
      const chunk = docs.slice(i, i + finalChunkSize);
      const chunkResult = await this.setMany(name, chunk, true); // Mark as chunked to prevent recursion

      if (chunkResult.status !== Status.OK || !chunkResult.data) {
        Logger.error(
          `[MapManager] Chunk processing failed at ${i}/${docsLength}`
        );
        return { status: Status.ERROR };
      }

      allIds.push(...chunkResult.data.ids);
      processed += chunk.length;

      // Force garbage collection every 500 chunks to free memory (less frequent for better performance)
      if (processed % (finalChunkSize * 500) === 0) {
        if (typeof (globalThis as any).gc === "function") {
          (globalThis as any).gc();
        }
      }

      // Log progress every 10% or every 100k docs
      if (processed % Math.max(Math.floor(docsLength / 10), 100000) === 0) {
        const currentStats = this.memoryManager.getMemoryStats();
        Logger.info(
          `[MapManager] Progress: ${processed}/${docsLength} docs processed ` +
            `(${((processed / docsLength) * 100).toFixed(1)}%) ` +
            `Memory: ${(currentStats.rss / 1024 / 1024 / 1024).toFixed(2)}GB`
        );
      }
    }

    Logger.success(
      `[MapManager] Successfully processed ${docsLength} docs in chunks`
    );

    return { status: Status.OK, data: { ids: allIds } };
  }

  updateMany(
    name: CollectionName,
    updates: { id: DocId; doc: V }[]
  ): Response<{ updated: { id: DocId; doc: V }[] }> {
    for (const { id, doc } of updates) {
      const res = this.update(name, id, doc);
      if (res.status !== Status.OK) return { status: Status.ERROR };
    }
    return { status: Status.OK };
  }

  replaceMany(
    name: CollectionName,
    updates: { id: DocId; doc: V }[]
  ): Response<{ replaced: { id: DocId; doc: V }[] }> {
    const replaced: { id: DocId; doc: V }[] = [];

    for (const { id, doc } of updates) {
      const mapState = this.findIdInMap(name, id);
      if (!mapState) return { status: Status.ERROR };

      const res = mapState.map.replace(name, id, doc);
      if (res.status !== Status.OK) return res as Response<any>;

      replaced.push({ id, doc });
    }

    return { status: Status.OK, data: { replaced } };
  }

  deleteMany(
    name: CollectionName,
    docIds: DocId[]
  ): Response<{ deleted: DocId[] }> {
    const deleted: DocId[] = [];

    for (const id of docIds) {
      const state = this.findIdInMap(name, id);
      if (state) {
        const res = state.map.delete(name, id);
        if (res.status === Status.OK) {
          state.size--;
          deleted.push(id);
        }
      }
    }

    return { status: Status.OK, data: { deleted } };
  }

  find<T extends Table>(
    name: CollectionName,
    where: WhereQuery<T>
  ): Response<{ id: DocId; doc: V }[]> {
    const results: { id: DocId; doc: V }[] = [];

    for (const [, mapState] of this.maps) {
      const allDocs = mapState.map.getAll(name);
      if (allDocs.status === Status.OK && allDocs.data) {
        for (const [id, doc] of allDocs.data.entries()) {
          if (this.matchesWhere(doc, where)) {
            results.push({ id, doc }); // wrap only once here
          }
        }
      }
    }

    return { status: Status.OK, data: results };
  }

  private matchesWhere<T extends Table>(
    doc: any,
    where: WhereQuery<T> | Condition<T>
  ): boolean {
    if ("field" in where) {
      const value = doc[where.field];
      return this.evaluateOperators(value, where.op);
    }
    if ("AND" in where) {
      return where.AND.every((sub) => this.matchesWhere(doc, sub));
    }
    if ("OR" in where) {
      return where.OR.some((sub) => this.matchesWhere(doc, sub));
    }
    return true;
  }

  private evaluateOperators(value: any, ops: QueryOperatorsWithNot): boolean {
    let ok = true;

    if (ops.eq) ok &&= value === ops.eq;
    if (ops.gt) ok &&= value > ops.gt;
    if (ops.lt) ok &&= value < ops.lt;
    if (ops.gte) ok &&= value >= ops.gte;
    if (ops.lte) ok &&= value <= ops.lte;
    if (ops.in) ok &&= ops.in.includes(value);
    if (ops.nin) ok &&= !ops.nin.includes(value);

    if (ops.contains) {
      if (Array.isArray(value)) {
        ok &&= value.includes(ops.contains);
      } else if (typeof value === "string") {
        ok &&= value.includes(String(ops.contains));
      } else {
        ok = false;
      }
    }

    if (ops.overlap) {
      if (Array.isArray(value)) {
        ok &&= ops.overlap.some((v) => value.includes(v));
      } else {
        ok = false;
      }
    }

    if (ops.not) {
      ok &&= !this.evaluateOperators(value, ops.not);
    }

    return ok;
  }

  // Memory management methods
  startMemoryMonitoring(): void {
    this.memoryManager.startMonitoring();
  }

  stopMemoryMonitoring(): void {
    this.memoryManager.stopMonitoring();
  }

  getMemoryStats() {
    return this.memoryManager.getMemoryStats();
  }

  updateMemoryConfig(config: Partial<MemoryConfig>): void {
    this.memoryManager.updateConfig(config);
  }

  getLRUStats() {
    return this.memoryManager.getLRUStats();
  }

  // Reset emergency brake (useful for testing or recovery)
  resetEmergencyBrake(): void {
    this.emergencyBrakeCount = 0;
    this.lastEvictionTime = 0;
    Logger.info("[MapManager] Emergency brake reset");
  }

  // Get current emergency brake status
  getEmergencyBrakeStatus(): { count: number; lastEviction: number } {
    return {
      count: this.emergencyBrakeCount,
      lastEviction: this.lastEvictionTime,
    };
  }

  // Restart monitoring after a rejection (useful for recovery)
  restartMemoryMonitoring(): void {
    this.memoryManager.startMonitoring();
    this.resetEmergencyBrake();
    Logger.info("[MapManager] Memory monitoring restarted");
  }
}
