# ShinDB

**ShinDB** is a JavaScript/TypeScript-native, RAM-first database with append-only persistence.  
It’s built for developers who want **blazing-fast CRUD**, dead-simple DX, and minimal infra setup — without spinning up Postgres/Mongo/Redis clusters just to prototype or ship.

---

## Features

- ⚡ **Ultra-fast in-memory storage** (benchmarked at ~1M ops/sec single-threaded).
- 📝 **Append-only persistence (AOF)** with buffered writes.
- 🔒 **TypeScript-first API** for safe data access.
- 🛠️ **DX-friendly**: no SQL, no drivers, no infra boilerplate.
- 🗃️ **Shardable Map manager** that bypasses V8’s per-Map entry cap (~8.3M) and scales to **~30M records per process**.
- 📉 **Memory-efficient**: ~140 bytes per record at scale.
- 🚀 Works anywhere Deno or Node.js can run.

---

## Benchmarks

All benchmarks run on Apple M2 Pro Max, single-threaded, with a 4KB AOF buffer.

### Ops throughput

- INSERTS: single=796500/s batch=940472/s
- UPDATES: single=8388441/s batch=11356082/s
- DELETES: single=20729595/s batch=8815006/s

### Memory scaling

With 1KB documents:

- **200,000 records** → ~149 MB RAM
- **1,000,000 records** → ~800 MB RAM
- **29,800,000 records** → ~4.2 GB RAM (hitting V8 heap ceiling)
- ≈ **140 bytes overhead per record**, despite GC + JS object model

ShinDB pushes V8 to its absolute limits:

- Single `Map` caps at ~8.3M entries → solved with internal sharding.
- Shard manager scales to ~30M entries per process before V8’s ~4GB heap wall.
- External payloads stored as `Uint8Array` keep memory density tight.

---

## Roadmap

- [x] Core `CollectionManager` with CRUD ops
- [x] Append-only persistence (AOF)
- [x] Benchmark suite (1M+ ops/sec, 30M+ docs)
- [x] Sharded Map manager (bypassing V8 limits)
- [x] Batch operations (`createMany`, bulk update/delete)
- [ ] Unique field validation
- [ ] Query + filtering engine
- [ ] Result caching
- [ ] TypeScript SDK (Node/Deno)
- [ ] Binary protocol transport layer (TCP)
- [ ] AOF compaction + background persistence (worker offloading)
- [ ] Clustering (multi-process hash partitioning)
- [ ] Replication (multi-node safety)
- [ ] Query optimizer (scatter-gather across nodes)
- [ ] Hosted **ShinDB Cloud**

---

## Who is ShinDB for?

- Developers needing **ultra-fast, in-memory** data stores.
- JS/TS projects that want a **drop-in DB** without infra hassle.
- Perfect for:
  - Caching layers
  - Real-time analytics
  - Gaming state backends
  - Prototyping apps with minimal setup
  - Edge/serverless workloads

---

## Who is ShinDB _not_ for?

- Teams needing **complex relational queries** (joins, multi-table schemas).
- Enterprises requiring **full ACID guarantees** across nodes.
- Heavy storage workloads where datasets >> RAM.
- General replacements for Postgres/Mongo.

ShinDB is not a general-purpose SQL DB — it’s a **RAM-first engine** that shines where **speed, simplicity, and developer experience** matter most.

---

## Vision

ShinDB isn’t here to dethrone Postgres or MongoDB.  
It’s here to be the **Redis-class database for the JS/TS world**:

- Ultra-fast.
- Zero-setup.
- DX-driven.

Long-term, the goal is a hosted **ShinDB Cloud** so developers can spin up an in-memory DB in seconds — cheap, fast, and easy.

---

## Installation (WIP)

```bash
# Coming soon
npm install shindb
```
