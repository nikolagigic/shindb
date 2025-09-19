import Logger from "../utils/logger.ts";

export function profile<T>(label: string, cb: () => T): T {
  const start = performance.now();
  const result = cb();
  const end = performance.now();
  Logger.info(`[profile] ${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

// async version
export async function profileAsync<T>(
  label: string,
  cb: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  const result = await cb();
  const end = performance.now();
  Logger.info(`[profile] ${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}
