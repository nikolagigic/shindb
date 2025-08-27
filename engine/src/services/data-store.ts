// deno-lint-ignore-file no-explicit-any

import { Response, Status } from "@/types/operations.ts";
import { CollectionsCatalog } from "./collections-catalog.ts";
import Archive from "./archive.ts";

type CollectionName = string;
type DocId = number;
type Doc<V> = Map<DocId, V>;
type CollectionState<V> = {
  map: Doc<V>;
  nextId: DocId;
  size: number;
};

export interface DataStore<V = unknown> {
  ensure(name: string): boolean;
  ensureCollectionMap(name: string): Doc<V>;
  getAll(name: string): Response<Doc<V>>;
  get(name: string, docId: DocId): Response<V>;
  set(name: string, doc: V): Response<{ id: DocId }>;
  update(name: string, docId: DocId, doc: V): Response;
  delete(name: string, docId: DocId): Response;
}

export class InMemoryDataStore<V extends Uint8Array<ArrayBufferLike>>
  implements DataStore<V>
{
  private readonly data: Map<CollectionName, CollectionState<V>> = new Map();

  constructor(
    private readonly catalog: Pick<CollectionsCatalog, "exists">,
    private readonly archive: Archive
  ) {}

  ensure(name: string): boolean {
    return this.catalog.exists(name);
  }

  private ensureState(name: string): CollectionState<V> {
    let st = this.data.get(name);
    if (!st) {
      st = { map: new Map<DocId, V>(), nextId: 0, size: 0 };
      this.data.set(name, st);
    }
    return st;
  }

  ensureCollectionMap(name: string): Doc<V> {
    return this.ensureState(name).map;
  }

  private nextId(st: CollectionState<V>): DocId {
    return st.nextId++;
  }

  getAll(name: string): Response<Map<DocId, V>> {
    if (!this.ensure(name)) return { status: Status.ERROR };
    return { status: Status.OK, data: this.ensureState(name).map };
  }

  get(name: string, docId: DocId): Response<V> {
    const st = this.data.get(name);
    if (!st) return { status: Status.ERROR };
    const doc = st.map.get(docId);
    return doc === undefined
      ? { status: Status.ERROR }
      : { status: Status.OK, data: doc };
  }

  set(name: string, doc: V): Response<{ id: DocId }> {
    if (!this.ensure(name)) return { status: Status.ERROR };
    const st = this.ensureState(name);
    const id = this.nextId(st);
    st.map.set(id, doc);
    st.size++;
    this.archive.addRecord(doc);
    return { status: Status.OK, data: { id } };
  }

  setWithId(name: string, docId: DocId, doc: V): Response {
    if (!this.ensure(name)) return { status: Status.ERROR };
    const st = this.ensureState(name);

    if (st.map.has(docId)) {
      return { status: Status.ERROR }; // conflict: already exists
    }

    st.map.set(docId, doc);
    st.size++;

    // keep nextId monotonic to avoid collision with future auto IDs
    if (docId >= st.nextId) st.nextId = docId + 1;

    return { status: Status.OK };
  }

  replace(name: string, docId: DocId, doc: V): Response {
    const st = this.data.get(name);
    if (!st || !st.map.has(docId)) return { status: Status.ERROR };

    st.map.set(docId, doc);
    // size unchanged; nextId unchanged
    return { status: Status.OK };
  }

  update(name: string, docId: DocId, patch: V): Response {
    const st = this.data.get(name);
    if (!st) return { status: Status.ERROR };
    const existing = st.map.get(docId);
    if (existing === undefined) return { status: Status.ERROR };

    st.map.set(docId, patch);
    return { status: Status.OK };
  }

  delete(name: string, docId: DocId): Response {
    const st = this.data.get(name);
    if (!st) return { status: Status.ERROR };
    const ok = st.map.delete(docId);
    if (ok) {
      st.size--;
    }
    return ok ? { status: Status.OK } : { status: Status.ERROR };
  }

  size(name: string): Response<number> {
    const st = this.data.get(name);
    return st ? { status: Status.OK, data: st.size } : { status: Status.ERROR };
  }
}
