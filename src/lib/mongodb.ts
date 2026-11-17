import mongoose from "mongoose";
import { env } from "@/config/env";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalForMongoose = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = globalForMongoose.__mongoose ?? { conn: null, promise: null };
globalForMongoose.__mongoose = cache;

/**
 * Returns a shared Mongoose connection. The connection is cached on globalThis
 * so hot reloads and multiple route handlers reuse one pool.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (!cache.promise) {
    mongoose.set("strictQuery", true);
    cache.promise = mongoose
      .connect(env().MONGODB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
        autoIndex: true,
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

export async function disconnectDB() {
  if (cache.conn) {
    await mongoose.disconnect();
    cache.conn = null;
    cache.promise = null;
  }
}
