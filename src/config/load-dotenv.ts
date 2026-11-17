import { config } from "dotenv";

/**
 * For standalone scripts (seed, worker). Values in .env always win over
 * variables already exported in the shell, so a stale `MONGODB_URI` in the
 * terminal can never redirect the scripts to a different database.
 */
config({ override: true, quiet: true });
