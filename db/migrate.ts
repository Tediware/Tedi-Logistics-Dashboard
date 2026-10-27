import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"

import { DB_FILE } from "./paths"

/**
 * Applies pending migrations from db/migrations to the SQLite file.
 * Run via `npm run db:migrate`. Creates the data directory if needed.
 */
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })

const sqlite = new Database(DB_FILE)
// Persistent: every later connection to this file uses WAL.
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")
const db = drizzle(sqlite)

migrate(db, { migrationsFolder: path.join(process.cwd(), "db", "migrations") })
sqlite.close()

console.log(`Migrations applied to ${DB_FILE}`)
