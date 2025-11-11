// deno-lint-ignore-file no-explicit-any
import * as path from "@std/path";
import Logger from "../utils/logger.ts";

type PagePath = string;
type PageTumbstoneCount = number;

class DatabaseManager {
  private static instance: DatabaseManager;
  private readonly collections: Map<
    string,
    {
      schema: string;
      data: string;
      path: string;
      cache: string;
      lastId: number;
    }
  > = new Map();
  private readonly basePath: string;
  private pagesTumbstones: Map<PagePath, PageTumbstoneCount> = new Map();
  private hotPages: string[] = [];

  private constructor() {
    this.basePath = path.join(Deno.cwd(), "data");
    Deno.mkdirSync(this.basePath, { recursive: true });

    for (const entry of Deno.readDirSync(this.basePath)) {
      if (entry.isDirectory) {
        const collection = entry.name;
        this.collections.set(collection, {
          schema: path.join(this.basePath, collection, "schema.sdb"),
          data: path.join(this.basePath, collection, "data.sdb"),
          path: path.join(this.basePath, collection),
          cache: path.join(this.basePath, collection, "cache"),
          lastId: -1, // 0-based IDs, so next insert will become 0
        });
      }
    }

    this.checkTumbstones();
    this.triggerGC();
    Logger.success(`[Database Manager] Started`);
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new DatabaseManager();
    }
    return this.instance;
  }

  private checkTumbstones() {
    for (const [, collection] of this.collections) {
      for (const entry of Deno.readDirSync(collection.path)) {
        const name = entry.name;
        if (!(name.startsWith("data-") && name.endsWith(".sdb"))) continue;

        const filePath = path.join(collection.path, name);

        if (
          Deno.readTextFileSync(filePath).trim().split("\n").length - 1000 >
          200
        ) {
          this.hotPages.push(filePath);
        }
      }
    }
  }

  private bumpPage(page: string) {
    const currentPageTumbstoneCount = this.pagesTumbstones.get(page) ?? 0;
    const nextTumbstoneCount = currentPageTumbstoneCount + 1;
    if (nextTumbstoneCount >= 200) {
      this.hotPages.push(page);
      this.garbageCollector();
    } else {
      this.pagesTumbstones.set(page, nextTumbstoneCount);
    }
  }

  private triggerGC() {
    setTimeout(() => {
      this.garbageCollector();
      this.triggerGC();
    }, 60_000);
  }

  private garbageCollector() {
    try {
      for (const filePath of this.hotPages) {
        let content = "";
        try {
          content = Deno.readTextFileSync(filePath);
        } catch {
          continue; // unreadable file, skip
        }

        const lines = content.trim() ? content.trim().split("\n") : [];
        if (lines.length === 0) continue;

        const kept: string[] = [];
        const seen = new Set<number | string>();
        const deleted = new Set<number | string>();

        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (!line) continue;

          let obj: any;
          try {
            obj = JSON.parse(line);
          } catch {
            // corrupted line -> drop
            continue;
          }

          const id = obj?.id;
          if (id === undefined || id === null) continue;

          if (seen.has(id) || deleted.has(id)) continue;

          if (obj.deleted === true) {
            // latest is a tombstone => purge this id entirely
            deleted.add(id);
            continue;
          }

          kept.push(line); // keep the latest live record only
          seen.add(id);
        }

        kept.reverse(); // restore chronological order for readability

        const newContent = kept.length ? kept.join("\n") + "\n" : "";
        const current = content.endsWith("\n") ? content : content + "\n";

        if (newContent !== current) {
          const tmp = filePath + ".tmp";
          Deno.writeTextFileSync(tmp, newContent);
          try {
            Deno.removeSync(filePath);
          } catch {}
          Deno.renameSync(tmp, filePath);
        } else {
          try {
            Deno.removeSync(filePath + ".tmp");
          } catch {}
        }

        this.pagesTumbstones.set(filePath, 0);
      }
    } catch {
      // best-effort GC — never crash the process
    }

    this.hotPages = [];
  }

  public async openCollection(name: string, schema: any) {
    const collectionPath = path.join(this.basePath, name);
    await Deno.mkdir(collectionPath, { recursive: true });

    const schemaPath = path.join(collectionPath, "schema.sdb");
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

    // Find last data page file
    let lastId = -1;
    try {
      const files: string[] = [];
      for await (const entry of Deno.readDir(collectionPath)) {
        if (
          entry.isFile &&
          entry.name.startsWith("data-") &&
          entry.name.endsWith(".sdb")
        ) {
          files.push(entry.name);
        }
      }

      if (files.length > 0) {
        const lastFile = files.sort().at(-1)!; // highest data page
        const content = await Deno.readTextFile(
          path.join(collectionPath, lastFile)
        );
        const lastLine = content.trim().split("\n").pop();
        if (lastLine) {
          const rec = JSON.parse(lastLine);
          lastId = Number(rec.id) ?? -1;
        }
      }
    } catch {
      // empty collection fine
    }

    this.collections.set(name, {
      schema: schemaPath,
      data: path.join(collectionPath, "data-0.sdb"), // just default reference
      path: collectionPath,
      cache: cachePath,
      lastId,
    });
  }

  /** Create many records at once, auto-generate 0-based IDs */
  public async createMany(name: string, records: any[]) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    const ids: number[] = [];

    for (const r of records) {
      const newId = ++collection.lastId;
      ids.push(newId);

      // figure out which file this id belongs to
      const fileIndex = Math.floor(newId / 1000);
      const dataFile = path.join(
        path.dirname(collection.data),
        `data-${fileIndex}.sdb`
      );

      const line = JSON.stringify({ id: newId, data: r, ts: Date.now() });
      await Deno.writeTextFile(dataFile, line + "\n", { append: true });
    }

    return ids;
  }

  public async getMany(name: string, ids: number[]) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    // Group ids by which data file they belong to
    const groups = new Map<number, number[]>();
    for (const id of ids) {
      const fileIndex = Math.floor(id / 1000);
      if (!groups.has(fileIndex)) groups.set(fileIndex, []);
      groups.get(fileIndex)!.push(id);
    }

    const results = new Map();
    for (const [fileIndex, groupIds] of groups.entries()) {
      const dataFile = path.join(
        path.dirname(collection.data),
        `data-${fileIndex}.sdb`
      );

      try {
        const file = await Deno.readTextFile(dataFile);
        const lines = file.trim().split("\n");

        const idSet = new Set(groupIds);
        for (let i = lines.length - 1; i >= 0 && idSet.size > 0; i--) {
          const rec = JSON.parse(lines[i]);
          if (idSet.has(rec.id)) {
            if (!rec.deleted) results.set(rec.id, rec);
            idSet.delete(rec.id);
          }
        }
      } catch {
        // skip missing file
      }
    }

    return results;
  }

  public async updateMany(name: string, records: any[]) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    records.forEach(async (record) => {
      const previousRecord = await this.get(name, record.id);
      const oldFileIndex = Math.floor(record.id / 1000);
      const oldFile = path.join(
        path.dirname(collection.data),
        `data-${oldFileIndex}.sdb`
      );
      const tombstone = JSON.stringify({
        id: record.id,
        deleted: true,
        ts: Date.now(),
      });
      await Deno.writeTextFile(oldFile, tombstone + "\n", { append: true });
      this.bumpPage(oldFile);

      // Append new version
      const newId = record.id;
      const newFileIndex = Math.floor(newId / 1000);
      const newFile = path.join(
        path.dirname(collection.data),
        `data-${newFileIndex}.sdb`
      );

      const { id: _, ...rest } = record;

      const line = JSON.stringify({
        id: newId,
        data: { ...previousRecord.data, ...rest.doc },
        ts: Date.now(),
      });
      await Deno.writeTextFile(newFile, line + "\n", { append: true });

      return newId;
    });
  }

  public async deleteMany(name: string, ids: number[]) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    ids.forEach(async (id) => {
      const fileIndex = Math.floor(id / 1000);
      const dataFile = path.join(
        path.dirname(collection.data),
        `data-${fileIndex}.sdb`
      );

      const tombstone = JSON.stringify({ id, deleted: true, ts: Date.now() });
      await Deno.writeTextFile(dataFile, tombstone + "\n", { append: true });
      this.bumpPage(dataFile);
    });
  }

  public async find(name: string, where: any) {
    const records = await this.readAllFromArchive(name);

    const results = records.filter((record) => {
      const match = this.evaluateWhere(where, record.data ?? record);
      return match;
    });

    return results;
  }

  private evaluateWhere(where: any, record: any): boolean {
    if ("AND" in where)
      return where.AND.every((w: any) => this.evaluateWhere(w, record));
    if ("OR" in where)
      return where.OR.some((w: any) => this.evaluateWhere(w, record));

    const { field, op } = where;
    const value = record[field];

    if (op.eq !== undefined && value != op.eq) return false; // loose equality fixes "1" vs 1
    if (op.gt !== undefined && !(value > op.gt)) return false;
    if (op.gte !== undefined && !(value >= op.gte)) return false;
    if (op.lt !== undefined && !(value < op.lt)) return false;
    if (op.lte !== undefined && !(value <= op.lte)) return false;
    if (op.in && !op.in.includes(value)) return false;
    if (op.nin && op.nin.includes(value)) return false;
    if (
      op.contains &&
      typeof value === "string" &&
      !value.includes(op.contains)
    )
      return false;
    if (op.overlap && !op.overlap.some((v: any) => value?.includes?.(v)))
      return false;

    if (op.not && this.evaluateWhere({ field, op: op.not } as any, record))
      return false;

    return true;
  }

  private async readAllFromArchive(name: string) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    // Just take the folder that already holds data-*.sdb files
    const archiveDir = path.dirname(collection.data);
    const records: any[] = [];

    try {
      for await (const entry of Deno.readDir(archiveDir)) {
        if (
          !entry.isFile ||
          !entry.name.startsWith("data-") ||
          !entry.name.endsWith(".sdb")
        )
          continue;
        const filePath = path.join(archiveDir, entry.name);

        try {
          const file = await Deno.readTextFile(filePath);
          const lines = file.trim().split("\n");

          for (const line of lines) {
            try {
              const rec = JSON.parse(line);
              if (!rec.deleted) records.push(rec);
            } catch {
              console.warn(`Corrupted line in ${filePath}`);
            }
          }
        } catch (err) {
          console.error(`Failed to read ${filePath}:`, err);
        }
      }
    } catch (err) {
      console.error(`Failed to read archive dir for ${name}:`, err);
    }

    return records;
  }

  /** Create single record, auto-generate ID */
  public async create(name: string, record: any) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    const id = ++collection.lastId;
    const fileIndex = Math.floor(id / 1000);
    const dataFile = path.join(
      path.dirname(collection.data),
      `data-${fileIndex}.sdb`
    );

    const line = JSON.stringify({ id, data: record, ts: Date.now() });
    await Deno.writeTextFile(dataFile, line + "\n", { append: true });

    return id;
  }

  public async get(name: string, id: number) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    const fileIndex = Math.floor(id / 1000);
    const dataFile = path.join(
      path.dirname(collection.data),
      `data-${fileIndex}.sdb`
    );

    try {
      const file = await Deno.readTextFile(dataFile);
      const lines = file.trim().split("\n");

      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i]) continue;
        const rec = JSON.parse(lines[i]);
        if (rec.id === id) {
          if (rec.deleted) return null;
          return rec;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  public async update(name: string, record: any) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);
    const previousRecord = await this.get(name, record.id);

    // Tombstone old record
    const oldFileIndex = Math.floor(record.id / 1000);
    const oldFile = path.join(
      path.dirname(collection.data),
      `data-${oldFileIndex}.sdb`
    );
    const tombstone = JSON.stringify({
      id: record.id,
      deleted: true,
      ts: Date.now(),
    });
    await Deno.writeTextFile(oldFile, tombstone + "\n", { append: true });
    this.bumpPage(oldFile);

    // Append new version
    const newId = record.id;
    const newFileIndex = Math.floor(newId / 1000);
    const newFile = path.join(
      path.dirname(collection.data),
      `data-${newFileIndex}.sdb`
    );

    const { id: _, ...rest } = record;
    const line = JSON.stringify({
      id: newId,
      data: { ...previousRecord.data, ...rest },
      ts: Date.now(),
    });
    await Deno.writeTextFile(newFile, line + "\n", { append: true });

    return newId;
  }

  public async delete(name: string, id: number) {
    const collection = this.collections.get(name);
    if (!collection) throw new Error(`Collection ${name} not open`);

    const fileIndex = Math.floor(id / 1000);
    const dataFile = path.join(
      path.dirname(collection.data),
      `data-${fileIndex}.sdb`
    );

    const tombstone = JSON.stringify({ id, deleted: true, ts: Date.now() });
    await Deno.writeTextFile(dataFile, tombstone + "\n", { append: true });
    this.bumpPage(dataFile);
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
