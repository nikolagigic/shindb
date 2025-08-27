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

Snapshot #1 (before generation)...
generate_docs: 1407ms
Snapshot #2 (after generation)...

=== Pre-generation Memory ===
RSS before gen : 55.4 MB
RSS after gen : 1402.1 MB (Δ = 1346.7 MB)

=== Mixed Workload (single thread) ===
mix: R=60% W=30% U=8% D=2%
Prefill 200,000 docs...

--- Results ---
duration: 1.061s | throughput: 942491 ops/s
counts: { read: 599218, write: 300615, update: 80039, del: 20128 }
errors: { read: 492, write: 0, update: 63, del: 15 }
latency p50/p95/p99 (ms)
READ : 0.000125/0.000250/0.000416
WRITE : 0.002125/0.004042/0.005917
UPDATE: 0.000167/0.000334/0.000458
DELETE: 0.000167/0.000292/0.000500
RSS: 1889.5 MB -> 2419.8 MB (Δ 530.3 MB)

Memory usage:

- 1M records ≈ **530 MB RAM**
- RSS grows predictably (~530 bytes per document)

---

## Roadmap

- [x] Core `CollectionManager` with CRUD ops
- [ ] Batch operations (createMany, etc.)
- [ ] Unique field validation
- [ ] Query + filtering engine
- [x] Append-only persistence (AOF)
- [x] Benchmark suite (1M+ records, ~1M ops/sec)
- [ ] TypeScript SDK design (initial draft)
- [ ] Protocol transport layer (TCP)
- [ ] AOF compaction (like Redis `BGREWRITEAOF`)
- [ ] Worker offloading for persistence (background AOF writing)
- [ ] Indexing (unique, required, optional secondary indexes)
- [ ] SDK polish (strong typings, ergonomic API)
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
