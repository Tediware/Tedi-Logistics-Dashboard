import path from "node:path"

/**
 * Absolute path to the SQLite file. Overridable with DATABASE_URL; defaults to
 * data/app.db under the project root. The file is disposable:
 * `npm run db:reset` deletes and recreates it.
 */
export const DB_FILE =
  process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "app.db")
