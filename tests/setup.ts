import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { afterAll, beforeEach } from "vitest";
import { resetEnvCache } from "@/config/env";
import { connectDB, disconnectDB } from "@/lib/mongodb";

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-storage-"));

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  MONGODB_URI: process.env.TEST_MONGODB_URI,
  ADMIN_EMAIL: "boss@party.test",
  ADMIN_PASSWORD: "super-secret-pass",
  AUTH_SECRET: "test-auth-secret-test-auth-secret-123",
  FILE_SIGNING_SECRET: "test-file-secret-test-file-secret-123",
  SMTP_HOST: "console",
  SMTP_FROM: "Party Police <party@test.local>",
  STORAGE_PATH: storageDir,
  MAX_FILE_SIZE: String(1024 * 1024),
  THANK_YOU_DELAY_MS: String(5 * 60 * 1000),
});
resetEnvCache();

beforeEach(async () => {
  await connectDB();
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  // Make sure unique indexes exist before tests rely on them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

afterAll(async () => {
  await disconnectDB();
});

export { storageDir };
