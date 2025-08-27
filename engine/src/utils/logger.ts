// deno-lint-ignore-file no-explicit-any

class Logger {
  public static clear() {
    console.clear();
  }

  public static info(msg: any | any[]) {
    console.log(`\x1b[34m[i]\x1b[0m ${msg}`);
  }

  public static success(msg: any | any[]) {
    console.log(`\x1b[32m[s]\x1b[0m ${msg}`);
  }

  public static warning(msg: any | any[]) {
    console.log(`\x1b[33m[w]\x1b[0m ${msg}`);
  }

  public static error(msg: any | any[]) {
    console.log(`\x1b[31m[e]\x1b[0m ${msg}`);
  }
}

export default Logger;
