// deno-lint-ignore-file no-explicit-any
import DatabaseManager from "../services/database-manager.ts";
import Logger from "../utils/logger.ts";

export default class Server {
  private static instance: Server;
  private readonly server: Deno.HttpServer<Deno.NetAddr>;

  constructor(readonly databaseManager: DatabaseManager) {
    const HOST = Deno.env.get("HOST") || "0.0.0.0";
    const PORT = Number(Deno.env.get("PORT")) || 8000;

    this.server = Deno.serve(
      {
        hostname: HOST,
        port: PORT,
        onListen: () => {
          Logger.success(`[Server] Started`);
        },
      },
      async (req) => {
        if (req.method !== "POST") {
          Logger.error(`[Server] Invalid Method`);
          return new Response(`Invalid Method`, { status: 405 });
        }

        return await this.handleRequest(req);
      }
    );
  }

  public static start(databaseManager: DatabaseManager) {
    if (!this.instance) {
      this.instance = new Server(databaseManager);
    }
    return this.instance;
  }

  private async handleRequest(req: Request): Promise<Response> {
    const { action, collection, payload } = (await req.json()) as {
      action: string;
      collection: string;
      payload: any;
    };

    switch (action) {
      case "openCollection": {
        this.databaseManager.openCollection(name, payload);

        return new Response("ok");
      }
      case "createMany": {
        await this.databaseManager.createMany(name, payload);

        return new Response("ok");
      }
      default:
        return new Response("done");
    }
  }
}
