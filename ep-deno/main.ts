import { collection, setup } from '@shindb/sdk';

if (import.meta.main) {
  await setup();

  const TOTAL_USERS = 1_000_000;

  const usersModel = collection('users', {
    username: {
      type: 'string',
      modifiers: ['required'],
    },
    age: {
      type: 'number',
    },
  });

  // Create test data (not included in performance measurement)
  const mockedUsers = Array.from({ length: TOTAL_USERS }, (_, i) => ({
    username: `user test ${i}`,
    age: i,
    // lorem,
  }));

  // Measure only the database operation
  console.log(`Starting database operation with ${TOTAL_USERS} users...`);
  const start = performance.now();
  await usersModel.createMany(mockedUsers);
  const end = performance.now();

  console.log(
    `Inserted ${TOTAL_USERS} users in ${(end - start).toFixed(2)} ms`
  );
  console.log(
    `Throughput: ${((TOTAL_USERS / (end - start)) * 1000).toFixed(2)} ops/sec`
  );

  // const users = Array.from({ length: TOTAL_USERS }, (_, i) => ({
  //   username: `user ${i}`,
  //   age: i,
  //   lorem: "akndn asjkndnjkas dsjna sjnd asjd asjd jas djash djasdja sdja s",
  // }));

  // const start = performance.now();
  // const createdUsers = await usersModel.createMany(users);
  // const end = performance.now();

  // console.log(
  //   `Inserted ${TOTAL_USERS} users in ${(end - start).toFixed(2)} ms`
  // );
  // console.log(
  //   `Throughput: ${((TOTAL_USERS / (end - start)) * 1000).toFixed(2)} ops/sec`
  // );

  // const createdUser = await usersModel.create(mockUser);
  // const createdUsers = await usersModel.createMany([
  //   { username: "nikola 1", age: 123 },
  //   { username: "nikola 2", age: 123 },
  // ]);
  // const updatedUser = await usersModel.update({ docId: 1 }, { age: 124 });
  // const user1 = await usersModel.get({ docId: 1 });
  // const deletedUser1 = await usersModel.delete({ docId: 1 });
  // const deletedUser11 = await usersModel.delete({ docId: 1 });
  // const user0 = await usersModel.get({ docId: 0 });
  // await usersModel.createMany([
  //   {
  //     username: "test",
  //     age: 32,
  //   },
  //   {
  //     username: "test",
  //     age: 16,
  //   },
  // ]);
  // const users = await usersModel.getMany([0, 1, 2, 3]);
  // const foundUsers = await usersModel.find({
  //   OR: [
  //     {
  //       AND: [
  //         {
  //           field: "username",
  //           op: { contains: "nikola" },
  //         },
  //         {
  //           field: "age",
  //           op: { eq: 123 },
  //         },
  //       ],
  //     },
  //     {
  //       AND: [
  //         {
  //           field: "username",
  //           op: { contains: "nikola" },
  //         },
  //         {
  //           field: "age",
  //           op: { eq: 124 },
  //         },
  //       ],
  //     },
  //   ],
  // });
  // const user = await usersModel.get({ docId: 1 });

  // const deletedUsers = await usersModel.deleteMany({ username: "asdasd" });
}
