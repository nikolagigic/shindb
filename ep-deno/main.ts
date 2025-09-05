import { collection, setup } from "@shindb/sdk";

if (import.meta.main) {
  await setup();

  const usersModel = collection("users", {
    username: {
      type: "string",
      modifiers: ["required"],
    },
    age: {
      type: "number",
    },
  });

  const user = await usersModel.get({ docId: 123 });
  const users = await usersModel.getMany({ username: "asdasd" });
  const createdUser = await usersModel.create({ age: 123, username: "asdasd" });
  const createdUsers = await usersModel.createMany([
    { username: "asdasd", age: 123 },
  ]);
  const deletedUser = await usersModel.delete({ docId: 123 });
  const deletedUsers = await usersModel.deleteMany({ username: "asdasd" });
  const updatedUser = await usersModel.update({ docId: 123 }, { age: 123 });
  const updatedUsers = await usersModel.updateMany(
    { username: "asdasd" },
    { age: 123 }
  );
}
