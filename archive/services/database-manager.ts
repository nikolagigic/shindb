import * as path from "@std/path";
import Logger from "../utils/logger.ts";

export default class DatabaseManager {
  private static instance: DatabaseManager;
  private readonly collections: Map<string, Deno.FsFile> = new Map();
  //   private readonly dbFile: Deno.FsFile;

  constructor() {
    const PATH = path.format({
      root: "/",
      dir: Deno.cwd(),
      base: "data",
    });

    for (const de of Deno.readDirSync(PATH)) {
      const collectionPath = `${PATH}/${de.name}`;
      this.collections.set(
        this.getFileName(de.name),
        Deno.openSync(collectionPath, { append: true, read: true })
      );
    }

    Logger.success(`[Database Manager] Started`);
  }

  private getFileName(fullName: string) {
    return fullName.replace(".sdb", "");
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new DatabaseManager();
    }

    return this.instance;
  }

  //    TODO:
  //    1. Store data in files named after collections
  //        - First line of collection file is checksum of collection schema
  //        - Rest is serialised data (still to come up with the right approach)
  //    2. Append only, never replace
  //    3. Grep for last known record of the fetched ID
  //    4. Compress later - delete old records of the repeating IDs, keep only the last created one
  //    5. Complex queries should be cached into separate files cleared by TTL
}
