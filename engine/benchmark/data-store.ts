// mixed_comprehensive.ts — Deno/TS
// Run: deno run -A mixed_comprehensive.ts

import CollectionManager from "@/controllers/collection-manager.ts";
import { Status } from "@/types/operations.ts";
import Archive from "@/services/archive.ts";

type V = Uint8Array;

// ======== CONFIG ========
const COLLECTION = "users";
const DOCS_PREGEND = 1_000_000;
const PREFILL = 200_000;
const TOTAL_OPS = 1_000_000;
const MIX = { read: 0.6, write: 0.3, update: 0.08, del: 0.02 };
const SAMPLE_EVERY = 256;
const REFRESH_EVERY = 25_000;
// =========================

// ----- bootstrap collectionManager / collection -----
const collectionManager = CollectionManager.getInstance();
collectionManager.catalog.set(COLLECTION, {});
const ds: any = collectionManager.dataStore;
if (!ds?.ensure?.(COLLECTION)) {
  console.error("dataStore or collection missing.");
  Deno.exit(1);
}

// ----- utils -----
const KB = 1024,
  MB = 1024 * KB;

function now(): number {
  return performance.now();
}
function memSnap() {
  const m = Deno.memoryUsage() as Deno.MemoryUsage;
  return {
    rss: m.rss,
    heapTotal: m.heapTotal,
    heapUsed: m.heapUsed,
    external: (m as any).external ?? 0,
  };
}
function fmtMB(n: number) {
  return `${(n / MB).toFixed(1)} MB`;
}
function pct(arr: number[], p: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}
function fmt(arr: number[]): string {
  if (!arr.length) return "n/a";
  return [
    pct(arr, 0.5).toFixed(6),
    pct(arr, 0.95).toFixed(6),
    pct(arr, 0.99).toFixed(6),
  ].join("/");
}

// ----- pre-gen payloads -----
function makeDoc(): V {
  const b = new Uint8Array(1024);
  crypto.getRandomValues(b);
  return b;
}

console.log("Snapshot #1 (before generation)...");
const gen0 = memSnap();
console.time("generate_docs");
const docs: V[] = new Array(DOCS_PREGEND);
for (let i = 0; i < DOCS_PREGEND; i++) docs[i] = makeDoc();
console.timeEnd("generate_docs");
console.log("Snapshot #2 (after generation)...");
const gen1 = memSnap();

const genDeltaRSS = gen1.rss - gen0.rss;
console.log("\n=== Pre-generation Memory ===");
console.log(`RSS before gen : ${fmtMB(gen0.rss)}`);
console.log(`RSS after gen  : ${fmtMB(gen1.rss)}  (Δ = ${fmtMB(genDeltaRSS)})`);

// ----- helpers -----
type Counters = { read: number; write: number; update: number; del: number };
type Errors = { read: number; write: number; update: number; del: number };
type Lats = { r: number[]; w: number[]; u: number[]; d: number[] };

function chooseOp(u: number): keyof Counters {
  if (u < MIX.read) return "read";
  if (u < MIX.read + MIX.write) return "write";
  if (u < MIX.read + MIX.write + MIX.update) return "update";
  return "del";
}
function harvestIds(): number[] {
  const res = ds.getAll(COLLECTION);
  const map = res?.data as Map<number, unknown> | undefined;
  return map ? Array.from(map.keys()) : [];
}
function pickFrom(pool: number[]) {
  if (!pool.length) return undefined;
  const i = (Math.random() * pool.length) | 0;
  return pool[i];
}

// ops
function opWrite(i: number): number {
  const t0 = now();
  const r = ds.set(COLLECTION, docs[i % DOCS_PREGEND]);
  const t1 = now();
  return t1 - t0;
}
function opRead(pool: number[]): [number, boolean] {
  const id = pickFrom(pool);
  if (id === undefined) return [0, false];
  const t0 = now();
  const r = ds.get(COLLECTION, id);
  const t1 = now();
  const ok = !!r && r.status === Status.OK;
  return [t1 - t0, ok];
}
function opUpdate(pool: number[]): [number, boolean] {
  const id = pickFrom(pool);
  if (id === undefined) return [0, false];
  const patch: V = new Uint8Array(16); // small overwrite
  crypto.getRandomValues(patch);
  const t0 = now();
  const r = ds.update(COLLECTION, id, patch);
  const t1 = now();
  const ok = !!r && r.status === Status.OK;
  return [t1 - t0, ok];
}
function opDelete(pool: number[]): [number, boolean] {
  const id = pickFrom(pool);
  if (id === undefined) return [0, false];
  const t0 = now();
  const r = ds.delete(COLLECTION, id);
  const t1 = now();
  const ok = !!r && r.status === Status.OK;
  return [t1 - t0, ok];
}

// run sequence
async function runMixed() {
  console.log("\n=== Mixed Workload (single thread) ===");
  console.log(
    `mix: R=${(MIX.read * 100) | 0}% W=${(MIX.write * 100) | 0}% U=${
      (MIX.update * 100) | 0
    }% D=${(MIX.del * 100) | 0}%`
  );

  console.log(`Prefill ${PREFILL.toLocaleString()} docs...`);
  for (let i = 0; i < PREFILL; i++) {
    ds.set(COLLECTION, docs[i % DOCS_PREGEND]);
  }

  // 🔎 snapshot after prefill
  const afterPrefill = memSnap();
  console.log("\n=== Post-prefill Memory ===");
  console.log(
    `RSS after inserting ${PREFILL.toLocaleString()} docs: ${fmtMB(
      afterPrefill.rss
    )}`
  );
  console.log(
    `Per-doc cost: ${(afterPrefill.rss / PREFILL).toFixed(
      2
    )} bytes/doc (approx)`
  );

  let pool = harvestIds();

  const mem0 = memSnap();
  const t0 = now();

  const counts: Counters = { read: 0, write: 0, update: 0, del: 0 };
  const errs: Errors = { read: 0, write: 0, update: 0, del: 0 };
  const lats: Lats = { r: [], w: [], u: [], d: [] };
  let opsSinceRefresh = 0;

  for (let i = 0; i < TOTAL_OPS; i++) {
    if (opsSinceRefresh >= REFRESH_EVERY) {
      pool = harvestIds();
      opsSinceRefresh = 0;
    }

    const u = Math.random();
    const kind = chooseOp(u);
    switch (kind) {
      case "read": {
        const [lat, ok] = opRead(pool);
        counts.read++;
        if (!ok) errs.read++;
        if (counts.read % SAMPLE_EVERY === 0) lats.r.push(lat);
        break;
      }
      case "write": {
        const lat = opWrite(i);
        counts.write++;
        if (counts.write % SAMPLE_EVERY === 0) lats.w.push(lat);
        break;
      }
      case "update": {
        const [lat, ok] = opUpdate(pool);
        counts.update++;
        if (!ok) errs.update++;
        if (counts.update % SAMPLE_EVERY === 0) lats.u.push(lat);
        break;
      }
      case "del": {
        const [lat, ok] = opDelete(pool);
        counts.del++;
        if (!ok) errs.del++;
        if (counts.del % SAMPLE_EVERY === 0) lats.d.push(lat);
        break;
      }
    }
    opsSinceRefresh++;
  }

  const t1 = now();
  const mem1 = memSnap();

  const dur = (t1 - t0) / 1000;
  const tput = Math.round(TOTAL_OPS / dur);

  console.log("\n--- Results ---");
  console.log(`duration: ${dur.toFixed(3)}s | throughput: ${tput} ops/s`);
  console.log(`counts:`, counts);
  console.log(`errors:`, errs);
  console.log(`latency p50/p95/p99 (ms)`);
  console.log(`  READ  : ${fmt(lats.r)}`);
  console.log(`  WRITE : ${fmt(lats.w)}`);
  console.log(`  UPDATE: ${fmt(lats.u)}`);
  console.log(`  DELETE: ${fmt(lats.d)}`);

  const delta = mem1.rss - mem0.rss;
  console.log(
    `RSS: ${fmtMB(mem0.rss)} -> ${fmtMB(mem1.rss)} (Δ ${fmtMB(delta)})`
  );
}

// ---- RUN SEQUENCE ----
await runMixed();
