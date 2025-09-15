// deno-lint-ignore-file no-explicit-any
import {
  InMemoryDataStore,
  DataStore,
  DocId,
  CollectionName,
} from "@/services/data-store.ts";
import { Response, Status } from "@/types/operations.ts";
import { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import Archive from "@/services/archive.ts";

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

interface QueryOperators {
  eq?: unknown;
  gt?: unknown;
  lt?: unknown;
  gte?: unknown;
  lte?: unknown;
  in?: unknown[];
  nin?: unknown[];
  contains?: unknown;
  overlap?: unknown[];
}

interface QueryOperatorsWithNot extends QueryOperators {
  not?: QueryOperators;
}

interface Condition {
  field: string;
  op: QueryOperatorsWithNot;
}

type WhereQuery =
  | { AND: (WhereQuery | Condition)[] }
  | { OR: (WhereQuery | Condition)[] }
  | Condition;

export default class MapManager<V extends Uint8Array> implements DataStore<V> {
  private maps: Map<number, MapState<V>> = new Map();
  private currentMapIndex = 0;

  private readonly mapMutex = new Mutex();

  constructor(readonly catalog: InMemoryCollectionsCatalog) {
    this.maps.set(this.currentMapIndex, {
      map: new InMemoryDataStore(catalog, Archive.getInstance()),
      size: 0,
    });
  }

  private getCurrentMap(): Promise<MapState<V>> {
    // deno-lint-ignore require-await
    return this.mapMutex.lock(async () => {
      const currentMap = this.maps.get(this.currentMapIndex)!;

      if (currentMap.size >= MAX_ALLOCATED_ENTRIES) {
        this.currentMapIndex++;
        const map = new InMemoryDataStore<V>(
          this.catalog,
          Archive.getInstance()
        );

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

    return res.map.get(name, docId);
  }

  async set(name: CollectionName, doc: V): Promise<Response<{ id: DocId }>> {
    const currentMap = await this.getCurrentMap();

    currentMap.size++;
    return currentMap.map.set(name, doc);
  }

  update(name: CollectionName, docId: DocId, doc: V) {
    const res = this.findIdInMap(name, docId);
    if (!res) return { status: Status.ERROR };

    // don’t wrap again
    return res.map.update(name, docId, doc);
  }

  delete(name: CollectionName, docId: DocId): Response<{ id: DocId }> {
    const res = this.findIdInMap(name, docId);
    if (!res) return { status: Status.ERROR };

    res.size--;
    return res.map.delete(name, docId);
  }

  size(): number {
    return Array.from(this.maps.values())
      .map((m) => m.size)
      .reduce((sum, s) => sum + s, 0);
  }

  mapsCount(): number {
    return this.maps.size;
  }

  getMany(
    name: CollectionName,
    docIds: DocId[]
  ): Response<{ id: DocId; doc: V }[]> {
    const results: { id: DocId; doc: V }[] = [];

    for (const id of docIds) {
      const res = this.get(name, id);
      if (res.status === Status.OK && res.data) {
        results.push(res.data);
      }
    }

    return { status: Status.OK, data: results };
  }

  async setMany(
    name: CollectionName,
    docs: V[]
  ): Promise<Response<{ ids: DocId[] }>> {
    const currentMap = await this.getCurrentMap();

    currentMap.size += docs.length;
    return currentMap.map.setMany(name, docs);
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

  find(
    name: CollectionName,
    where: WhereQuery
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

  private matchesWhere(doc: any, where: WhereQuery | Condition): boolean {
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
}
