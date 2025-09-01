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
}
