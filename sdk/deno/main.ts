import { Client } from "./src/controllers/client.ts";

if (import.meta.main) {
  const { collection } = await Client.setup();
}
