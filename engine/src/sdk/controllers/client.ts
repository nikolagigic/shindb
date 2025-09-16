// deno-lint-ignore-file no-explicit-any
import type MapManager from "@/controllers/map-manager.ts";
import type { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import type {
  Table,
  TableToType,
  TableToUpdateType,
  TableToUpdateWithIdType,
} from "@/types/collection-manager.ts";
import Logger from "@/utils/logger.ts";
import { type Response, Status } from "@/types/operations.ts";
import type { DocId } from "@/services/data-store.ts";
import type { FindQuery } from "@/types/collection-manager.ts";

type CollectionCrud<T extends Table> = {
  create: (data: TableToType<T>) => Promise<Response<{ id: number }>>;
  get: (id: DocId) => Response<{ id: number; doc: TableToType<T> }>;
  update: (id: DocId, doc: TableToUpdateType<T>) => void;
  delete: (id: DocId) => void;
  createMany: (docs: TableToType<T>[]) => Promise<Response<{ ids: number[] }>>;
};

type CollectionMany<T extends Table> = {
  createMany: (docs: TableToType<T>[]) => Promise<Response<{ ids: number[] }>>;
  getMany: (ids: DocId[]) => Response<{ id: number; doc: TableToType<T> }[]>;
  updateMany: (data: TableToUpdateWithIdType<T>[]) => void;
  deleteMany: (ids: DocId[]) => void;
};

type CollectionFind<T extends Table> = {
  find: (
    where: FindQuery<T>
  ) => Response<{ id: number; doc: TableToType<T> }[]>;
};

type Collection<T extends Table> = CollectionCrud<T> &
  CollectionMany<T> &
  CollectionFind<T>;

export class Client {
  constructor(
    private readonly catalog: InMemoryCollectionsCatalog,
    private readonly mapManager: MapManager<any>
  ) {}

  public collection<T extends Table>(name: string, _table: T): Collection<T> {
    const c = this.catalog.set(name, _table);

    if (c.status === Status.OK) {
      Logger.success(`${name.toUpperCase()} collection created `);
    }

    return {
      create: async (data: TableToType<T>) =>
        await this.mapManager.set(name, data),
      get: (id: DocId) => this.mapManager.get(name, id),
      update: (id: DocId, doc: TableToUpdateType<T>) =>
        this.mapManager.update(name, id, doc),
      delete: (id: DocId) => this.mapManager.delete(name, id),

      createMany: async (docs: TableToType<T>[]) =>
        await this.mapManager.setMany(name, docs),
      getMany: (ids: DocId[]) => this.mapManager.getMany(name, ids),
      updateMany: (data: TableToUpdateWithIdType<T>[]) =>
        this.mapManager.updateMany(name, data),
      deleteMany: (ids: DocId[]) => this.mapManager.deleteMany(name, ids),

      find: (where: FindQuery<T>) => this.mapManager.find<T>(name, where),
    };
  }
}
