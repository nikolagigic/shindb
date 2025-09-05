import { collection, setup } from "@shindb/sdk";

if (import.meta.main) {
  await setup();

  const users = collection("users", {});
}
