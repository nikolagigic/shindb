if (import.meta.main) {
  const conn = await Deno.connect({
    hostname: "127.0.0.1",
    port: 7333,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode("Hello world");
  const bytesWritten = await conn.write(data); // 11
}
