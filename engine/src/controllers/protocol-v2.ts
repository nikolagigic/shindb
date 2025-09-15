// deno-lint-ignore-file no-explicit-any
import CollectionManager from '@/controllers/collection-manager.ts';
import Logger from '../utils/logger.ts';
import { decode, encode } from '@std/msgpack';

export default class ProtocolV2 {
  static instance: ProtocolV2;
  private readonly listener: Deno.Listener;
  private isListening = false;
  private readonly maxMessageSize = 100 * 1024 * 1024; // 100MB max per message

  static async start(collection: CollectionManager) {
    if (!this.instance) {
      this.instance = new ProtocolV2(collection);
      await this.instance.listen();
    }
    return this.instance;
  }

  constructor(readonly collectionManager: CollectionManager) {
    this.listener = Deno.listen({
      hostname: '127.0.0.1',
      port: 7333,
    });
    Logger.success('Protocol V2 running');
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
      while (true) {
        // Read message length (4 bytes)
        const lengthBuffer = await this.readExactly(connection, 4);
        const messageLength = new DataView(lengthBuffer.buffer).getUint32(
          0,
          false
        );

        if (messageLength === 0) {
          continue;
        }

        if (messageLength > this.maxMessageSize) {
          throw new Error(
            `Message too large: ${messageLength} bytes (max: ${this.maxMessageSize})`
          );
        }

        Logger.info(`Reading message: ${messageLength} bytes`);

        // Read message data in chunks to avoid timeouts
        const messageData = await Promise.race([
          this.readMessageData(connection, messageLength),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Message read timeout')), 30000)
          ),
        ]);

        // Process message
        const result = await this.processMessage(messageData);

        // Send response
        await this.sendResponse(connection, result);

        Logger.success(`Processed message: ${messageLength} bytes`);
      }
    } catch (e: any) {
      if (e.message === 'Connection closed') {
        Logger.info('Client disconnected');
      } else {
        Logger.error(`Connection error: ${e.message}`);
      }
    } finally {
      try {
        connection.close();
      } catch {
        // Connection already closed
      }
    }
  }

  private async readMessageData(
    conn: Deno.Conn,
    totalBytes: number
  ): Promise<Uint8Array> {
    const buffer = new Uint8Array(totalBytes);
    let totalRead = 0;
    let readCount = 0;
    const chunkSize = 64 * 1024; // 64KB chunks

    Logger.info(`readMessageData: expecting ${totalBytes} bytes`);

    while (totalRead < totalBytes) {
      const remainingBytes = totalBytes - totalRead;
      const currentChunkSize = Math.min(chunkSize, remainingBytes);

      const chunk = await conn.read(
        buffer.subarray(totalRead, totalRead + currentChunkSize)
      );
      if (chunk === null) {
        throw new Error('Connection closed');
      }
      totalRead += chunk;
      readCount++;

      if (readCount % 10 === 0 || totalRead === totalBytes) {
        Logger.info(
          `Progress: ${totalRead}/${totalBytes} bytes (${Math.round(
            (totalRead / totalBytes) * 100
          )}%)`
        );
      }
    }

    Logger.success(
      `readMessageData: completed ${totalBytes} bytes in ${readCount} reads`
    );
    return buffer;
  }

  private async readExactly(
    conn: Deno.Conn,
    bytes: number
  ): Promise<Uint8Array> {
    const buffer = new Uint8Array(bytes);
    let totalRead = 0;

    while (totalRead < bytes) {
      const chunk = await conn.read(buffer.subarray(totalRead));
      if (chunk === null) {
        throw new Error('Connection closed');
      }
      totalRead += chunk;
    }

    return buffer;
  }

  private async processMessage(messageData: Uint8Array): Promise<any> {
    try {
      const { action, collection, payload } = decode(messageData) as {
        action: string;
        collection: string;
        payload: any;
      };

      Logger.info(`Processing action: ${action} on collection: ${collection}`);

      switch (action) {
        case 'create': {
          const res = await this.collectionManager.mapManager.set(
            collection,
            payload
          );
          return res;
        }
        case 'get': {
          const res = await this.collectionManager.mapManager.get(
            collection,
            payload.docId
          );
          return res;
        }
        case 'update': {
          const { query, update } = payload;
          const res = await this.collectionManager.mapManager.update(
            collection,
            query.docId,
            update
          );
          return res;
        }
        case 'delete': {
          const res = await this.collectionManager.mapManager.delete(
            collection,
            payload.docId
          );
          return res;
        }
        case 'createMany': {
          const res = await this.collectionManager.mapManager.setMany(
            collection,
            payload
          );
          return res;
        }
        case 'getMany': {
          const res = await this.collectionManager.mapManager.getMany(
            collection,
            payload
          );
          return res;
        }
        case 'updateMany': {
          const res = await this.collectionManager.mapManager.updateMany(
            collection,
            payload
          );
          return res;
        }
        case 'find': {
          const res = await this.collectionManager.mapManager.find(
            collection,
            payload
          );
          return res;
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (e: any) {
      Logger.error(`Error processing message: ${e.message}`);
      throw e;
    }
  }

  private async sendDataInChunks(
    connection: Deno.Conn,
    data: Uint8Array
  ): Promise<void> {
    const chunkSize = 64 * 1024; // 64KB chunks
    let offset = 0;

    while (offset < data.length) {
      const remainingBytes = data.length - offset;
      const currentChunkSize = Math.min(chunkSize, remainingBytes);
      const chunk = data.subarray(offset, offset + currentChunkSize);

      await connection.write(chunk);
      offset += currentChunkSize;

      // Small delay to allow TCP flow control
      if (offset < data.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  private async sendResponse(connection: Deno.Conn, response: any) {
    try {
      const safe =
        response instanceof Map ? Object.fromEntries(response) : response;
      const encoded = encode(safe) as Uint8Array;

      // Send length prefix
      const lengthBuffer = new Uint8Array(4);
      new DataView(lengthBuffer.buffer).setUint32(0, encoded.length, false);
      await connection.write(lengthBuffer);

      // Send response data in chunks
      Logger.info(`Sending response: ${encoded.length} bytes`);
      await this.sendDataInChunks(connection, encoded);
      Logger.success(`Sent response: ${encoded.length} bytes`);
    } catch (e: any) {
      Logger.error(`Error sending response: ${e.message}`);
      throw e;
    }
  }
}
