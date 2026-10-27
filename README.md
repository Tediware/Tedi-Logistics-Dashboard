# Carrier Dashboard for Tediware

A compliance dashboard for a truckload carrier, built on your own
[Tediware](https://tediware.com) account. Give it a read-only API key and it
syncs your load tenders (204), your answers to them (990) and your status
updates (214), then shows how well you keep your side of the exchange:

- **990 response:** answered by the partner's respond-by, or within an hour
  when the 204 sets none.
- **Pickup and delivery 214s:** sent within an hour of the event.
- **X6 cadence:** a position update at least every 30 minutes in transit,
  for partners you send pings to.

Each rate breaks down by partner and by day, and a map shows your lanes,
facilities and the loads on the road now. You can open every tender and see
each document behind it, as Tediware delivered it.

The dashboard was built with a coding agent and the Tediware MCP server:
watch [the video](https://www.youtube.com/watch?v=8njDZCeGWmk) or read
[the write-up](https://tediware.com/updates/mcp-for-edi-building-a-carrier-compliance-dashboard).
This repository is that dashboard, reworked to run against your own account.

## It only reads

The app never sends, resends or changes anything in Tediware. A read-only
API key is all it needs, and nothing has to be configured on the Tediware
side: no webhooks, no tunnel, no public URL. It runs on your machine and
keeps its data in a local SQLite file.

## Quick start

Requires Node 20.18 or later (`nvm use` reads `.nvmrc`).

1. In Tediware, create a **read-only** API key at
   [tediware.com/app/api-keys](https://tediware.com/app/api-keys).
2. Install and configure:

   ```bash
   npm install
   cp .env.example .env.local
   # paste the key into TEDIWARE_API_KEY in .env.local
   ```

3. Start it:

   ```bash
   npm run dev                    # http://localhost:3007
   ```

The first sync reads up to 45 days of documents (as long as Tediware keeps
them). Follow it on the **Activity** page. It takes about a minute per 240
documents, because Tediware allows 240 requests a minute per key. After
that, the app checks for new documents every minute while it runs.

To watch the first sync in a terminal instead, run `npm run sync` before
`npm run dev`.

## What it needs from your Tediware setup

- **204s passed straight through.** The app reads load tenders in their X12
  shape, so it needs inbound 204 flows with no inbound mapping. A 204 from a
  flow with a mapping shows up in Activity as skipped, with the reason.
- **990s and 214s sent through Tediware.** Your TMS keeps sending them as it
  does now. The app reads each one in the X12 shape it was mapped to,
  which is the same for every partner on an implementation, so your own
  JSON format doesn't matter.

Test interchanges (ISA15 = `T`), resends, and documents Tediware reported an
error for are recorded but not counted.

## How it works

```
Tediware feed  ──▶  synced_documents  ──▶  tenders, versions, answers,
(every document,     (the feed entry and     loads, status events
 in and out)          its X12-shaped JSON)         │
                                                   ▼
                                       Compliance, Tenders, Loads
```

1. **Read the feed.** `GET /platform/feed_entries` lists every document
   Tediware processed for your organization, inbound and outbound, whatever
   delivery method each partner uses. The app pages through it with a
   cursor, which it saves after each page, so a restart picks up where it
   stopped.
2. **Download what it reads.** For an inbound 204 or an outbound 990 or 214,
   it downloads the X12-shaped JSON from the entry's artifacts. Everything
   else is recorded without a download.
3. **Build the picture.** Each 204 becomes a tender version. Each 990 answers
   the version that was current when it went out. Each 214 adds events to
   the load. Times on the dashboard are when Tediware processed each
   document, so "sent within an hour" means within an hour of reaching
   Tediware.

The domain tables can be rebuilt from the stored documents at any time
without calling Tediware: `npm run sync:rebuild`. Run it after you change how
documents are read.

## Making it yours

- **Targets:** the goals behind each metric (95% on time, a 60-minute
  window, 30 minutes between pings) are in `RULES` in
  `lib/analytics/compliance.ts`.
- **Time zone:** screens show times in the zone set in `lib/site.ts`.
- **More documents:** add a handler in `lib/sync.ts` and a reader beside
  `lib/loads/tender.ts`. The helpers in `lib/tediware/x12-json.ts` select
  by segment tag, element position and qualifier code, so the same code
  works for every partner on an implementation.

## Configuration

All in `.env.local`; see `.env.example`.

| Variable                | Default                | Does                                                                    |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `TEDIWARE_API_KEY`      |                        | Your read-only key. Nothing syncs without it.                           |
| `TEDIWARE_BASE_URL`     | `https://tediware.com` | Tediware's address.                                                     |
| `SYNC_INTERVAL_SECONDS` | `60`                   | How often to check for new documents. `0` turns background syncing off. |
| `SYNC_DAYS`             | `45`                   | How far back the first sync reads.                                      |
| `DATABASE_URL`          | `data/app.db`          | Where the SQLite file lives.                                            |

To start over, stop the app and run `npm run db:reset`. The next sync reads
everything again.

## Working with coding agents

`AGENTS.md` is the guide for coding agents (Claude Code, Codex, Cursor and
others). It points them at Tediware's
[coding agent instructions](https://tediware.com/tediware-coding-agent-instructions.md)
and [MCP documentation](https://tediware.com/resources/api-docs/mcp), and
describes how this repository fits together.

The `tedi` CLI is a dev dependency, so `npx tedi` works without a global
install. To give an agent the Tediware MCP server registered in `.mcp.json`,
store a read-only key once per machine:

```bash
npx tedi auth login
npx tedi whoami
```

With a read-only key, the agent can read your documents, traces and
configuration, but has no tools that send anything.

## Layout

```
app/
  page.tsx                     Compliance: rates, lanes, map
  tenders/                     Every tender, and one tender's documents
  loads/                       Loads by status, latest status updates
  activity/                    Sync status and every synced document
  documents/[id]/              One document: feed entry and JSON
lib/
  tediware/                    The only code that talks to Tediware
  sync.ts                      Reads the feed, downloads, dispatches
  loads/                       Reading 204s, 990s and 214s; the store
  analytics/                   Compliance metrics and the map's data
  geo/                         Postal code centroids for the map
db/                            Drizzle schema, migrations, connection
scripts/sync.ts                Sync or rebuild from the command line
```

## Scripts

| Command                | Does                                               |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Start the app (applies migrations first).          |
| `npm run sync`         | Read the feed up to now, then exit.                |
| `npm run sync:rebuild` | Rebuild tenders and loads from stored documents.   |
| `npm run check`        | Typecheck, lint and test.                          |
| `npm run build`        | Production build.                                  |
| `npm run db:reset`     | Delete the database and recreate it empty.         |
| `npm run db:generate`  | Generate a migration after editing `db/schema.ts`. |

Stack: Next.js (App Router) and TypeScript, shadcn/ui and Tailwind, SQLite
through Drizzle, MapLibre. There's no login, so don't deploy it anywhere
shared without adding one.

Postal code centroids come from [GeoNames](https://www.geonames.org/)
(CC BY 4.0).

## License

MIT. See `LICENSE`.
