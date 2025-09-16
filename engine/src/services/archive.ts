import Logger from "../utils/logger.ts";

export default class Archive {
  static instance: Archive;
  private file: Deno.FsFile | null = null;
  private buf: Uint8Array[] = [];
  private bufSize = 0;
  private readonly FLUSH_BYTES = 4 * 1024;

  constructor() {
    // this.file = Deno.openSync("./archive/records.aof", {
    //   append: true,
    //   create: true,
    // });

    Logger.success("Archive set-up");
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new Archive();
    }

    return this.instance;
  }

  public addRecord(content: Uint8Array) {
    this.buf.push(content);
    this.bufSize += content.length;
    if (this.bufSize >= this.FLUSH_BYTES) {
      this.flush();
    }
  }

  private flush() {
    if (this.buf.length === 0) return;

    const joined = new Uint8Array(this.bufSize);
    let offset = 0;
    for (const chunk of this.buf) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }

    this.file?.writeSync(joined);
    this.buf = [];
    this.bufSize = 0;
  }

  public close() {
    this.flush();
    this.file?.close();
  }
}
