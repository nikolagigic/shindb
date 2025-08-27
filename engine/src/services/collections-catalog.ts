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

    this.collections.delete(name);

    return {
      status: Status.OK,
    };
  }

  exists(name: string): boolean {
    return this.collections.has(name);
  }
}
