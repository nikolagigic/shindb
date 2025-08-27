export default class Archive {
  static instance: Archive;
  private file: Deno.FsFile;
  private buf: Uint8Array[] = [];
  private bufSize = 0;
  private readonly FLUSH_BYTES = 1 * 1024; // 64 KB
  private worker: Worker;

  constructor() {
    this.file = Deno.openSync("./archive/records.aof", {
      append: true,
    });

    this.worker = new Worker(
      new URL("../workers/aof-writer.ts", import.meta.url).href,
      { type: "module" }
    );
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new Archive();
    }

    return this.instance;
  }

  public addRecord(content: Uint8Array) {
    this.worker.postMessage({ content });
    // this.buf.push(content);
    // this.bufSize += content.length;
    // if (this.bufSize >= this.FLUSH_BYTES) {
    //   this.flush();
    // }
  }

  private flush() {
    if (this.buf.length === 0) return;

    const joined = new Uint8Array(this.bufSize);
    let offset = 0;
    for (const chunk of this.buf) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }

    this.file.writeSync(joined);
    this.buf = [];
    this.bufSize = 0;
  }

  public close() {
    this.flush();
    this.file.close();
  }
}
