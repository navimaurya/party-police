/**
 * Local MongoDB for development when MongoDB isn't installed.
 * Data persists in ./.mongo-data between runs. Not for production.
 *   npm run db:dev
 */
import fs from "node:fs";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  const dbPath = path.resolve(".mongo-data");
  fs.mkdirSync(dbPath, { recursive: true });
  const port = Number(process.env.DEV_MONGO_PORT ?? 27017);
  const server = await MongoMemoryServer.create({ instance: { port, dbPath, storageEngine: "wiredTiger", ip: "127.0.0.1" } });
  console.info(`🍃 Dev MongoDB running at ${server.getUri()} (data: ${dbPath}). Ctrl+C to stop.`);
  const stop = async () => {
    await server.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
