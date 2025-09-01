interface User {
  name: string;
  username: string;
  age: number;
  bio: string;
}

if (import.meta.main) {
  const connection = await Deno.connect({
    hostname: "127.0.0.1",
    port: 7333,
  });

  const encoder = new TextEncoder();

  const sendPayload = async (collection: string, args: User) => {
    const payload = JSON.stringify({ collection, data: args });
    await connection.write(encoder.encode(payload + "\n"));
  };

  const totalPrefill = 1_000_000;

  console.log(`Prefilling ${totalPrefill.toLocaleString()} entries...`);
  for (let n = 0; n < totalPrefill; n++) {
    await sendPayload("users", {
      name: `User ${n}`,
      age: n,
      username: `username_${n}`,
      bio: randomPayload(),
    });
  }
  console.log("Prefill complete. Starting benchmark...");

  let n = totalPrefill;
  const start = performance.now();

  while (true) {
    await sendPayload("users", {
      name: `User ${n}`,
      age: n,
      username: `username_${n}`,
      bio: randomPayload(),
    });

    n++;

    if (n % 100_000 === 0) {
      const elapsed = performance.now() - start;
      const opsPerSec = (100_000 / (elapsed / 1000)).toFixed(0);
      console.log(
        `Inserted ${n.toLocaleString()} entries | ${opsPerSec} ops/sec (last 100k)`
      );
    }
  }
}

function randomLorem(size: number): string {
  const words =
    "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(
      " "
    );

  let out = "";
  while (out.length < size) {
    out += words[Math.floor(Math.random() * words.length)] + " ";
  }
  return out.slice(0, size);
}

function randomPayload(): string {
  const targetSize = Math.floor(768 + Math.random() * (1024 - 768));
  return randomLorem(targetSize);
}
