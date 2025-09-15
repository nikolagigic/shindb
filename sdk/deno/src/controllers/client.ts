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
    type: 'string' | 'number' | 'boolean';
    modifiers?: ('unique' | 'required' | 'indexed')[];
  };
};

type TypeMap<T extends 'string' | 'number' | 'boolean'> = T extends 'string'
  ? string
  : T extends 'number'
  ? number
  : T extends 'boolean'
  ? boolean
  : never;

type InferRow<T extends Table> = {
  [K in keyof T]: T[K]['modifiers'] extends Array<'required' | any>
    ? TypeMap<T[K]['type']>
    : TypeMap<T[K]['type']> | undefined;
};

// server adds this automatically
type RowWithId<T extends Table> = InferRow<T> & { id: number };

// ------------------ Actions ------------------

type ActionPayload<
  T extends Table,
  A extends keyof ActionResponse<T>
> = A extends 'create'
  ? InferRow<T>
  : A extends 'get'
  ? { docId: number }
  : A extends 'update'
  ? { query: { docId: number }; update: Partial<InferRow<T>> }
  : A extends 'delete'
  ? { docId: number }
  : A extends 'createMany'
  ? InferRow<T>[]
  : A extends 'getMany'
  ? number[]
  : A extends 'updateMany'
  ? { query: Partial<RowWithId<T>>; update: Partial<InferRow<T>> }
  : A extends 'deleteMany'
  ? Partial<RowWithId<T>>
  : A extends 'find'
  ? WhereQuery<T>
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

  find: RowWithId<T>[]; // new
};

// ------------------ Client ------------------

import { autobindStatics } from '../utils/autobind-statics.ts';
import { bytesToMB } from '../utils/bytesToMB.ts';
import { encode, decode } from '@std/msgpack';
import Logger from '../utils/logger.ts';

const MAX_FRAME_BYTES = 256_000; // ~256KB per frame

export class Client {
  private static connection: Deno.TcpConn | null = null;

  static async setup(
    options: Deno.ConnectOptions = { hostname: '127.0.0.1', port: 7333 }
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

  private static async send<T extends Table, A extends keyof ActionResponse<T>>(
    collection: string,
    action: A,
    payload: ActionPayload<T, A>
  ): Promise<ActionResponse<T>[A]> {
    const encoded = encode({
      action,
      collection,
      payload: payload as import('@std/msgpack').ValueType,
    }) as Uint8Array;

    if (encoded.length === 0) {
      throw new Error('Empty payload not allowed');
    }

    if (encoded.length <= MAX_FRAME_BYTES) {
      return await this.writeAndRead<T, A>(encoded);
    }

    let chunksSum = 0;
    let count = 0;
    for (let i = 0; i < encoded.length; i += MAX_FRAME_BYTES) {
      const chunk = encoded.subarray(i, i + MAX_FRAME_BYTES);
      chunksSum += chunk.length;
      count++;
      Logger.success(`[${count}] Sent: ${chunksSum} total bytes`);
      if (i === 0) {
        await this.writeFirstFrame(encoded.length, chunk);
      } else if (i + MAX_FRAME_BYTES >= encoded.length) {
        return await this.writeLastFrame<T, A>(chunk);
      } else {
        await this.writeMidFrame(chunk);
      }
    }

    throw new Error('Something went wrong');
  }

  private static async readExact(buf: Uint8Array) {
    let offset = 0;
    while (offset < buf.length) {
      const n = await this.connection!.read(buf.subarray(offset));
      if (n === null) throw new Error('Server closed connection mid-read');
      offset += n;
    }
    return buf;
  }

  private static async writeFirstFrame(totalLength: number, chunk: Uint8Array) {
    const frame = new Uint8Array(4 + chunk.length);
    new DataView(frame.buffer).setUint32(0, totalLength, false);
    frame.set(chunk, 4);
    await this.connection!.write(frame);
  }

  private static async writeMidFrame(chunk: Uint8Array) {
    await this.connection!.write(chunk);
  }

  private static async writeLastFrame<
    T extends Table,
    A extends keyof ActionResponse<T>
  >(chunk: Uint8Array): Promise<ActionResponse<T>[A]> {
    await this.connection!.write(chunk);

    // response handling
    const lengthBuf = new Uint8Array(4);
    await this.readExact(lengthBuf);
    const msgLength = new DataView(lengthBuf.buffer).getUint32(0, false);

    const msgBuf = new Uint8Array(msgLength);
    await this.readExact(msgBuf);

    return decode(msgBuf) as ActionResponse<T>[A];
  }

  private static async writeAndRead<
    T extends Table,
    A extends keyof ActionResponse<T>
  >(payload: Uint8Array): Promise<ActionResponse<T>[A]> {
    // write frame
    const frame = new Uint8Array(4 + payload.length);
    new DataView(frame.buffer).setUint32(0, payload.length, false);
    frame.set(payload, 4);
    await this.connection!.write(frame);

    // read length prefix
    const lengthBuf = new Uint8Array(4);
    await this.readExact(lengthBuf);
    const msgLength = new DataView(lengthBuf.buffer).getUint32(0, false);

    // read response body
    const msgBuf = new Uint8Array(msgLength);
    await this.readExact(msgBuf);

    return decode(msgBuf) as ActionResponse<T>[A];
  }

  static collection<T extends Table>(name: string, _table: T) {
    if (!this.connection) throw new Error('Call setup() first');

    return {
      create: (doc: InferRow<T>) => this.send<T, 'create'>(name, 'create', doc),
      get: (query: { docId: DocId }) => this.send<T, 'get'>(name, 'get', query),
      update: (query: { docId: DocId }, update: Partial<InferRow<T>>) =>
        this.send<T, 'update'>(name, 'update', { query, update }),
      delete: (query: { docId: DocId }) =>
        this.send<T, 'delete'>(name, 'delete', query),

      createMany: (docs: InferRow<T>[]) =>
        this.send<T, 'createMany'>(name, 'createMany', docs),
      getMany: (ids: DocId[]) => this.send<T, 'getMany'>(name, 'getMany', ids),
      updateMany: (
        query: Partial<RowWithId<T>>,
        update: Partial<InferRow<T>>
      ) => this.send<T, 'updateMany'>(name, 'updateMany', { query, update }),
      deleteMany: (query: Partial<RowWithId<T>>) =>
        this.send<T, 'deleteMany'>(name, 'deleteMany', query),

      find: (where: WhereQuery<T>) => this.send<T, 'find'>(name, 'find', where),
    };
  }
}

export const { setup, disconnect, collection } = autobindStatics(Client);
