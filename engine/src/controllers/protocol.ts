import CollectionManager from '@/controllers/collection-manager.ts';
import Logger from '../utils/logger.ts';

const MAX_FRAME_BYTES = 256_000;

export default class Protocol {
  static instance: Protocol;
  private readonly listener: Deno.Listener;
  private isListening = false;

  static async start(collection: CollectionManager) {
    if (!this.instance) {
      this.instance = new Protocol(collection);
      await this.instance.listen();
    }

    return this.instance;
  }

  constructor(readonly collectionManager: CollectionManager) {
    this.listener = Deno.listen({
      hostname: '127.0.0.1',
      port: 7333,
    });

    Logger.success('Protocol running');
  }

  private async listen() {
    if (this.isListening) return;
    this.isListening = true;

    for await (const conn of this.listener) {
      this.handleConnection(conn);
    }
  }

  private async handleConnection(connection: Deno.Conn) {
    try {
      // read total length
      const lengthBuffer = new Uint8Array(4);
      await this.readExact(connection, lengthBuffer);
      const totalLength = new DataView(lengthBuffer.buffer).getUint32(0, false);

      Logger.success(`Expected total length: ${totalLength} bytes`);
      Logger.warning(`====`);

      // Handle chunked data reception
      const data = new Uint8Array(totalLength);
      let received = 0;
      let chunkCount = 0;

      // Read the first chunk (this comes after the length prefix in the first frame)
      const firstChunkLength = Math.min(MAX_FRAME_BYTES, totalLength);
      const firstChunk = new Uint8Array(firstChunkLength);
      await this.readExact(connection, firstChunk);
      data.set(firstChunk, received);
      received += firstChunkLength;
      chunkCount++;
      Logger.success(`[${chunkCount}] Read first chunk: ${received} bytes`);

      // Read remaining data in smaller chunks to avoid timeouts
      while (received < totalLength) {
        const remainingBytes = totalLength - received;
        const chunkSize = Math.min(64 * 1024, remainingBytes); // 64KB chunks
        Logger.info(
          `Reading chunk ${
            chunkCount + 1
          }: expecting ${chunkSize} bytes, remaining: ${remainingBytes}`
        );
        const chunk = new Uint8Array(chunkSize);
        await this.readExact(connection, chunk);
        data.set(chunk, received);
        received += chunkSize;
        chunkCount++;
        Logger.success(
          `[${chunkCount}] Read chunk: ${received} bytes (chunk size: ${chunkSize})`
        );
      }

      Logger.success(
        `Got full payload: ${data.length} bytes in ${chunkCount} chunks`
      );
    } catch (e) {
      Logger.error(e);
    }
  }

  private async readExact(conn: Deno.Conn, buf: Uint8Array) {
    let read = 0;
    let count = 0;
    Logger.info(`readExact: expecting ${buf.length} bytes`);
    while (read < buf.length) {
      const n = await conn.read(buf.subarray(read));
      if (n === null) {
        throw new Error(
          `Connection closed: wanted ${buf.length}, got only ${read}`
        );
      }
      read += n;
      count++;
      Logger.success(`[${count}] Read: ${read} bytes`);

      // Add timeout protection for large reads
      if (count % 10 === 0) {
        Logger.info(
          `Progress: ${read}/${buf.length} bytes (${Math.round(
            (read / buf.length) * 100
          )}%)`
        );
      }
    }
    // optional debug, but say what actually happened:
    Logger.success(`readExact filled ${buf.length} bytes`);
  }

  // private async handleConnection(connection: Deno.Conn) {
  //   try {
  //     const lengthBuffer = new Uint8Array(4);
  //     while (true) {
  //       try {
  //         await this.readExact(connection, lengthBuffer);
  //       } catch {
  //         break; // connection closed
  //       }

  //       const msgLength = new DataView(lengthBuffer.buffer).getUint32(0, false);

  //       const msgBuffer = new Uint8Array(msgLength);
  //       await this.readExact(connection, msgBuffer);

  //       const { action, collection, payload } = decode(msgBuffer) as {
  //         action: string;
  //         collection: string;
  //         payload: any;
  //       };

  //       switch (action) {
  //         case "create": {
  //           const res = await this.collectionManager.mapManager.set(
  //             collection,
  //             payload
  //           );
  //           await this.returnResponse(connection, res);
  //           break;
  //         }
  //         case "get": {
  //           const res = await this.collectionManager.mapManager.get(
  //             collection,
  //             payload.docId
  //           );
  //           await this.returnResponse(connection, res);
  //           break;
  //         }
  //         case "update": {
  //           const { query, update } = payload;
  //           const res = await this.collectionManager.mapManager.update(
  //             collection,
  //             query.docId,
  //             update
  //           );
  //           await this.returnResponse(connection, res);
  //           break;
  //         }
  //         case "delete": {
  //           const res = await this.collectionManager.mapManager.delete(
  //             collection,
  //             payload.docId
  //           );
  //           await this.returnResponse(connection, res);
  //           break;
  //         }
  //         case "createMany": {
  //           const res = await this.collectionManager.mapManager.setMany(
  //             collection,
  //             payload
  //           );
  //           await this.returnResponse(connection, res);
  //           break;
  //         }
  //         case "getMany": {
  //           const res = await this.collectionManager.mapManager.getMany(
  //             collection,
  //             payload
  //           );
  //           await this.returnResponse(connection, res);
  //           break;
  //         }
  //         case "updateMany": {
  //           const res = await this.collectionManager.mapManager.updateMany(
  //             collection,
  //             payload
  //           );
  //           await this.returnResponse(connection, res);
  //           break;
  //         }
  //         case "find": {
  //           const res = await this.collectionManager.mapManager.find(
  //             collection,
  //             payload
  //           );
  //           await this.returnResponse(connection, res);
  //           break;
  //         }
  //         default:
  //           console.log(action, collection, payload);
  //       }
  //     }
  //   } finally {
  //     connection.close();
  //   }
  // }

  // private async returnResponse(connection: Deno.Conn, res: any) {
  //   const safe = res instanceof Map ? Object.fromEntries(res) : res;
  //   const encoded = encode(safe) as Uint8Array;
  //   const frame = new Uint8Array(4 + encoded.length);
  //   new DataView(frame.buffer).setUint32(0, encoded.length, false);
  //   frame.set(encoded, 4);
  //   await connection.write(frame);
  // }
}
