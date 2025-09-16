import { Response, Status } from '@/types/operations.ts';
import { CollectionsCatalog } from './collections-catalog.ts';
import Archive from './archive.ts';

export type CollectionName = string;
export type DocId = number;
export type Doc<V> = Map<DocId, V>;
export type CollectionState<V> = {
  map: Doc<V>;
  nextId: DocId;
  size: number;
};

export interface DataStore<V = unknown> {
  get(name: string, docId: DocId): Response<{ id: DocId; doc: V }>;
  set(
    name: string,
    doc: V
  ): Response<{ id: DocId }> | Promise<Response<{ id: DocId }>>;
  update(name: string, docId: DocId, doc: V): Response<{ id: DocId; doc: V }>;
  delete(name: string, docId: DocId): Response<{ id: DocId }>;

  getMany(name: string, docIds: DocId[]): Response<{ id: DocId; doc: V }[]>;
  setMany(
    name: string,
    docs: V[]
  ): Response<{ ids: DocId[] }> | Promise<Response<{ ids: DocId[] }>>;
  updateMany(
    name: string,
    updates: { id: DocId; doc: V }[]
  ): Response<{ updated: { id: DocId; doc: V }[] }>;
  replaceMany(
    name: string,
    updates: { id: DocId; doc: V }[]
  ): Response<{ replaced: { id: DocId; doc: V }[] }>;
  deleteMany(name: string, docIds: DocId[]): Response<{ deleted: DocId[] }>;
}

export class InMemoryDataStore<V extends Uint8Array<ArrayBufferLike>>
  implements DataStore<V>
{
  private readonly data: Map<CollectionName, CollectionState<V>> = new Map();

  constructor(
    private readonly catalog: Pick<CollectionsCatalog, 'exists'>,
    private readonly archive: Archive
  ) {}

  ensure(name: string): boolean {
    return this.catalog.exists(name);
  }

  public ensureState(
    name: string,
    options = { nextId: 0, size: 0 }
  ): CollectionState<V> {
    let st = this.data.get(name);
    if (!st) {
      st = {
        map: new Map<DocId, V>(),
        ...options,
      };
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

  get(name: string, docId: DocId): Response<{ id: DocId; doc: V }> {
    const st = this.data.get(name);
    if (!st) return { status: Status.ERROR };
    const doc = st.map.get(docId);
    return doc === undefined
      ? { status: Status.ERROR }
      : { status: Status.OK, data: { id: docId, doc } };
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

  update(
    name: string,
    docId: DocId,
    patch: V
  ): Response<{ id: DocId; doc: V }> {
    const st = this.data.get(name);
    if (!st) return { status: Status.ERROR };
    if (!st.map.has(docId)) return { status: Status.ERROR };
    st.map.set(docId, patch);
    return { status: Status.OK, data: { id: docId, doc: patch } };
  }

  delete(name: string, docId: DocId): Response<{ id: DocId }> {
    const st = this.data.get(name);
    if (!st) return { status: Status.ERROR };
    const ok = st.map.delete(docId);
    if (ok) st.size--;
    return ok
      ? { status: Status.OK, data: { id: docId } }
      : { status: Status.ERROR };
  }

  size(name: string): Response<number> {
    const st = this.data.get(name);
    return st ? { status: Status.OK, data: st.size } : { status: Status.ERROR };
  }

  getMany(name: string, docIds: DocId[]): Response<{ id: DocId; doc: V }[]> {
    if (!this.ensure(name)) return { status: Status.ERROR };
    const st = this.ensureState(name);

    const result: { id: DocId; doc: V }[] = [];
    for (const id of docIds) {
      const doc = st.map.get(id);
      if (doc !== undefined) result.push({ id, doc });
    }

    return { status: Status.OK, data: result };
  }

  setMany(name: string, docs: V[]): Response<{ ids: DocId[] }> {
    if (!this.ensure(name)) return { status: Status.ERROR };
    const st = this.ensureState(name);

    const ids: DocId[] = new Array(docs.length);

    let i = 0;
    for (const doc of docs) {
      const id = this.nextId(st);
      st.map.set(id, doc);
      ids[i++] = id;
    }

    st.size += docs.length;

    for (const doc of docs) {
      this.archive.addRecord(doc);
    }

    return { status: Status.OK, data: { ids } };
  }

  updateMany(
    name: string,
    updates: { id: DocId; doc: V }[]
  ): Response<{ updated: { id: DocId; doc: V }[] }> {
    if (!this.ensure(name)) return { status: Status.ERROR };
    const st = this.ensureState(name);

    const updated: { id: DocId; doc: V }[] = [];
    for (const { id, doc } of updates) {
      if (!st.map.has(id)) return { status: Status.ERROR };
      st.map.set(id, doc);
      updated.push({ id, doc });
    }

    return { status: Status.OK, data: { updated } };
  }

  replaceMany(
    name: string,
    updates: { id: DocId; doc: V }[]
  ): Response<{ replaced: { id: DocId; doc: V }[] }> {
    if (!this.ensure(name)) return { status: Status.ERROR };
    const st = this.ensureState(name);

    const replaced: { id: DocId; doc: V }[] = [];
    for (const { id, doc } of updates) {
      if (!st.map.has(id)) return { status: Status.ERROR };
      st.map.set(id, doc);
      replaced.push({ id, doc });
    }

    return { status: Status.OK, data: { replaced } };
  }

  deleteMany(name: string, docIds: DocId[]): Response<{ deleted: DocId[] }> {
    if (!this.ensure(name)) return { status: Status.ERROR };
    const st = this.ensureState(name);

    const deleted: DocId[] = [];
    for (const id of docIds) {
      if (st.map.delete(id)) {
        deleted.push(id);
      }
    }

    if (deleted.length > 0) st.size -= deleted.length;

    return { status: Status.OK, data: { deleted } };
  }
}
