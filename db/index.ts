import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

import { DB_FILE } from "./paths"
import * as schema from "./schema"

/**
 * The shared Drizzle database handle.
 *
 * A single better-sqlite3 connection is fine here: the app is single-user and
 * local, and SQLite handles our concurrency. In Next dev the module is cached
 * across hot reloads via globalThis so we do not open a new connection on every
 * change.
 *
 * WAL mode is set once by db:migrate (it persists in the file). Setting it here
 * would race: `next build` imports this module from several workers at once,
 * and switching journal mode needs an exclusive lock.
 */

function createDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
  const sqlite = new Database(DB_FILE)
  sqlite.pragma("foreign_keys = ON")
  return drizzle(sqlite, { schema })
}

const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof createDb>
}

export const db = globalForDb.db ?? createDb()

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db
}

export { schema }
