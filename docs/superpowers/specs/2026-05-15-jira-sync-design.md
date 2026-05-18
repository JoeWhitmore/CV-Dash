# CV-Dash — Jira Sync Design

**Date:** 2026-05-15
**Status:** Approved (design)
**Author:** Joe W (via brainstorm)

## Goal

Replace the dashboard's mock data (`lib/mock/*`) with real Jira data, pulled on demand via a refresh button in the dashboard header. Synced data is persisted in Neon Postgres so the dashboard reads from the DB, not Jira, on normal page loads.

## Constraints

- **DB:** Neon Postgres via Vercel Marketplace + Drizzle ORM (matches `2026-05-14-tech-stack-design.md`).
- **Jira target:** Atlassian Cloud, `https://carevicinity.atlassian.net`, project `CV`, board id `36`.
- **Jira auth:** Basic API token + email via env vars. Server-only; token never reaches the browser.
- **Sync trigger:** Manual only (refresh button). No cron, no webhooks.
- **Sync scope:** Active sprints only (state in `active` + `future` on board 36).
- **Single-tenant:** One shared service identity (the user's API token). No per-user OAuth.

## Architecture

```
[Browser]
  Dashboard → RefreshButton (client component)
    └─ useTransition + Server Action syncFromJira()

[Next.js Server Action: lib/actions/sync.ts]
  1. Read env (JIRA_*).
  2. lib/jira/client.ts → active sprints on board 36 → issues per sprint.
  3. Single Drizzle transaction:
       - upsert sprints
       - upsert tickets
       - upsert team_members (derived from unique assignees)
       - on first sight of a sprint, freeze baseline_points
       - insert burndown_snapshot
       - insert sync_run row
  4. revalidatePath('/dashboard') so RSC re-reads.
  5. Return { ok, syncedTickets, lastSyncedAt }.

[Neon Postgres + Drizzle]
  schema: sprints, tickets, team_members, burndown_snapshots, sync_runs

[Dashboard RSC: app/(app)/page.tsx]
  Reads tickets/sprints/team/burndown from DB.
  Empty state if no rows.
```

## Schema (Drizzle)

```ts
// lib/db/schema.ts

sprints
  id                    text PK              // jira sprint id
  name                  text NOT NULL
  state                 text NOT NULL        // 'active' | 'future' | 'closed'
  start_date            date
  end_date              date
  baseline_points       integer              // frozen at first sync of this sprint
  baseline_captured_at  timestamptz
  jira_board_id         text NOT NULL

tickets
  key             text PK                    // 'CV-1300'
  title           text NOT NULL
  type            text NOT NULL              // 'story' | 'bug' | 'task'
  status          text NOT NULL              // mapped enum (see status map)
  points          integer NOT NULL default 0
  assignee_id     text REFERENCES team_members(id) NULL
  sprint_id       text REFERENCES sprints(id) NOT NULL
  jira_updated_at timestamptz
  last_synced_at  timestamptz NOT NULL

team_members
  id              text PK                    // slug derived from displayName (e.g. 'joe-w'), disambiguated on collision
  jira_account_id text UNIQUE NOT NULL       // opaque Jira accountId
  name            text NOT NULL              // displayName
  initials        text NOT NULL              // computed from name
  avatar_url      text

burndown_snapshots
  id               serial PK
  sprint_id        text REFERENCES sprints(id) NOT NULL
  captured_at      timestamptz NOT NULL default now()
  remaining_points integer NOT NULL          // sum where status NOT IN ('peer-review','testing','done','closed')
  total_points     integer NOT NULL          // sum of all points currently in sprint (tracks scope drift)
  INDEX (sprint_id, captured_at)

sync_runs
  id            serial PK
  started_at    timestamptz NOT NULL default now()
  finished_at   timestamptz
  status        text NOT NULL                // 'running' | 'success' | 'failed'
  ticket_count  integer
  sprint_count  integer
  error_message text                         // also used for non-fatal warnings (unknown status/type)
```

## Jira → domain field mappings

| Domain field | Jira source | Notes |
|---|---|---|
| `tickets.key` | `issue.key` | direct |
| `tickets.title` | `issue.fields.summary` | direct |
| `tickets.type` | `issue.fields.issuetype.name` | Story→story, Bug→bug, Task/Sub-task→task. Unknown → task + warning. |
| `tickets.status` | `issue.fields.status.name` | mapped via `lib/jira/status-map.ts` |
| `tickets.points` | `issue.fields.customfield_10034` | `JIRA_STORY_POINTS_FIELD` env var. Missing/null → 0. |
| `tickets.assignee_id` | `issue.fields.assignee.accountId` | resolved to `team_members.id` slug; unassigned = NULL |
| `tickets.sprint_id` | the iteration context | sync iterates per-sprint; the parser receives the current sprint id explicitly. The issue's `customfield_10020` array is ignored because its ordering is not reliable. |
| `sprints.*` | `/rest/agile/1.0/board/36/sprint?state=active,future` | one paginated call |
| `team_members.*` | derived from unique `issue.fields.assignee` during sync | id = slug of displayName (e.g. `joe-w`); collisions get a numeric suffix (`joe-w-2`). `jira_account_id` stores the canonical opaque id. |

### Status map (`lib/jira/status-map.ts`)

Based on the live CV-project taxonomy (probed 2026-05-15):

```ts
// CV-specific live statuses (case-insensitive matching)
"To Do" | "Backlog" | "Planned" | "Ready For Dev" | "Ready For Development"
  | "Discovery" | "Design" | "Needs Design" | "Blocked"   → "to-do"
"In Progress" | "Building" | "Awaiting Feedback"           → "in-progress"
"In Review"                                                → "in-review"
"Peer review"                                              → "peer-review"
"In QA" | "Testing/UAT"                                    → "testing"
"Done" | "Ready For Release"                               → "done"
"Won't Do"                                                 → "closed"
// "Escalated" is intentionally unmapped — falls back to "to-do" with a warning each sync.
// Common Jira defaults (Open, Resolved, Closed, Code Review, Ready for Review, In Testing, QA, Testing)
// are also mapped for defensiveness across instances.
// fallback for any other name: "to-do" + warning appended to sync_runs.error_message
```

**Burndown impact of mapping choices** (decisions captured 2026-05-15):
- `Blocked` → `to-do`: blocked tickets are treated as paused, not in-flight. Still counts as remaining.
- `Awaiting Feedback` → `in-progress`: pre-PR, still in active dev. Still counts as remaining.
- `Ready For Release` → `done`: work is complete pending release. Drops the burndown line.

### Burndown semantics

- **Baseline (frozen):** on first successful sync of a sprint, `sprints.baseline_points` = sum of `tickets.points` for that sprint at that moment. Never updated thereafter.
- **Remaining (per refresh):** sum of `tickets.points` where `status NOT IN ('peer-review','testing','done','closed')`.
- **Total (per refresh):** sum of all `tickets.points` currently in the sprint. Drifts above baseline = scope creep added mid-sprint.
- Chart consumes `burndown_snapshots` ordered by `captured_at` per `sprint_id`.

## Refresh button UX

**Placement:** dashboard header, top-right, next to sprint selector. Adjacent muted text shows `Last synced: 3 min ago` (relative time, hydrates on client from `sync_runs.finished_at`).

**Behaviour:**
- Click → `useTransition` calls Server Action.
- Button shows spinner + `Syncing…`, disabled during transition.
- On success: toast `Synced N tickets from Jira` (or `Synced N tickets from Jira — with warnings` if `sync_runs.error_message` is non-empty after a successful run). RSC revalidates and dashboard re-renders.
- On failure: destructive toast with error message and a retry button.
- Concurrent sync guard: if a `sync_runs` row has `status='running'` started <60s ago, second call returns "Sync already in progress" — no new sync started.

**First-run empty state:**
- Dashboard RSC counts `tickets` rows. If 0:
  - Renders empty-state card: "Connect to Jira to load your dashboard." + `[Sync from Jira]` button (calls same Server Action).
- After first success, normal dashboard.

## Error handling

| Failure | Behaviour |
|---|---|
| Missing env var at action entry | Returns `{ ok:false, error:"Jira not configured. Set JIRA_API_TOKEN…" }`. Toast names the missing var. |
| 401 from Jira | `"Jira credentials rejected — check JIRA_EMAIL / JIRA_API_TOKEN."` |
| 429 rate-limited | One retry honouring `Retry-After`. If still 429, fail with explicit message. |
| 5xx / network | One retry with 500ms backoff. Then fail. DB transaction is rolled back; last good data stays. |
| Unknown status name | Mapped to `to-do`, warning appended to `sync_runs.error_message`. Sync succeeds. Toast suffixed with "— with warnings". |
| Unknown issue type | Mapped to `task`, warning appended. Toast suffixed with "— with warnings". |
| Concurrent sync | Guard returns "Sync already in progress" without starting a new run. |

All failures write a `sync_runs` row with `status='failed'` and `error_message` for debugging.

## Environment variables

```bash
# .env.local (gitignored; pulled via `vercel env pull` once linked)
DATABASE_URL=...                              # Neon Marketplace
JIRA_BASE_URL=https://carevicinity.atlassian.net
JIRA_EMAIL=joew@carevicinity.com.au
JIRA_API_TOKEN=...                            # id.atlassian.com/manage-profile/security/api-tokens
JIRA_BOARD_ID=36
JIRA_STORY_POINTS_FIELD=customfield_10034
```

The sync iterates per-sprint via `/rest/agile/1.0/sprint/{sprintId}/issue`, so the sprint context is known from the request URL and there is no need to read it from a custom field on each issue. (Real Jira issues commonly belong to multiple sprints, and the ordering in `customfield_10020` is not reliably "active last".)

## Project layout additions

```
app/
├── (app)/
│   └── page.tsx                # now reads from DB, renders empty state or dashboard
components/
├── dashboard/
│   ├── refresh-button.tsx      # client; useTransition + toast
│   └── empty-state.tsx         # "Connect to Jira" CTA
lib/
├── actions/
│   └── sync.ts                 # Server Action: syncFromJira()
├── db/
│   ├── index.ts                # drizzle client (Neon serverless driver)
│   ├── schema.ts               # tables above
│   └── migrations/             # drizzle-kit output (committed)
├── jira/
│   ├── client.ts               # fetch wrapper, basic auth, retry logic
│   ├── status-map.ts           # Jira status → domain Status enum
│   ├── types.ts                # Jira API response types
│   └── __fixtures__/           # captured JSON for tests
drizzle.config.ts
```

`lib/mock/*` is deleted after the dashboard reads from DB (no compatibility shim).

## Testing

- **Vitest unit:**
  - `status-map.test.ts` — every documented Jira status maps; unknown → fallback + warning.
  - `sync-reducer.test.ts` — given a sprint + issues fixture, computes correct baseline (first run) and remaining/total (subsequent runs). Idempotent: running twice on the same input produces identical DB state.
  - `team-derivation.test.ts` — duplicate assignees collapse to one row; missing assignee → no team_member row.
- **Integration:** none yet. First manual sync against real Jira is the integration test.
- **E2E (Playwright):** one smoke test — load `/dashboard` with empty DB → assert empty state visible; mock the Server Action; assert dashboard renders after.

## Setup sequence (for the implementation plan)

1. Provision Neon via Vercel Marketplace; `vercel env pull .env.local`.
2. Install Drizzle + drizzle-kit; create `drizzle.config.ts`, `lib/db/index.ts`, `lib/db/schema.ts`.
3. Generate + apply migration to Neon.
4. Implement `lib/jira/{client,status-map,types}.ts`.
5. Implement `lib/actions/sync.ts` (transaction + error handling).
6. Build `components/dashboard/refresh-button.tsx` + `empty-state.tsx` (shadcn primitives via MCP).
7. Replace `lib/mock/*` imports in dashboard with DB queries; delete `lib/mock/`.
8. Vitest specs.
9. Playwright smoke test.
10. Manual integration: click refresh against real Jira, verify DB rows and dashboard render.

## Out of scope

- Sub-tasks (top-level issues only).
- Closed/historical sprints.
- Webhooks / push sync.
- Cron-driven sync.
- Multi-board, multi-project.
- Per-user OAuth (3LO).
- Issue comments, attachments, links.
- Sentry / observability for sync failures (deferred; failed `sync_runs` rows are the only signal).

## Open decisions punted intentionally

- Bot detection / Vercel BotID on the dashboard. Single-tenant manager tool — not relevant yet.
- Soft-delete vs hard-delete for tickets that leave the active sprint. Current design: tickets are deleted on sync if they no longer appear in any active sprint. Acceptable because we don't show history; revisit if dashboard adds historical views.

## Acceptance criteria

1. With env vars configured and DB migrated, clicking the refresh button populates `sprints`, `tickets`, `team_members`, `burndown_snapshots`, and a `sync_runs` row with `status='success'`.
2. Dashboard renders real Jira data after refresh; `lib/mock/*` is no longer referenced.
3. First-time visit with empty DB shows empty-state CTA, not a broken dashboard.
4. Sync run with invalid credentials writes a failed `sync_runs` row and surfaces a destructive toast.
5. Sync run with an unknown Jira status appends a warning to `sync_runs.error_message` and still completes successfully.
6. Running the sync twice in succession on unchanged Jira data produces no schema-level changes other than a new `burndown_snapshots` row and a new `sync_runs` row.
7. `pnpm test` passes (Vitest specs above).
8. `pnpm test:e2e` smoke test passes.
