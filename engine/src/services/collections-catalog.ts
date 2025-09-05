import { Table } from "@/types/collection-manager.ts";
import { type Response, Status } from "@/types/operations.ts";

export interface CollectionsCatalog {
  getAll(): Response<ReadonlyMap<string, Table>>;
  get(name: string): Response<Table>;
  set(name: string, table: Table): Response;
  update(name: string, table: Table): Response;
  delete(name: string): Response;
  exists(name: string): boolean;
}

type CollectionName = string;
type Collections<V> = Map<CollectionName, V>;

export class InMemoryCollectionsCatalog implements CollectionsCatalog {
  private readonly collections: Collections<Table> = new Map<string, Table>();
  private collectionUniqueFields: Map<CollectionName, Map<string, boolean>> =
    new Map();

  private getOrCreate<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
    let value = map.get(key);
    if (value === undefined) {
      value = factory();
      map.set(key, value);
    }
    return value;
  }

  private ensureCollectionUniqueMap(name: string) {
    return this.getOrCreate(this.collectionUniqueFields, name, () => new Map());
  }

  private setUniqueFields(name: string, table: Table) {
    Object.keys(table).map((k) => {
      const collection = this.ensureCollectionUniqueMap(name);
      collection.set(k, table[k].modifiers?.includes("unique"));
    });
  }

  getAll(): Response<ReadonlyMap<string, Table>> {
    return {
      status: Status.OK,
      data: this.collections,
    };
  }

  get(name: string): Response<Table> {
    const data = this.collections.get(name);
    if (!data) {
      return {
        status: Status.ERROR,
      };
    }

    return {
      status: Status.OK,
      data,
    };
  }

  set(name: string, table: Table): Response {
    this.collections.set(name, table);

    this.setUniqueFields(name, table);

    return {
      status: Status.OK,
    };
  }

  update(name: string, table: Table): Response {
    if (!this.collections.get(name)) {
      return {
        status: Status.ERROR,
      };
    }

    this.setUniqueFields(name, table);
    this.collections.set(name, table);

    return {
      status: Status.OK,
    };
  }

  delete(name: string): Response {
    if (!this.collections.get(name)) {
      return {
        status: Status.ERROR,
      };
    }

    this.collectionUniqueFields.delete(name);
    this.collections.delete(name);

    return {
      status: Status.OK,
    };
  }

  exists(name: string): boolean {
    return this.collections.has(name);
  }
}
