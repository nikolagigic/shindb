export type EvictionPolicy = 'noeviction' | 'lru' | 'random';

export interface MemoryConfig {
  maxRSSBytes?: number;
  maxHeapBytes?: number;
  evictionPolicy?: EvictionPolicy;
  evictionThreshold?: number; // percentage of max memory to trigger eviction
  checkInterval?: number; // milliseconds between memory checks
}

export interface MemoryStats {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  isOverLimit: boolean;
  usagePercentage: number;
}

export class MemoryManager {
  private config: Required<MemoryConfig>;
  private isMonitoring = false;
  private checkInterval?: number;
  private evictionCallbacks: Set<() => void> = new Set();
  private emergencyCallbacks: Set<() => void> = new Set();
  private lruCache: Map<string, { lastAccessed: number; size: number }> =
    new Map();

  constructor(config: MemoryConfig = {}) {
    this.config = {
      maxRSSBytes: config.maxRSSBytes ?? 1024 * 1024 * 1024, // 1GB default
      maxHeapBytes: config.maxHeapBytes ?? 512 * 1024 * 1024, // 512MB default
      evictionPolicy: config.evictionPolicy ?? 'lru',
      evictionThreshold: config.evictionThreshold ?? 0.8, // 80%
      checkInterval: config.checkInterval ?? 1000, // 1 second
    };
  }

  getMemoryStats(): MemoryStats {
    const usage = Deno.memoryUsage();
    const maxRSS = this.config.maxRSSBytes;
    const maxHeap = this.config.maxHeapBytes;

    const rssOverLimit = usage.rss > maxRSS;
    const heapOverLimit = usage.heapUsed > maxHeap;
    const isOverLimit = rssOverLimit || heapOverLimit;

    const usagePercentage = Math.max(
      usage.rss / maxRSS,
      usage.heapUsed / maxHeap
    );

    return {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      isOverLimit,
      usagePercentage,
    };
  }

  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.checkInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.checkInterval);
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  private checkMemoryUsage(): void {
    const stats = this.getMemoryStats();

    if (stats.usagePercentage >= this.config.evictionThreshold) {
      this.triggerEviction();
    }

    if (stats.isOverLimit) {
      this.triggerEmergency();
    }
  }

  private triggerEviction(): void {
    const stats = this.getMemoryStats();
    console.warn(
      `[MemoryManager] Memory usage at ${(stats.usagePercentage * 100).toFixed(
        1
      )}%, triggering eviction`
    );
    this.evictionCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[MemoryManager] Error in eviction callback:', error);
      }
    });
  }

  private triggerEmergency(): void {
    const stats = this.getMemoryStats();
    console.error(
      `[MemoryManager] Memory limit exceeded! RSS: ${this.formatBytes(
        stats.rss
      )}, Heap: ${this.formatBytes(stats.heapUsed)}`
    );
    this.emergencyCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[MemoryManager] Error in emergency callback:', error);
      }
    });
  }

  onEviction(callback: () => void): () => void {
    this.evictionCallbacks.add(callback);
    return () => this.evictionCallbacks.delete(callback);
  }

  onEmergency(callback: () => void): () => void {
    this.emergencyCallbacks.add(callback);
    return () => this.emergencyCallbacks.delete(callback);
  }

  canAllocate(estimatedBytes: number): boolean {
    const stats = this.getMemoryStats();
    const projectedRSS = stats.rss + estimatedBytes;
    const projectedHeap = stats.heapUsed + estimatedBytes;

    // Dynamic safety margin: smaller for large datasets where estimation is more accurate
    const safetyMargin = estimatedBytes > 1024 * 1024 * 1024 ? 1.01 : 1.02; // 1% for >1GB, 2% for smaller

    return (
      projectedRSS * safetyMargin <= this.config.maxRSSBytes &&
      projectedHeap * safetyMargin <= this.config.maxHeapBytes
    );
  }

  estimateDataSize(data: unknown): number {
    if (data instanceof Uint8Array) {
      // For Uint8Array, include the array overhead + data
      return data.byteLength + 24; // Array overhead
    }

    if (Array.isArray(data)) {
      return (
        data.reduce((total, item) => total + this.estimateDataSize(item), 0) +
        data.length * 8
      ); // Array overhead
    }

    if (typeof data === 'string') {
      return data.length * 2; // UTF-16 encoding
    }

    if (typeof data === 'number') {
      return 8; // 64-bit number
    }

    if (typeof data === 'boolean') {
      return 1;
    }

    if (data && typeof data === 'object') {
      // Optimized object size estimation without JSON.stringify
      let size = 24; // Base object overhead

      for (const [key, value] of Object.entries(data)) {
        // Key size (string length * 2 for UTF-16)
        size += key.length * 2;
        // Value size estimation
        size += this.estimateDataSize(value);
        // Property overhead
        size += 16;
      }

      return size;
    }

    return 0;
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }

  updateConfig(newConfig: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): Required<MemoryConfig> {
    return { ...this.config };
  }

  // LRU Cache Management
  trackAccess(key: string, size: number): void {
    this.lruCache.set(key, {
      lastAccessed: Date.now(),
      size,
    });
  }

  trackAccessBulk(entries: Array<{ key: string; size: number }>): void {
    // Batch track multiple accesses for better performance
    const now = Date.now();
    for (const entry of entries) {
      this.lruCache.set(entry.key, {
        lastAccessed: now,
        size: entry.size,
      });
    }
  }

  estimateDataSizeBulk(dataArray: unknown[]): number {
    // Optimized bulk estimation for large arrays
    let totalSize = 0;
    const dataLength = dataArray.length;

    for (let i = 0; i < dataLength; i++) {
      totalSize += this.estimateDataSize(dataArray[i]);
    }

    return totalSize;
  }

  removeFromLRU(key: string): void {
    this.lruCache.delete(key);
  }

  getLRUKeysToEvict(targetBytes: number): string[] {
    if (this.config.evictionPolicy === 'noeviction') {
      return [];
    }

    const entries = Array.from(this.lruCache.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    ); // oldest first

    const keysToEvict: string[] = [];
    let totalBytes = 0;

    for (const [key, { size }] of entries) {
      keysToEvict.push(key);
      totalBytes += size;
      if (totalBytes >= targetBytes) {
        break;
      }
    }

    return keysToEvict;
  }

  getLRUStats(): {
    totalKeys: number;
    totalSize: number;
    oldestAccess: number;
    newestAccess: number;
  } {
    const entries = Array.from(this.lruCache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const accessTimes = entries.map((entry) => entry.lastAccessed);

    return {
      totalKeys: this.lruCache.size,
      totalSize,
      oldestAccess: accessTimes.length > 0 ? Math.min(...accessTimes) : 0,
      newestAccess: accessTimes.length > 0 ? Math.max(...accessTimes) : 0,
    };
  }

  clearLRU(): void {
    this.lruCache.clear();
  }
}
