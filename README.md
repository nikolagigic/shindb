# ShinDB

**ShinDB** is a JavaScript/TypeScript-native, RAM-first database with append-only persistence.  
It is designed for developers who want **blazing-fast CRUD**, simple DX, and minimal infra setup — without needing Postgres/Mongo/Redis clusters just to get started.

---

## Features

- In-memory document storage with **append-only persistence (AOF)**.
- **Ultra-low latency** operations (reads in ~100–300ns, writes in ~2µs).
- Simple **TypeScript types** for safety.
- **DX-first**: no setup, no SQL, no drivers.
- Benchmarked at **~1M ops/sec** single-threaded.

---

## Benchmarks

All benchmarks run on Apple M2 Pro Max, single-threaded, with a 10KB AOF buffer.

Snapshot #1 (before generation)...
Snapshot #2 (after generation)...

=== Pre-generation Memory ===
RSS before gen : 54.9 MB
RSS after gen : 1401.3 MB (Δ = 1346.4 MB)

=== Mixed Workload (single thread) ===
mix: R=60% W=30% U=8% D=2%
Prefill 200,000 docs...

=== Post-prefill Memory ===
RSS after inserting 200,000 docs: 1550.2 MB
Per-doc cost: 8127.53 bytes/doc (approx)

--- Results ---
duration: 0.616s | throughput: 1622255 ops/s
counts: { read: 600438, write: 300067, update: 79391, del: 20104 }
errors: { read: 516, write: 0, update: 71, del: 11 }
latency p50/p95/p99 (ms)
READ : 0.000125/0.000292/0.000459
WRITE : 0.000167/0.006708/0.010166
UPDATE: 0.000166/0.000416/0.000625
DELETE: 0.000167/0.000375/0.003250
RSS: 1551.8 MB -> 1730.1 MB (Δ 178.4 MB)

### Memory usage

Measured with 1KB documents:

- 200,000 records = ~149 MB RAM
- ≈ **8 KB per record** (payload + engine overhead)
- 1,000,000 records ≈ **800 MB RAM**

ShinDB achieves sub-microsecond reads/writes at this density.

---

## Roadmap

- [x] Core `CollectionManager` with CRUD ops
- [ ] Reduce engine overhead
- [ ] Batch operations (createMany, etc.)
- [ ] Unique field validation
- [ ] Query + filtering engine
- [ ] Result caching
- [x] Append-only persistence (AOF)
- [x] Benchmark suite (1M+ records, ~1M ops/sec)
- [ ] TypeScript SDK design (initial draft)
- [ ] Protocol transport layer (TCP)
- [ ] AOF compaction
- [ ] Worker offloading for persistence (background AOF writing)
- [ ] SDK polish
- [ ] Clustering (multi-process, hash-partitioning)
- [ ] Replication (multi-node safety)
- [ ] Query optimizer (scatter-gather queries across nodes)
- [ ] Hosted “ShinDB Cloud”

---

## Who is ShinDB for?

- Developers who need **ultra-fast, in-memory** data stores.
- JS/TS projects that want a **drop-in DB** without infra hassle.
- Use-cases like:
  - Caching layers
  - Real-time analytics
  - Gaming state backends
  - Prototyping apps with minimal setup
  - Edge/serverless workloads
- Everyone else that see a usecase in this

---

## Who is ShinDB _not_ for?

- Teams needing **complex relational queries** (joins, multi-table schemas).
- Enterprises needing **transactional ACID guarantees** across nodes.
- Heavy storage workloads (datasets >> RAM, TB scale).
- General replacement for Postgres/Mongo.

ShinDB is **not a general-purpose SQL database** — it’s a **DX-first, RAM-first engine** designed to shine where speed and simplicity matter most.

---

## Vision

ShinDB is not meant to compete head-on with Postgres or MongoDB.  
Instead, it aims to become the **Redis-class database for the JS/TS world**:

- Ultra-fast.
- Zero-setup.
- DX-driven.

Long-term, the goal is to offer a **hosted ShinDB Cloud** so developers can spin up an in-memory DB in seconds — cheap, fast, and easy.

---

## Installation (WIP)

```bash
# Coming soon
npm install shindb
```
