// deno-lint-ignore-file no-explicit-any
import { autobindStatics } from "../utils/autobind-statics.ts";
import { encode } from "@std/msgpack";

export type Table = {
  [name: string]: {
    type: "string" | "number" | "boolean";
    modifiers?: ("unique" | "required" | "indexed")[];
  };
};

type TypeMap<T extends "string" | "number" | "boolean"> = T extends "string"
  ? string
  : T extends "number"
  ? number
  : T extends "boolean"
  ? boolean
  : never;

type InferRow<T extends Table> = {
  [K in keyof T]: T[K]["modifiers"] extends Array<"required" | any>
    ? TypeMap<T[K]["type"]>
    : TypeMap<T[K]["type"]> | undefined;
};

// server adds this automatically
type RowWithId<T extends Table> = InferRow<T> & { id: number };

// queries must contain at least one key (incl. id)
type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Keys extends keyof T
  ? { [K in Keys]-?: Required<Pick<T, K>> & Partial<Omit<T, K>> }[Keys]
  : never;

type Query<T extends Table> = RequireAtLeastOne<Partial<RowWithId<T>>>;

type ActionPayload<
  T extends Table,
  A extends keyof ActionResponse<T>
> = A extends "create"
  ? InferRow<T>
  : A extends "get"
  ? { docId: number }
  : A extends "update"
  ? { query: { docId: number }; update: Partial<InferRow<T>> }
  : A extends "delete"
  ? { docId: number }
  : A extends "createMany"
  ? InferRow<T>[]
  : A extends "getMany"
  ? Query<T>
  : A extends "updateMany"
  ? { query: Query<T>; update: Partial<InferRow<T>> }
  : A extends "deleteMany"
  ? Query<T>
  : never;

type ActionResponse<T extends Table> = {
  create: RowWithId<T>;
  get: RowWithId<T> | null;
  update: RowWithId<T>;
  delete: { success: boolean };

  createMany: RowWithId<T>[];
  getMany: RowWithId<T>[];
  updateMany: RowWithId<T>[];
  deleteMany: { success: boolean; count: number };
};

export class Client {
  private static connection: Deno.TcpConn | null = null;

  static async setup(
    options: Deno.ConnectOptions = { hostname: "127.0.0.1", port: 7333 }
  ) {
    if (this.connection) return;
    this.connection = await Deno.connect(options);
  }

  static disconnect() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }

  static collection<T extends Table>(name: string, _table: T) {
    if (!this.connection) throw new Error("Call setup() first");

    const send = async <A extends keyof ActionResponse<T>>(
      action: A,
      payload: ActionPayload<T, A>
    ): Promise<ActionResponse<T>[A]> => {
      const data = encode({
        action,
        collection: name,
        payload: payload as import("@std/msgpack").ValueType, // force
      });
      await this.connection!.write(data);

      return {} as ActionResponse<T>[A];
    };

    return {
      create: (doc: InferRow<T>) => send("create", doc),
      get: (query: { docId: number }) => send("get", query),
      update: (query: { docId: number }, update: Partial<InferRow<T>>) =>
        send("update", { query, update }),
      delete: (query: { docId: number }) => send("delete", query),

      createMany: (docs: InferRow<T>[]) => send("createMany", docs),
      getMany: (query: Query<T>) => send("getMany", query),
      updateMany: (query: Query<T>, update: Partial<InferRow<T>>) =>
        send("updateMany", { query, update }),
      deleteMany: (query: Query<T>) => send("deleteMany", query),
    };
  }
}

export const { setup, disconnect, collection } = autobindStatics(Client);
