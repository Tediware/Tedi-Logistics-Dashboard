import { defineConfig } from "drizzle-kit"

import { DB_FILE } from "./db/paths"

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: DB_FILE },
  strict: true,
  verbose: true,
})
