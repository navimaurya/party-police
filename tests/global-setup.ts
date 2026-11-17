import { MongoMemoryReplSet } from "mongodb-memory-server";

let server: MongoMemoryReplSet;

export async function setup() {
  server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.TEST_MONGODB_URI = server.getUri("party_police_test");
}

export async function teardown() {
  await server?.stop();
}
