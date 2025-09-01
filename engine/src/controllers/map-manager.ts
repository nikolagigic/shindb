import { InMemoryDataStore, DataStore, DocId } from "@/services/data-store.ts";
import { Response, Status } from "@/types/operations.ts";
import { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import Archive from "../services/archive.ts";

const MAX_ALLOCATED_ENTRIES = 6_000_000;

class Mutex {
  private mutex: Promise<unknown> = Promise.resolve();

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

interface MapState<V extends Uint8Array<ArrayBufferLike>> {
  map: InMemoryDataStore<V>;
  size: number;
}

export default class MapManager<V extends Uint8Array<ArrayBufferLike>>
  implements DataStore<V>
{
  private maps: Map<number, MapState<V>> = new Map();
  private currentMapIndex: number = 0;

  private readonly mapMutex = new Mutex();

  constructor(readonly catalog: InMemoryCollectionsCatalog) {
    this.maps.set(this.currentMapIndex, {
      map: new InMemoryDataStore(catalog, Archive.getInstance()),
      size: 0,
    });
  }

  private getCurrentMap(): Promise<MapState<V>> {
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

  private findIdInMap(name: string, docId: DocId): MapState<V> | null {
    for (const [, m] of this.maps) {
      if (m.map.get(name, docId)) {
        return m;
      }
    }
    return null;
  }

  get(name: string, docId: number): Response<V> {
    const res = this.findIdInMap(name, docId);
    if (!res) {
      return {
        status: Status.ERROR,
      };
    }

    return res.map.get(name, docId);
  }

  async set(name: string, doc: V): Promise<Response<{ id: number }>> {
    const currentMap = await this.getCurrentMap()!;

    currentMap.size++;
    return currentMap.map.set(name, doc);
  }

  update(name: string, docId: DocId, doc: V): Response {
    const res = this.findIdInMap(name, docId);
    if (!res) {
      return {
        status: Status.ERROR,
      };
    }

    return res.map.update(name, docId, doc);
  }

  delete(name: string, docId: DocId): Response {
    const res = this.findIdInMap(name, docId);
    if (!res) {
      return {
        status: Status.ERROR,
      };
    }

    res.size--;

    return res.map.delete(name, docId);
  }

  size(): number {
    return this.maps
      .values()
      .map((m) => m.size)
      .reduce((sum, s) => sum + s, 0);
  }

  mapsCount(): number {
    return this.maps.size;
  }

  getMany(name: string, docIds: DocId[]): Response<Map<DocId, V>> {
    const result = new Map<DocId, V>();

    for (const id of docIds) {
      const res = this.get(name, id);
      if (res.status === Status.OK && res.data) {
        result.set(id, res.data);
      }
    }

    return { status: Status.OK, data: result };
  }

  async setMany(name: string, docs: V[]): Promise<Response<{ ids: DocId[] }>> {
    const currentMap = await this.getCurrentMap();

    currentMap.size += docs.length;
    return currentMap.map.setMany(name, docs);
  }

  updateMany(name: string, updates: { id: DocId; doc: V }[]): Response {
    for (const { id, doc } of updates) {
      const res = this.update(name, id, doc);
      if (res.status !== Status.OK) {
        return { status: Status.ERROR };
      }
    }
    return { status: Status.OK };
  }

  replaceMany(name: string, updates: { id: DocId; doc: V }[]): Response {
    for (const { id, doc } of updates) {
      const mapState = this.findIdInMap(name, id);
      if (!mapState) return { status: Status.ERROR };

      const res = mapState.map.replace(name, id, doc);
      if (res.status !== Status.OK) return res;
    }
    return { status: Status.OK };
  }

  deleteMany(name: string, docIds: DocId[]): Response<{ deleted: number }> {
    let deleted = 0;

    for (const id of docIds) {
      const state = this.findIdInMap(name, id);
      if (state) {
        const res = state.map.delete(name, id);
        if (res.status === Status.OK) {
          state.size--;
          deleted++;
        }
      }
    }

    return { status: Status.OK, data: { deleted } };
  }
}
