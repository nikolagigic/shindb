// deno-lint-ignore-file no-explicit-any
// ------------------ Query Grammar ------------------

interface QueryOperators {
  eq?: unknown;
  gt?: unknown;
  lt?: unknown;
  gte?: unknown;
  lte?: unknown;
  in?: unknown[];
  nin?: unknown[];
  contains?: unknown;
  overlap?: unknown[];
}

interface QueryOperatorsWithNot extends QueryOperators {
  not?: QueryOperators;
}

export type WhereQuery<T extends Table> = {
  AND?: WhereQuery<T>[];
  OR?: WhereQuery<T>[];
  field?: keyof T & string; // <-- restricts to schema keys
  op?: QueryOperatorsWithNot;
};

// ------------------ Client Types ------------------

type DocId = number;

export type Table = {
  [name: string]: {
    type: "string" | "number" | "boolean";
    modifiers?: ("unique" | "required" | "indexed")[];
  };
};

type TypeMap<T extends "string" | "number" | "boolean"> = T extends "string"
  ? string
  : T extends "number" ? number
  : T extends "boolean" ? boolean
  : never;

type InferRow<T extends Table> = {
  [K in keyof T]: T[K]["modifiers"] extends Array<"required" | any>
    ? TypeMap<T[K]["type"]>
    : TypeMap<T[K]["type"]> | undefined;
};

// server adds this automatically
type RowWithId<T extends Table> = InferRow<T> & { id: number };

// ------------------ Actions ------------------

type ActionPayload<
  T extends Table,
  A extends keyof ActionResponse<T>,
> = A extends "create" ? InferRow<T>
  : A extends "get" ? { docId: number }
  : A extends "update"
    ? { query: { docId: number }; update: Partial<InferRow<T>> }
  : A extends "delete" ? { docId: number }
  : A extends "createMany" ? InferRow<T>[]
  : A extends "getMany" ? number[]
  : A extends "updateMany"
    ? { query: Partial<RowWithId<T>>; update: Partial<InferRow<T>> }
  : A extends "deleteMany" ? Partial<RowWithId<T>>
  : A extends "find" ? WhereQuery<T>
  : never;

type ActionResponse<T extends Table> = {
  create: RowWithId<T>;
  get: RowWithId<T> | null;
  update: RowWithId<T>;
  delete: { success: boolean };

  createMany: { status: number; data: { ids: number[] } };
  getMany: RowWithId<T>[];
  updateMany: RowWithId<T>[];
  deleteMany: { success: boolean; count: number };

  find: RowWithId<T>[]; // new
};

// Batch operation response types
type BatchResponse<T extends Table, A extends keyof ActionResponse<T>> = {
  status: number;
  data: A extends "createMany" ? { ids: number[] }
    : A extends "getMany" ? RowWithId<T>[]
    : A extends "updateMany" ? RowWithId<T>[]
    : A extends "deleteMany" ? { success: boolean; count: number }
    : never;
};

// ------------------ Client V2 ------------------

import { autobindStatics } from "../utils/autobind-statics.ts";
import { decode, encode } from "@std/msgpack";
import Logger from "../utils/logger.ts";
// import { bytesToMB } from "../utils/bytesToMB.ts";

export class Client {
  private static connection: Deno.TcpConn | null = null;

  static async setup(
    options: Deno.ConnectOptions = { hostname: "127.0.0.1", port: 7333 },
  ) {
    if (this.connection) return;
    this.connection = await Deno.connect(options);
    Logger.success("Connected to server");
  }

  static disconnect() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
      Logger.info("Disconnected from server");
    }
  }

  private static async send<T extends Table, A extends keyof ActionResponse<T>>(
    collection: string,
    action: A,
    payload: ActionPayload<T, A>,
  ): Promise<ActionResponse<T>[A]> {
    if (!this.connection) {
      throw new Error("Not connected. Call setup() first.");
    }

    // Encode the message
    const message = {
      action,
      collection,
      payload: payload as import("@std/msgpack").ValueType,
    };

    const encoded = encode(message) as Uint8Array;

    // Send message length (4 bytes)
    const lengthBuffer = new Uint8Array(4);
    new DataView(lengthBuffer.buffer).setUint32(0, encoded.length, false);
    await this.connection.write(lengthBuffer);

    // Send message data in chunks to avoid TCP buffering issues
    await this.sendDataInChunks(encoded);

    // Read response length (4 bytes)
    const responseLengthBuffer = await this.readExactly(4);
    const responseLength = new DataView(responseLengthBuffer.buffer).getUint32(
      0,
      false,
    );

    // Read response data in chunks
    const responseData = await this.readDataInChunks(responseLength);

    const response = decode(responseData) as ActionResponse<T>[A];

    return response;
  }

  private static async sendDataInChunks(data: Uint8Array): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected");
    }

    const chunkSize = 64 * 1024; // 64KB chunks
    let offset = 0;

    while (offset < data.length) {
      const remainingBytes = data.length - offset;
      const currentChunkSize = Math.min(chunkSize, remainingBytes);
      const chunk = data.subarray(offset, offset + currentChunkSize);

      await this.connection.write(chunk);
      offset += currentChunkSize;

      // Small delay to allow TCP flow control
      if (offset < data.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  private static async readDataInChunks(
    totalBytes: number,
  ): Promise<Uint8Array> {
    if (!this.connection) {
      throw new Error("Not connected");
    }

    const buffer = new Uint8Array(totalBytes);
    let totalRead = 0;
    const chunkSize = 64 * 1024; // 64KB chunks

    while (totalRead < totalBytes) {
      const remainingBytes = totalBytes - totalRead;
      const currentChunkSize = Math.min(chunkSize, remainingBytes);

      const chunk = await this.connection.read(
        buffer.subarray(totalRead, totalRead + currentChunkSize),
      );
      if (chunk === null) {
        throw new Error("Connection closed by server");
      }
      totalRead += chunk;
    }

    return buffer;
  }

  private static async readExactly(bytes: number): Promise<Uint8Array> {
    if (!this.connection) {
      throw new Error("Not connected");
    }

    const buffer = new Uint8Array(bytes);
    let totalRead = 0;

    while (totalRead < bytes) {
      const chunk = await this.connection.read(buffer.subarray(totalRead));
      if (chunk === null) {
        throw new Error("Connection closed by server");
      }
      totalRead += chunk;
    }

    return buffer;
  }

  private static async processBatchOperation<
    T extends Table,
    A extends keyof ActionResponse<T>,
  >(
    _collection: string,
    action: A,
    items: unknown[],
    batchProcessor: (batch: unknown[]) => Promise<BatchResponse<T, A>>,
    resultAggregator: (
      results: BatchResponse<T, A>,
      batchResult: BatchResponse<T, A>,
    ) => void,
  ): Promise<BatchResponse<T, A>> {
    const itemsLength = items.length;
    const MAX_ITEMS_PER_REQUEST = 1_000;
    const results = { status: 0, data: {} } as BatchResponse<T, A>;

    // Initialize the data structure based on the action type
    if (action === "createMany") {
      (results as any).data = { ids: [] };
    } else if (action === "getMany" || action === "updateMany") {
      (results as any).data = [];
    } else if (action === "deleteMany") {
      (results as any).data = { success: true, count: 0 };
    }

    try {
      // Process in batches with a single loop
      for (let i = 0; i < itemsLength; i += MAX_ITEMS_PER_REQUEST) {
        const batch = items.slice(i, i + MAX_ITEMS_PER_REQUEST);
        const batchResult = await batchProcessor(batch);

        if (batchResult.status !== 0) {
          throw new Error(`Error processing batch for ${action}`);
        }

        resultAggregator(results, batchResult);
      }
    } catch (e) {
      throw e;
    }

    return results;
  }

  static collection<T extends Table>(name: string, _table: T) {
    if (!this.connection) throw new Error("Call setup() first");

    return {
      create: (doc: InferRow<T>) => this.send<T, "create">(name, "create", doc),
      get: (query: { docId: DocId }) => this.send<T, "get">(name, "get", query),
      update: (query: { docId: DocId }, update: Partial<InferRow<T>>) =>
        this.send<T, "update">(name, "update", { query, update }),
      delete: (query: { docId: DocId }) =>
        this.send<T, "delete">(name, "delete", query),

      createMany: (docs: InferRow<T>[]) =>
        this.send<T, "createMany">(name, "createMany", docs),
      getMany: (ids: DocId[]) => this.send<T, "getMany">(name, "getMany", ids),
      updateMany: (
        query: Partial<RowWithId<T>>,
        update: Partial<InferRow<T>>,
      ) => this.send<T, "updateMany">(name, "updateMany", { query, update }),
      deleteMany: (query: Partial<RowWithId<T>>) =>
        this.send<T, "deleteMany">(name, "deleteMany", query),

      find: (where: WhereQuery<T>) => this.send<T, "find">(name, "find", where),
    };
  }
}

export const { setup, disconnect, collection } = autobindStatics(Client);
