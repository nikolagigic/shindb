import { autobindStatics } from "../utils/autobind-statics.ts";

export type Table = {
  [name: string]: {
    type: "string" | "number" | "boolean";
    modifiers?: ("unique" | "required" | "indexed")[];
  };
};

export class Client {
  private static connection: Deno.TcpConn | null = null;

  static async setup(
    options: Deno.ConnectOptions = { hostname: "127.0.0.1", port: 7333 }
  ) {
    if (this.connection) return;
    this.connection = await Deno.connect(options);
  }

  static async disconnect() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }

  static collection(name: string, table: Table) {
    if (!this.connection) throw new Error("Call setup() first");
  }
}

export const { setup, disconnect, collection } = autobindStatics(Client);
