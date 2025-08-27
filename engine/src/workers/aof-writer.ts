// @ts-ignore: lack of types in deno
self.onmessage = (e: MessageEvent) => {
  const { content } = e.data;

  Deno.writeFileSync("./archive/records.aof", content);
};
