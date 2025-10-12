import CollectionManager from "@/controllers/collection-manager.ts";
import Logger from "@/utils/logger.ts";
import { profileAsync } from "@/services/profile.ts";
import { loremIpsum } from "@/utils/lorem-ipsum.ts";

if (import.meta.main) {
  // Configure memory limits for production use
  const memoryConfig = {
    maxRSSBytes: 4 * 1024 * 1024 * 1024, // 2GB RSS limit (more reasonable for 100k users)
    maxHeapBytes: 4 * 1024 * 1024 * 1024, // 1GB heap limit
    evictionPolicy: "lru" as const,
    evictionThreshold: 0.8, // Trigger eviction at 80%
    checkInterval: 2000, // Check every 2 seconds (less aggressive)
  };

  const collectionManager = CollectionManager.setup(memoryConfig);

  // Start memory monitoring
  const usersModel = await collectionManager.sdk.collection("users", {
    username: {
      type: "string",
      modifiers: ["required"],
    },
    age: {
      type: "number",
    },
    bio: {
      type: "string",
    },
  });

  const NUM_OF_USERS = 1_000_000;

  // const usersFromArray = Array.from({ length: NUM_OF_USERS }, (_, i) => ({
  //   username: `user ${i}`,
  //   age: i,
  //   bio: loremIpsum(256),
  // }));

  // const _userIds = usersFromArray.map(
  //   (u) => Number(u.username.split(" ").at(1))!
  // );

  await profileAsync(`CRUD Testing`, async () => {
    // await usersModel.createMany(usersFromArray);
    // await usersModel.create({
    //   username: "user 1",
    //   age: 1337,
    //   bio: "user 1 bio",
    // });
    Logger.success("[GET]", await usersModel.get(1));
  });
}
