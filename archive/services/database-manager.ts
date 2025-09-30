import * as path from "@std/path";
import Logger from "../utils/logger.ts";

class DatabaseManager {
  private static instance: DatabaseManager;
  private readonly collections: Map<
    string,
    {
      schema: string;
      data: string;
      cache: string;
      lastId: number;
    }
  > = new Map();
  private readonly basePath: string;

  private constructor() {
    this.basePath = path.join(Deno.cwd(), "data");
    Deno.mkdirSync(this.basePath, { recursive: true });

    for (const entry of Deno.readDirSync(this.basePath)) {
      if (entry.isDirectory) {
        const collection = entry.name;
        this.collections.set(collection, {
          schema: path.join(this.basePath, collection, "schema.sdb"),
          data: path.join(this.basePath, collection, "data.sdb"),
          cache: path.join(this.basePath, collection, "cache"),
          lastId: -1, // 0-based IDs, so next insert will become 0
        });
      }
    }
    Logger.success(`[Database Manager] Started`);
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new DatabaseManager();
    }
    return this.instance;
  }

  /** Create or open a collection with schema checksum check */
  public async openCollection(name: string, schema: any) {
    const collectionPath = path.join(this.basePath, name);
    await Deno.mkdir(collectionPath, { recursive: true });

    const schemaPath = path.join(collectionPath, "schema.sdb");
    const dataPath = path.join(collectionPath, "data.sdb");
    const cachePath = path.join(collectionPath, "cache");
    await Deno.mkdir(cachePath, { recursive: true });

    let needsUpdate = false;
    try {
      const stored = await Deno.readTextFile(schemaPath);
      const storedHash = await this.checksum(stored);
      const incomingHash = await this.checksum(JSON.stringify(schema));
      if (storedHash !== incomingHash) needsUpdate = true;
    } catch {
      needsUpdate = true;
    }

    if (needsUpdate) {
      await Deno.writeTextFile(schemaPath, JSON.stringify(schema, null, 2));
    }

    // Initialize lastId from last line in data.sdb
    let lastId = -1;
    try {
      const file = await Deno.readTextFile(dataPath);
      const lastLine = file.trim().split("\n").pop();
      if (lastLine) {
        const rec = JSON.parse(lastLine);
        lastId = Number(rec.id) ?? -1;
      }
    } catch {
      // empty collection is fine
    }

    this.collections.set(name, {
      schema: schemaPath,
      data: dataPath,
      cache: cachePath,
      lastId,
    });

    return {
      createMany: (records: any[]) => this.createMany(name, records),
    };
  }

  /** Append many records at once, auto-generate 0-based IDs */
  public async createMany(name: string, records: any[]) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    const lines: string[] = [];
    const ids: number[] = [];

    for (const r of records) {
      const newId = ++collection.lastId;
      ids.push(newId);
      lines.push(JSON.stringify({ id: newId, data: r, ts: Date.now() }));
    }

    await Deno.writeTextFile(collection.data, lines.join("\n") + "\n", {
      append: true,
    });

    return ids;
  }

  /** Append single record, auto-generate ID */
  public async append(name: string, record: any) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    const id = ++collection.lastId;
    const line = JSON.stringify({ id, data: record, ts: Date.now() });

    await Deno.writeTextFile(collection.data, line + "\n", { append: true });

    return id;
  }

  private async checksum(input: string) {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

export default DatabaseManager;
