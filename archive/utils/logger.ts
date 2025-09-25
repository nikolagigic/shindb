// deno-lint-ignore-file no-explicit-any
class Logger {
  private static prefix(color: string, label: string) {
    return [`\x1b[${color}m${label}\x1b[0m`];
  }

  public static clear(): void {
    console.clear();
  }

  public static info(...msg: any[]): void {
    console.log(...this.prefix("34", "[i]"), ...msg);
  }

  public static success(...msg: any[]): void {
    console.log(...this.prefix("32", "[s]"), ...msg);
  }

  public static warning(...msg: any[]): void {
    console.log(...this.prefix("33", "[w]"), ...msg);
  }

  public static error(...msg: any[]): void {
    console.log(...this.prefix("31", "[e]"), ...msg);
  }
}

export default Logger;
