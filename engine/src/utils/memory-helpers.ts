// Memory Helper Utilities
// Provides utilities for handling memory limit errors and operations

import { Status } from '@/types/operations.ts';
import Logger from '@/utils/logger.ts';

export interface MemoryLimitError {
  status: Status.ERROR;
  reason: 'MEMORY_LIMIT_EXCEEDED';
  estimatedSize: number;
  currentLimits: {
    maxRSS: number;
    maxHeap: number;
  };
  suggestions: string[];
}

export function isMemoryLimitError(result: {
  status: Status;
}): result is MemoryLimitError {
  return result.status === Status.ERROR;
}

export function handleMemoryLimitError(
  result: { status: Status },
  operation: string,
  currentLimits: { maxRSSBytes: number; maxHeapBytes: number }
): void {
  if (result.status === Status.ERROR) {
    Logger.error(
      `[MEMORY LIMIT] ${operation} rejected: would exceed memory limits`
    );
    Logger.info(
      `[MEMORY LIMIT] Current limits: RSS=${(
        currentLimits.maxRSSBytes /
        1024 /
        1024
      ).toFixed(0)}MB, Heap=${(
        currentLimits.maxHeapBytes /
        1024 /
        1024
      ).toFixed(0)}MB`
    );
    Logger.info(`[MEMORY LIMIT] Suggestions:`);
    Logger.info(`[MEMORY LIMIT] 1. Reduce batch size`);
    Logger.info(`[MEMORY LIMIT] 2. Increase memory limits in configuration`);
    Logger.info(`[MEMORY LIMIT] 3. Use smaller data objects`);
    Logger.info(`[MEMORY LIMIT] 4. Process data in smaller chunks`);
  }
}

export function estimateMemoryUsage(data: unknown[]): number {
  // Rough estimation: 114 bytes per user object
  return data.length * 114;
}

export function getMemoryLimitSuggestions(
  estimatedSize: number,
  currentLimits: { maxRSSBytes: number; maxHeapBytes: number }
): string[] {
  const suggestions: string[] = [];

  const estimatedMB = estimatedSize / 1024 / 1024;
  const currentRSSMB = currentLimits.maxRSSBytes / 1024 / 1024;
  const currentHeapMB = currentLimits.maxHeapBytes / 1024 / 1024;

  if (estimatedMB > currentRSSMB) {
    suggestions.push(
      `Increase maxRSSBytes to at least ${Math.ceil(estimatedMB * 1.2)}MB`
    );
  }

  if (estimatedMB > currentHeapMB) {
    suggestions.push(
      `Increase maxHeapBytes to at least ${Math.ceil(estimatedMB * 1.2)}MB`
    );
  }

  if (estimatedMB > 1000) {
    suggestions.push(
      `Consider processing in batches of ${Math.floor(
        (currentRSSMB * 0.8) / 114
      )} items`
    );
  }

  return suggestions;
}

export function createMemorySafeBatch<T>(
  data: T[],
  maxBatchSize: number = 1000
): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < data.length; i += maxBatchSize) {
    batches.push(data.slice(i, i + maxBatchSize));
  }

  return batches;
}

export function logMemoryStats(
  rss: number,
  heap: number,
  usagePercentage: number
): void {
  Logger.info(
    `Memory: RSS=${(rss / 1024 / 1024).toFixed(1)}MB, Heap=${(
      heap /
      1024 /
      1024
    ).toFixed(1)}MB, Usage=${(usagePercentage * 100).toFixed(1)}%`
  );
}
