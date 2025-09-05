import CollectionManager from "@/controllers/collection-manager.ts";
import Logger from "../utils/logger.ts";

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
      hostname: "127.0.0.1",
      port: 7333,
    });

    Logger.success("Protocol running");
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
      const buffer = new Uint8Array(1024);
      while (true) {
        const bytesRead = await connection.read(buffer);
        if (bytesRead === null) break;
        const data = buffer.subarray(0, bytesRead);

        await this.collectionManager.mapManager.set("users", data);
      }
    } catch (error: unknown) {
      Logger.error(error);
    } finally {
      connection.close();
    }
  }
}
