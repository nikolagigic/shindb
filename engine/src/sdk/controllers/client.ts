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
import DatabaseManagerAdapter from "../../adapters/database-manager.ts";

type CollectionCrud<T extends Table> = {
  create: (data: TableToType<T>) => Promise<Response<{ id: number }>>;
  get: (id: DocId) => Promise<Response<{ id: number; doc: TableToType<T> }>>;
  update: (id: DocId, doc: TableToUpdateType<T>) => void;
  delete: (id: DocId) => void;
  purge: (id: DocId) => void;
  createMany: (docs: TableToType<T>[]) => Promise<Response<{ ids: number[] }>>;
};

type CollectionMany<T extends Table> = {
  createMany: (docs: TableToType<T>[]) => Promise<Response<{ ids: number[] }>>;
  getMany: (ids: DocId[]) => Response<Map<DocId, TableToType<T>>>;
  updateMany: (data: TableToUpdateWithIdType<T>[]) => void;
  deleteMany: (ids: DocId[]) => void;
  purgeMany: (ids: DocId[]) => void;
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
    private readonly mapManager: MapManager<any>,
    private readonly databasManagerAdapter: DatabaseManagerAdapter
  ) {}

  public async collection<T extends Table>(
    name: string,
    _table: T
  ): Promise<Collection<T>> {
    const c = this.catalog.set(name, _table);

    if (c.status === Status.OK) {
      Logger.success(`${name.toUpperCase()} collection created `);
    }

    const operations = await this.databasManagerAdapter.openCollection(
      name,
      _table
    );

    return {
      create: async (data: TableToType<T>) => {
        operations.create(data);
        return await this.mapManager.set(name, data);
      },
      get: async (id: DocId) => {
        const storeRes = this.mapManager.get(name, id);
        if (storeRes.status === Status.ERROR) {
          const dbRes = await operations.get(id);
          if (!dbRes.id) {
            return {
              status: Status.ERROR,
            };
          }
          const { id: dbId, ...rest } = dbRes;

          return {
            status: Status.OK,
            data: {
              id: dbId,
              doc: rest,
            },
          };
        }

        return storeRes;
      },
      update: (id: DocId, doc: TableToUpdateType<T>) => {
        operations.update(id, doc);
        return this.mapManager.update(name, id, doc);
      },
      delete: async (id: DocId) => {
        const storeRes = this.mapManager.delete(name, id);
        if (storeRes.status === Status.ERROR) {
          return;
        }

        await operations.delete(id);
      },
      purge: async (id: DocId) => {
        this.mapManager.delete(name, id);

        await operations.delete(id);
      },

      createMany: async (docs: TableToType<T>[]) => {
        operations.createMany(docs);
        return await this.mapManager.setMany(name, docs);
      },
      getMany: (ids: DocId[]) => this.mapManager.getMany(name, ids),
      updateMany: (data: TableToUpdateWithIdType<T>[]) => {
        operations.updateMany(data);
        return this.mapManager.updateMany(name, data);
      },
      deleteMany: async (ids: DocId[]) => {
        const storeRes = this.mapManager.deleteMany(name, ids);
        if (storeRes.status === Status.ERROR) {
          return;
        }

        await operations.deleteMany(ids);
      },
      purgeMany: async (ids: DocId[]) => {
        this.mapManager.deleteMany(name, ids);

        await operations.deleteMany(ids);
      },

      find: (where: FindQuery<T>) => this.mapManager.find<T>(name, where),
    };
  }
}
