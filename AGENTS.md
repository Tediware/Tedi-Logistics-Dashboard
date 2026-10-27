# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor and others) working in
this repository. `CLAUDE.md` imports this file; edit this one.

## Read these first

Tediware publishes two documents for agents. They are the authority on how the
platform behaves; this file covers only how this repository uses it. Where the
two disagree, Tediware's documents win, and the code here should be fixed.

1. **Coding agent instructions for Tediware:**
   https://tediware.com/tediware-coding-agent-instructions.md
   Authentication, polling the feed, fetching results and artifacts, error
   shapes, rate limits.
2. **Tediware MCP documentation:**
   https://tediware.com/resources/api-docs/mcp
   The MCP server, its tools, key scopes, and the safety guidance for agents.

Fetch them at the start of any task that touches the integration. Do not rely
on memory of them; they change.

## What this project is

A carrier's compliance dashboard over its own Tediware account. It reads the
Tediware feed with a read-only API key and builds tenders (inbound 204s),
answers (outbound 990s) and loads with their status updates (outbound 214s)
from the X12-shaped JSON of each document. It measures how promptly the
carrier answers tenders and reports milestones and positions.

The app only reads. It never sends, resends or changes anything in Tediware,
and it never builds or parses raw EDI.

## Commands

```bash
npm run dev            # dev server at http://localhost:3007 (migrates first)
npm run check          # typecheck + lint + tests; run before calling work done
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # node:test via tsx, files named *.test.ts
npm run format         # prettier over ts/tsx
npm run build          # production build
npm run sync           # read the feed up to now, then exit
npm run sync:rebuild   # rebuild the domain tables from stored documents
npm run db:generate    # drizzle-kit generate, after editing db/schema.ts
npm run db:migrate     # apply migrations (creates data/app.db)
npm run db:reset       # delete data/app.db and migrate
```

Verification is `npm run check`, then `npm run sync:rebuild` against a
synced database to see that every document still reads.

Requires Node 20.18+ (`.nvmrc` pins the version; `nvm use`).

## This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.

## Architecture

### lib/tediware/: the only code that talks to Tediware

The sync and scripts call it; nothing else fetches Tediware URLs. Keep it
small and plain (no retry frameworks, no queues), and read-only.

- `env.ts`: config. Only `TEDIWARE_API_KEY` is required; the getter throws
  naming what is missing.
- `client.ts`: base URL, `Authorization: Key` header, 429 `Retry-After`,
  timeouts, error normalization.
- `feed.ts`: `GET /platform/feed_entries`, paged by cursor.
- `artifacts.ts`: picks and downloads the X12-shaped JSON for an entry: the
  output artifact inbound, the mapped input artifact outbound.
- `x12-json.ts`: helpers for reading X12-shaped JSON. Select by segment tag,
  element position and qualifier code, never by a partner-specific value.

### Sync: feed, then download, then the store

`lib/sync.ts` pages through the feed from the saved cursor, records every
entry in `synced_documents` (idempotent on the entry id), downloads the
documents it reads, and hands each to its handler in `lib/loads/store.ts`.
The cursor is saved after each page. The background sync starts from
`instrumentation.ts`; the Activity page's Sync now button and
`npm run sync` call the same `runSync`, which never runs twice at once.

Handlers must be idempotent per document and must not call Tediware: a
rebuild replays every stored document through them in feed order.

### Reading documents (lib/loads/)

`tender.ts` (204), `response.ts` (990) and `status.ts` (214) read X12-shaped
JSON into plain types. `place.ts` fills in an event's state when the 214
leaves it out, because local times need it. Nothing here is
partner-specific: a partner that puts something in an unusual place gets a
conditional in the reader, not a new field.

### Data (db/)

Drizzle + better-sqlite3, synchronous API (`.get()`, `.all()`, `.run()`).
`synced_documents` is the audit log; the domain tables are derived from it
and link back to its rows. Columns holding Tediware identifiers end in
`_extid`, never `_id`. The database file is disposable.

### UI

Server components by default; client components only for interactivity.
shadcn/ui + Tailwind. Every document the app read is viewable verbatim
(`components/json-viewer.tsx`); keep that true for new features.

## Tediware tools for agents

- **CLI:** `npx tedi` (a dev dependency). `npx tedi --help` and
  `npx tedi <command> --help` are the reference. Use `--json` when reading
  output programmatically. Exit codes: 0 clean, 1 a finding, 2 did not run.
  Never treat 2 as a pass.
- **MCP:** `.mcp.json` registers `tediware` on the default `tedi` profile.
  It needs `npx tedi auth login` once per machine. Use a read-only key.
- **Scrub before sharing:** run `npx tedi edi obfuscate <file>` on any EDI
  file before reading it into context, pasting it, or sending it anywhere.
- **Ask before acting on the platform.** This app never writes to Tediware.
  If a key with write tools is in use, never send, receive, resend or
  redeliver a document, or submit a suggestion, without the user's explicit
  go-ahead for that specific action.
- Partners, flows, mappings and webhooks are configured only in the Tediware
  app. If a task needs a configuration change, say what to change and where;
  do not look for an API to do it.

## Style

- Comments explain why, not what. Match the density of the surrounding code.
- UI copy is plain and concrete.
- No secrets in code or fixtures. Configuration comes from the environment.
