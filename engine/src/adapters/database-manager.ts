// deno-lint-ignore-file no-explicit-any
import type { Table } from "@/types/collection-manager.ts";
import Logger from "../utils/logger.ts";
import { backgroundQueue } from "../services/background-queue.ts";
import { DocId } from "../services/data-store.ts";

type DatabaseManagerAdapterConfig = {
  host?: string;
  port?: number;
};

const defaultDatabaseManagerAdapterConfig: DatabaseManagerAdapterConfig = {
  host: "http://0.0.0.0",
  port: 8000,
};

export default class DatabaseManagerAdapter {
  private static instance: DatabaseManagerAdapter;
  private readonly url: string;

  constructor(config = defaultDatabaseManagerAdapterConfig) {
    this.url = `${config?.host}:${config?.port}`;
  }

  public static setup(config?: DatabaseManagerAdapterConfig) {
    Logger.success("[Database Manager Adapter] Initialised");
    if (!this.instance) {
      this.instance = new DatabaseManagerAdapter(config);
    }

    return this.instance;
  }

  private buildBody(name: string, action: string, payload: any) {
    return {
      method: "POST",
      body: JSON.stringify({
        name,
        action,
        payload,
      }),
    };
  }

  public async openCollection(name: string, table: Table) {
    await fetch(this.url, {
      method: "POST",
      body: JSON.stringify({ name, action: "openCollection", payload: table }),
    });

    return {
      create: async (payload: any) => {
        backgroundQueue.add(async () => {
          try {
            await fetch(this.url, this.buildBody(name, "create", payload));
          } catch (err) {
            Logger.error("Create failed:", err);
          }
        });
      },
      get: async (id: DocId) => {
        try {
          const res = await fetch(
            this.url,
            this.buildBody(name, "get", { id })
          );
          if (res.status === 404) {
            return {};
          }

          return await res.json();
        } catch (err) {
          Logger.error("Get failed:", err);
        }
      },
      update: async (id: DocId, payload: any) => {
        backgroundQueue.add(async () => {
          try {
            await fetch(
              this.url,
              this.buildBody(name, "update", { id, ...payload })
            );
          } catch (err) {
            Logger.error("Background update failed:", err);
          }
        });
      },
      delete: async (id: DocId) => {
        backgroundQueue.add(async () => {
          try {
            await fetch(this.url, this.buildBody(name, "delete", { id }));
          } catch (err) {}
        });
      },
      createMany: async (payload: any[]) => {
        const chunkSize = 5000;
        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);

          backgroundQueue.add(async () => {
            try {
              await fetch(this.url, this.buildBody(name, "createMany", chunk));
            } catch (err) {
              Logger.error("Background createMany failed:", err);
            }
          });
        }
      },
      getMany: async (payload: any[]) => {
        const chunkSize = 5000;
        const res = [];
        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);

          const dbRes = await fetch(
            this.url,
            this.buildBody(name, "getMany", chunk)
          );

          const data = await dbRes.json();
          res.push(data);
        }

        // Merge all objects and convert back to Map
        const resultMap = new Map();
        res.forEach((obj: any) => {
          Object.entries(obj).forEach(([key, value]) => {
            resultMap.set(Number(key), value);
          });
        });

        return resultMap as Map<DocId, any>;
      },
      updateMany: async (data: any[]) => {
        const chunkSize = 5000;
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);

          backgroundQueue.add(async () => {
            try {
              await fetch(this.url, this.buildBody(name, "updateMany", chunk));
            } catch (err) {
              Logger.error("Background createMany failed:", err);
            }
          });
        }
      },
      deleteMany: async (payload: number[]) => {
        const chunkSize = 5000;
        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);

          backgroundQueue.add(async () => {
            try {
              await fetch(this.url, this.buildBody(name, "deleteMany", chunk));
            } catch (err) {
              Logger.error("Background createMany failed:", err);
            }
          });
        }
      },
    };
  }
}
