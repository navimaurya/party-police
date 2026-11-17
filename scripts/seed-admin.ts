/**
 * Creates the Super Admin user from ADMIN_EMAIL / ADMIN_PASSWORD.
 *   npm run seed:admin               # create if missing; moves it if ADMIN_EMAIL changed
 *   npm run seed:admin -- --reset    # reset password (logs out all sessions)
 */
import "@/config/load-dotenv";
import { disconnectDB } from "@/lib/mongodb";
import { upsertAdminFromEnv } from "@/services/auth.service";

async function main() {
  const reset = process.argv.includes("--reset");
  const r = await upsertAdminFromEnv({ resetPassword: reset });
  console.info(
    r.created
      ? "✅ Super Admin created"
      : r.emailChanged
        ? "✅ Super Admin moved to the new ADMIN_EMAIL (password taken from ADMIN_PASSWORD)"
        : r.passwordReset
          ? "🔑 Password reset"
          : "ℹ️  Super Admin already exists (use --reset to change the password)"
  );
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
