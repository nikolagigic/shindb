import CollectionManager from "@/controllers/collection-manager.ts";
import Logger from "@/utils/logger.ts";

if (import.meta.main) {
  const collectionManager = CollectionManager.setup();
  const usersModel = collectionManager.sdk.collection("users", {
    username: {
      type: "string",
      modifiers: ["required"],
    },
    age: {
      type: "number",
    },
  });

  await usersModel.create({ username: "john_doe" });
  let user = usersModel.get(0);
  Logger.success("[CREATE]", user);

  usersModel.update(0, { age: 29, username: "jane_doe" });
  user = usersModel.get(0);
  Logger.success("[UPDATE]", user);

  usersModel.delete(0);
  user = usersModel.get(0);
  Logger.success("[DELETE]", user);

  const createdUsers = await usersModel.createMany([
    {
      username: "user_1",
    },
    {
      username: "user_2",
      age: 29,
    },
  ]);
  const ids = createdUsers.data?.ids ?? [];
  let users = usersModel.getMany(ids);
  Logger.success("[CREATE MANY]", users);

  const toUpdateUsers =
    users.data?.map((user) => ({
      id: user.id,
      doc: {
        username: `user_${user.id}${user.id}`,
      },
    })) ?? [];

  usersModel.updateMany(toUpdateUsers);
  users = usersModel.getMany(ids);
  Logger.success("[UPDATE MANY]", users);

  usersModel.deleteMany(ids);
  users = usersModel.getMany(ids);
  Logger.success("[DELETE MANY]", users);

  await usersModel.createMany([
    {
      username: "user_1",
    },
    {
      username: "user_2",
      age: 29,
    },
  ]);

  users = usersModel.find({
    AND: [
      { field: "username", op: { eq: "user_2" } },
      { field: "age", op: { eq: 29 } },
    ],
  });
  Logger.success("[FIND]", users);
}
