import CollectionManager from '@/controllers/collection-manager.ts';
import Logger from '@/utils/logger.ts';
import { profileAsync } from '@/services/profile.ts';
import { loremIpsum } from '@/utils/lorem-ipsum.ts';

if (import.meta.main) {
  // Configure memory limits for production use
  const memoryConfig = {
    maxRSSBytes: 4 * 1024 * 1024 * 1024, // 2GB RSS limit (more reasonable for 100k users)
    maxHeapBytes: 4 * 1024 * 1024 * 1024, // 1GB heap limit
    evictionPolicy: 'lru' as const,
    evictionThreshold: 0.8, // Trigger eviction at 80%
    checkInterval: 2000, // Check every 2 seconds (less aggressive)
  };

  const collectionManager = CollectionManager.setup(memoryConfig);

  // Start memory monitoring
  const usersModel = collectionManager.sdk.collection('users', {
    username: {
      type: 'string',
      modifiers: ['required'],
    },
    age: {
      type: 'number',
    },
    bio: {
      type: 'string',
    },
  });

  // await usersModel.create({ username: "john_doe" });
  // let user = usersModel.get(0);
  // Logger.success("[CREATE]", user);

  // usersModel.update(0, { age: 29, username: "jane_doe" });
  // user = usersModel.get(0);
  // Logger.success("[UPDATE]", user);

  // usersModel.delete(0);
  // user = usersModel.get(0);
  // Logger.success("[DELETE]", user);

  // const createdUsers = await usersModel.createMany([
  //   {
  //     username: "user_1",
  //   },
  //   {
  //     username: "user_2",
  //     age: 29,
  //   },
  // ]);
  // const ids = createdUsers.data?.ids ?? [];
  // let users = usersModel.getMany(ids);
  // Logger.success("[CREATE MANY]", users);

  // const toUpdateUsers =
  //   users.data?.map((user) => ({
  //     id: user.id,
  //     doc: {
  //       username: `user_${user.id}${user.id}`,
  //     },
  //   })) ?? [];

  // usersModel.updateMany(toUpdateUsers);
  // users = usersModel.getMany(ids);
  // Logger.success("[UPDATE MANY]", users);

  // usersModel.deleteMany(ids);
  // users = usersModel.getMany(ids);
  // Logger.success("[DELETE MANY]", users);

  // await usersModel.createMany([
  //   {
  //     username: "user_1",
  //   },
  //   {
  //     username: "user_2",
  //     age: 29,
  //   },
  // ]);

  // users = usersModel.find({
  //   AND: [
  //     { field: "username", op: { eq: "user_2" } },
  //     { field: "age", op: { eq: 29 } },
  //   ],
  // });
  // Logger.success("[FIND]", users);

  const NUM_OF_USERS = 1_000_000;

  const usersFromArray = Array.from({ length: NUM_OF_USERS }, (_, i) => ({
    username: `user ${i}`,
    age: i,
    bio: loremIpsum(256),
  }));

  const _userIds = usersFromArray.map(
    (u) => Number(u.username.split(' ').at(1))!
  );

  await profileAsync(`create many ${NUM_OF_USERS}`, async () => {
    const result = await usersModel.createMany(usersFromArray);
  });
  await profileAsync(`get many ${NUM_OF_USERS}`, async () => {
    usersModel.getMany(_userIds);
  });
}
