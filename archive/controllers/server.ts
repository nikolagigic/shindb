// deno-lint-ignore-file no-explicit-any
import DatabaseManager from '../services/database-manager.ts';
import Logger from '../utils/logger.ts';

export default class Server {
  private static instance: Server;
  private readonly server: Deno.HttpServer<Deno.NetAddr>;

  constructor(readonly databaseManager: DatabaseManager) {
    const HOST = Deno.env.get('HOST') || '0.0.0.0';
    const PORT = Number(Deno.env.get('PORT')) || 8000;

    this.server = Deno.serve(
      {
        hostname: HOST,
        port: PORT,
        onListen: () => {
          Logger.success(`[Server] Started`);
        },
      },
      async (req) => {
        if (req.method !== 'POST') {
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
    const { action, name, payload } = (await req.json()) as {
      action: string;
      name: string;
      payload: any;
    };

    switch (action) {
      case 'openCollection': {
        this.databaseManager.openCollection(name, payload);

        return new Response('ok');
      }
      case 'create': {
        await this.databaseManager.create(name, payload);

        return new Response('ok');
      }
      case 'get': {
        const res = await this.databaseManager.get(name, payload.id);
        if (!res) {
          return new Response('not found', { status: 404 });
        }
        const data = JSON.stringify({ id: res.id, ...res.data });

        return new Response(data);
      }
      case 'update': {
        await this.databaseManager.update(name, payload);

        return new Response('ok');
      }
      case 'delete': {
        await this.databaseManager.delete(name, payload.id);

        return new Response('ok');
      }
      case 'createMany': {
        await this.databaseManager.createMany(name, payload);

        return new Response('ok');
      }
      case 'getMany': {
        const res = await this.databaseManager.getMany(name, payload);
        if (!res) {
          return new Response('not found', { status: 404 });
        }

        // Convert Map to object for JSON serialization
        const data = JSON.stringify(Object.fromEntries(res));

        return new Response(data);
      }
      case 'updateMany': {
        await this.databaseManager.updateMany(name, payload);

        return new Response('ok');
      }
      case 'deleteMany': {
        await this.databaseManager.deleteMany(name, payload.ids);

        return new Response('ok');
      }
      default:
        return new Response('done');
    }
  }
}
