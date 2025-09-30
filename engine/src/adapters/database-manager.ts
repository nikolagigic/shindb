// deno-lint-ignore-file no-explicit-any
import type { Table } from "@/types/collection-manager.ts";
import Logger from "../utils/logger.ts";
import { backgroundQueue } from "../services/background-queue.ts";

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

  public async openCollection(name: string, table: Table) {
    const res = await fetch(this.url, {
      method: "POST",
      body: JSON.stringify({ name, action: "openCollection", payload: table }),
    });

    return {
      createMany: async (payload: any[]) => {
        const chunkSize = 5000;
        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);

          backgroundQueue.add(async () => {
            try {
              await fetch(this.url, {
                method: "POST",
                body: JSON.stringify({
                  name,
                  action: "createMany",
                  payload: chunk,
                }),
              });
            } catch (err) {
              console.error("Background createMany failed:", err);
            }
          });
        }
      },
    };
  }
}
