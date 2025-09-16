type StaticMethodNames<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

export function autobindStatics<T extends { new (...args: any[]): any }>(
  cls: T
) {
  const bound: any = {};
  const methodNames = Object.getOwnPropertyNames(cls).filter(
    (key) => typeof (cls as any)[key] === "function"
  );

  for (const name of methodNames) {
    bound[name] = (cls as any)[name].bind(cls);
  }

  return bound as Pick<typeof cls, StaticMethodNames<typeof cls>>;
}
