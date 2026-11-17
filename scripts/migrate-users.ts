/**
 * Moves users from the old `admins` + `members` collections into `users`.
 *   npm run migrate:users            # copy only (old collections kept)
 *   npm run migrate:users -- --drop  # copy, then drop the old collections
 */
import "@/config/load-dotenv";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "@/lib/mongodb";
import { migrateLegacyUsers } from "@/lib/migrations/users";
import { User } from "@/models";

async function main() {
  await connectDB();
  await User.syncIndexes();
  const report = await migrateLegacyUsers(mongoose.connection.db!, { dropOld: process.argv.includes("--drop") });
  console.log("✅ Users migration:", report);
}

main()
  .catch((err) => {
    console.error("❌", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
