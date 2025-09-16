import type MapManager from "@/controllers/map-manager.ts";
import type { InMemoryCollectionsCatalog } from "@/services/collections-catalog.ts";
import type {
  Table,
  TableToType,
  TableToUpdateType,
  TableToUpdateWithIdType,
} from "@/types/collection-manager.ts";
import Logger from "@/utils/logger.ts";
import { Status } from "@/types/operations.ts";
import type { DocId } from "@/services/data-store.ts";
import type { FindQuery } from "@/types/collection-manager.ts";

export class Client {
  constructor(
    private readonly catalog: InMemoryCollectionsCatalog,
    private readonly mapManager: MapManager<any>,
  ) {}

  public collection<T extends Table>(name: string, _table: T) {
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
