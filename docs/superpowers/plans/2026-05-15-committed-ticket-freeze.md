# Committed-Ticket Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "Points committed" KPI so it locks to the tickets that were in the sprint at Monday 8AM Brisbane time. Spillover added mid-sprint no longer inflates the number. Currently-active sprint is back-filled from Jira's changelog so historical truth is preserved.

**Architecture:** Add a `committed_ticket_keys text[]` column on `sprints`. On sync, for each sprint past its Monday 8AM cutoff with a null commitment, reconstruct the ticket set at the cutoff using Jira's per-issue changelog (`expand=changelog`). Persist that list, then change `sprintKpis()` to use it for `pointsCommitted`. Re-estimates on frozen tickets still flow through; tickets added after cutoff don't.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle ORM (Postgres / Neon), Vitest, Jira REST `/rest/agile/1.0` + `/rest/api/3`.

**Scope decisions (confirmed in conversation):**
- Timezone: Australia/Brisbane, hard-coded as UTC+10 (no DST).
- Cutoff: `startDate at 08:00:00+10:00`.
- Backfill scope: currently-active sprint only. Closed sprints stay as-is. New sprints get frozen automatically on the first sync at or after their cutoff.
- Edge case (tickets removed from the sprint between cutoff and "now"): out of scope for v1. Documented as a known limitation. (Rare — and the Jira `sprint was X` JQL path can be added later if needed.)

---

## File Structure

**New files:**
- `lib/sprint/cutoff.ts` — Brisbane 8AM cutoff helper.
- `lib/jira/sprint-history.ts` — pure function reconstructing sprint membership at a target time from a Jira changelog.
- `lib/db/migrations/0001_committed_ticket_keys.sql` — Drizzle migration.
- `tests/unit/sprint-cutoff.test.ts`
- `tests/unit/sprint-history.test.ts`

**Modified files:**
- `lib/db/schema.ts` — add columns.
- `lib/types.ts` — add `committedTicketKeys` on `Sprint`.
- `lib/db/queries.ts` — surface `committedTicketKeys` from `getSprints()`.
- `lib/jira/types.ts` — add changelog response types.
- `lib/jira/client.ts` — add `fetchIssueChangelog()` and a `FIELDS` entry for `created`.
- `lib/sync/reducer.ts` — accept existing commitments and a `commitmentFreezes` input; emit `committedTicketKeys` on `SprintUpsert` where applicable.
- `lib/actions/sync.ts` — load existing commitments, for sprints past cutoff with no commitment fetch changelogs and compute the freeze, wire result into reducer + upsert.
- `lib/kpi.ts` — use `sprint.committedTicketKeys` when present.
- `tests/unit/sync-reducer.test.ts` — new cases for commitment freeze.
- `tests/unit/kpi.test.ts` — new cases for committed-keys filtering.

---

## Task 1: Add migration columns and update schema

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0001_committed_ticket_keys.sql`

- [ ] **Step 1.1: Add columns to the schema**

Modify `lib/db/schema.ts` — change the `sprints` table definition. The new columns go after `baselineCapturedAt` (existing line ~19), before `jiraBoardId`:

```ts
export const sprints = pgTable("sprints", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  baselinePoints: integer("baseline_points"),
  baselineCapturedAt: timestamp("baseline_captured_at", { withTimezone: true }),
  committedTicketKeys: text("committed_ticket_keys").array(),
  committedCapturedAt: timestamp("committed_captured_at", { withTimezone: true }),
  jiraBoardId: text("jira_board_id").notNull(),
});
```

- [ ] **Step 1.2: Generate the migration**

Run: `pnpm drizzle-kit generate`
Expected: a new SQL file appears under `lib/db/migrations/` (e.g. `0001_*.sql`) with `ALTER TABLE "sprints" ADD COLUMN "committed_ticket_keys" text[]` and the timestamp column.

If the file name differs from `0001_committed_ticket_keys.sql`, that's fine — drizzle uses its own numbering. Note the actual filename for the next step.

- [ ] **Step 1.3: Verify migration SQL contents**

Read the generated `lib/db/migrations/0001_*.sql` and confirm both `ALTER TABLE "sprints" ADD COLUMN "committed_ticket_keys" text[]` and `..."committed_captured_at" timestamp with time zone` lines exist.

- [ ] **Step 1.4: Apply migration locally**

Run: `pnpm drizzle-kit migrate`
Expected: command exits 0, prints something like "1 migrations applied".

If the user does not have a DB to apply against, skip this step and note it for the user in the commit message.

- [ ] **Step 1.5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "db: add committed_ticket_keys columns to sprints"
```

---

## Task 2: Brisbane 8AM cutoff helper

**Files:**
- Create: `lib/sprint/cutoff.ts`
- Create: `tests/unit/sprint-cutoff.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/sprint-cutoff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { committedCutoff } from "@/lib/sprint/cutoff";

describe("committedCutoff", () => {
  it("returns sprint start date at 08:00 Brisbane (UTC+10) as a UTC Date", () => {
    // 2026-05-04 08:00 +10:00 == 2026-05-03 22:00 UTC
    expect(committedCutoff("2026-05-04")).toEqual(new Date("2026-05-03T22:00:00Z"));
  });

  it("returns null when startDate is null", () => {
    expect(committedCutoff(null)).toBeNull();
  });

  it("returns null when startDate is empty string", () => {
    expect(committedCutoff("")).toBeNull();
  });

  it("handles year-end dates without DST drift (Brisbane has no DST)", () => {
    // 2026-12-28 08:00 +10:00 == 2026-12-27 22:00 UTC
    expect(committedCutoff("2026-12-28")).toEqual(new Date("2026-12-27T22:00:00Z"));
  });
});
```

- [ ] **Step 2.2: Run test to verify failure**

Run: `pnpm test sprint-cutoff`
Expected: FAIL — `Cannot find module '@/lib/sprint/cutoff'`.

- [ ] **Step 2.3: Implement the helper**

Create `lib/sprint/cutoff.ts`:

```ts
/**
 * Returns the "committed" cutoff: sprint startDate at 08:00 Australia/Brisbane.
 * Brisbane is UTC+10 year-round (no DST), so we hard-code the offset.
 */
export function committedCutoff(startDate: string | null): Date | null {
  if (!startDate) return null;
  return new Date(`${startDate}T08:00:00+10:00`);
}
```

- [ ] **Step 2.4: Run test to verify pass**

Run: `pnpm test sprint-cutoff`
Expected: PASS — 4 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add lib/sprint/cutoff.ts tests/unit/sprint-cutoff.test.ts
git commit -m "feat(sprint): add Brisbane 8AM committed-cutoff helper"
```

---

## Task 3: Jira changelog types + client

**Files:**
- Modify: `lib/jira/types.ts`
- Modify: `lib/jira/client.ts`

- [ ] **Step 3.1: Add changelog types**

Add to `lib/jira/types.ts` (append after the existing `JiraUser` type):

```ts
export interface JiraChangelogItem {
  field: string;
  fieldtype?: string;
  from: string | null;
  fromString: string | null;
  to: string | null;
  toString: string | null;
}

export interface JiraChangelogEntry {
  id: string;
  created: string; // ISO 8601
  items: JiraChangelogItem[];
}

export interface JiraIssueChangelogResponse {
  startAt: number;
  maxResults: number;
  total: number;
  isLast: boolean;
  values: JiraChangelogEntry[];
}
```

Also update `JiraIssueFields` (existing type in the same file) to include `created`:

```ts
export interface JiraIssueFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  assignee: JiraUser | null;
  updated: string;
  created: string;
  [customField: string]: unknown;
}
```

- [ ] **Step 3.2: Add `created` to the fetched FIELDS list**

In `lib/jira/client.ts`, line 15, change:

```ts
const FIELDS = ["summary", "status", "issuetype", "assignee", "updated"];
```

to:

```ts
const FIELDS = ["summary", "status", "issuetype", "assignee", "updated", "created"];
```

- [ ] **Step 3.3: Add the changelog fetcher**

Append to `lib/jira/client.ts` (after `fetchIssuesForSprint`):

```ts
/**
 * Fetches the full changelog for an issue, paginating until exhausted.
 * Uses /rest/api/3 (the agile endpoint does not support per-issue changelog).
 */
export async function fetchIssueChangelog(
  cfg: JiraConfig,
  issueKey: string,
): Promise<JiraIssueChangelogResponse> {
  let startAt = 0;
  const all: JiraChangelogEntry[] = [];
  let total = 0;

  while (true) {
    const url =
      `${cfg.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog` +
      `?maxResults=100&startAt=${startAt}`;
    const page = await jiraFetch<JiraIssueChangelogResponse>(url, cfg);
    all.push(...page.values);
    total = page.total;
    startAt += page.values.length;
    if (page.values.length === 0 || page.isLast || startAt >= total) break;
  }

  return { startAt: 0, maxResults: total, total, isLast: true, values: all };
}
```

Add the imports at the top of `lib/jira/client.ts`:

```ts
import type {
  JiraChangelogEntry,
  JiraIssueChangelogResponse,
  JiraIssueSearchResponse,
  JiraSprintListResponse,
} from "@/lib/jira/types";
```

(replacing the existing import).

- [ ] **Step 3.4: Run typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3.5: Commit**

```bash
git add lib/jira/types.ts lib/jira/client.ts
git commit -m "feat(jira): add issue changelog types and fetcher"
```

---

## Task 4: Sprint membership reconstruction from changelog

**Files:**
- Create: `lib/jira/sprint-history.ts`
- Create: `tests/unit/sprint-history.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `tests/unit/sprint-history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { wasInSprintAt } from "@/lib/jira/sprint-history";
import type { JiraChangelogEntry } from "@/lib/jira/types";

const sprintChange = (
  created: string,
  from: string,
  to: string,
): JiraChangelogEntry => ({
  id: created,
  created,
  items: [{ field: "Sprint", from, fromString: from, to, toString: to }],
});

const noise = (created: string): JiraChangelogEntry => ({
  id: created,
  created,
  items: [{ field: "status", from: "1", fromString: "Open", to: "3", toString: "In Progress" }],
});

const cutoff = new Date("2026-05-04T22:00:00Z"); // Monday 8AM Brisbane for sprint starting 2026-05-04

describe("wasInSprintAt", () => {
  it("returns true when no changelog entries and issue was created before cutoff (always in)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-05-01T00:00:00Z",
        changelog: [],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("returns false when issue was created after cutoff", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-05-06T00:00:00Z",
        changelog: [],
        at: cutoff,
      }),
    ).toBe(false);
  });

  it("respects the last Sprint change before cutoff (in -> out)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [sprintChange("2026-05-03T10:00:00Z", "42", "")],
        at: cutoff,
      }),
    ).toBe(false);
  });

  it("respects the last Sprint change before cutoff (out -> in)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [sprintChange("2026-05-03T10:00:00Z", "41", "42")],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("ignores Sprint changes after cutoff", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [
          sprintChange("2026-05-03T10:00:00Z", "41", "42"),  // before cutoff -> in
          sprintChange("2026-05-05T10:00:00Z", "42", ""),    // after cutoff, ignore
        ],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("handles multi-sprint values (comma-separated)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [sprintChange("2026-05-03T10:00:00Z", "41", "41, 42")],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("ignores non-Sprint changelog items", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [noise("2026-05-03T10:00:00Z")],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("uses the LATEST Sprint change before cutoff (not the first)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [
          sprintChange("2026-05-02T10:00:00Z", "", "42"),
          sprintChange("2026-05-03T10:00:00Z", "42", ""),
        ],
        at: cutoff,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run test to verify failure**

Run: `pnpm test sprint-history`
Expected: FAIL — `Cannot find module '@/lib/jira/sprint-history'`.

- [ ] **Step 4.3: Implement**

Create `lib/jira/sprint-history.ts`:

```ts
import type { JiraChangelogEntry } from "@/lib/jira/types";

export interface WasInSprintInput {
  sprintId: string;
  issueCreated: string;
  changelog: JiraChangelogEntry[];
  at: Date;
}

function parseSprintIds(value: string | null): Set<string> {
  if (!value) return new Set();
  return new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * Reconstructs whether an issue was in a given sprint at a target time, by walking
 * the Sprint-field history.
 *
 * Algorithm:
 *   1. Find the latest Sprint changelog entry with created <= at.
 *   2. If one exists: use its `toString` (the post-change sprint set) — true iff sprintId is in it.
 *   3. If none exists: fall back to "issue created before cutoff and still in sprint" — assume
 *      it's been in the sprint since creation. (This is the standard Jira pattern: setting Sprint
 *      at issue-creation time does not always emit a changelog entry.)
 */
export function wasInSprintAt(input: WasInSprintInput): boolean {
  const { sprintId, issueCreated, changelog, at } = input;
  const cutoff = at.getTime();

  const sprintItems = changelog
    .filter((h) => new Date(h.created).getTime() <= cutoff)
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === "Sprint")
        .map((i) => ({ created: new Date(h.created).getTime(), toString: i.toString })),
    )
    .sort((a, b) => a.created - b.created);

  if (sprintItems.length === 0) {
    return new Date(issueCreated).getTime() <= cutoff;
  }

  const last = sprintItems[sprintItems.length - 1];
  return parseSprintIds(last.toString).has(sprintId);
}
```

- [ ] **Step 4.4: Run test to verify pass**

Run: `pnpm test sprint-history`
Expected: PASS — 8 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add lib/jira/sprint-history.ts tests/unit/sprint-history.test.ts
git commit -m "feat(jira): reconstruct sprint membership at a point in time"
```

---

## Task 5: Sprint type + queries expose committedTicketKeys

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/db/queries.ts`

- [ ] **Step 5.1: Add field to Sprint type**

In `lib/types.ts`, update the `Sprint` interface:

```ts
export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  ticketKeys: string[];
  committedTicketKeys: string[] | null;
}
```

- [ ] **Step 5.2: Surface from getSprints()**

In `lib/db/queries.ts`, update the `.map()` inside `getSprints()`:

```ts
return rows.map((r) => ({
  id: r.id,
  name: r.name,
  startDate: r.startDate ?? "",
  endDate: r.endDate ?? "",
  ticketKeys: keysBySprint.get(r.id) ?? [],
  committedTicketKeys: r.committedTicketKeys ?? null,
}));
```

- [ ] **Step 5.3: Run typecheck**

Run: `pnpm typecheck`
Expected: pass (no callers break — we only added a field).

- [ ] **Step 5.4: Commit**

```bash
git add lib/types.ts lib/db/queries.ts
git commit -m "feat(types): expose committedTicketKeys on Sprint"
```

---

## Task 6: sprintKpis uses committedTicketKeys

**Files:**
- Modify: `lib/kpi.ts`
- Modify: `tests/unit/kpi.test.ts`

- [ ] **Step 6.1: Add failing tests for the new behavior**

Append to `tests/unit/kpi.test.ts` inside the `describe("sprintKpis", ...)` block (after the existing tests):

```ts
  it("when committedTicketKeys is set, pointsCommitted ignores tickets outside the committed list", () => {
    const sprintWithFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2", "CV-SPILLOVER"],
      committedTicketKeys: ["CV-1", "CV-2"],
    };
    const tickets = [
      ticket("CV-1", "to-do", 3),
      ticket("CV-2", "in-progress", 5),
      ticket("CV-SPILLOVER", "in-progress", 8), // added after Monday 8AM — must not count
    ];
    const kpis = sprintKpis(sprintWithFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(8); // 3 + 5
  });

  it("when committedTicketKeys is set, re-estimates of committed tickets still count", () => {
    const sprintWithFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2"],
      committedTicketKeys: ["CV-1", "CV-2"],
    };
    const tickets = [
      ticket("CV-1", "to-do", 5),       // was 3, re-estimated to 5
      ticket("CV-2", "in-progress", 13), // was 5, re-estimated to 13
    ];
    const kpis = sprintKpis(sprintWithFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(18);
  });

  it("when committedTicketKeys is null, falls back to in-scope sum", () => {
    const sprintWithoutFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2"],
      committedTicketKeys: null,
    };
    const tickets = [ticket("CV-1", "to-do", 3), ticket("CV-2", "in-progress", 5)];
    const kpis = sprintKpis(sprintWithoutFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(8);
  });
```

Also update the existing `sprint` literal at the top of the file to include `committedTicketKeys: null`:

```ts
const sprint: Sprint = {
  id: "s1",
  name: "S1",
  startDate: "2026-05-05",
  endDate: "2026-05-18",
  ticketKeys: ["CV-1", "CV-2", "CV-3", "CV-4", "CV-5"],
  committedTicketKeys: null,
};
```

- [ ] **Step 6.2: Run tests to verify failure**

Run: `pnpm test kpi`
Expected: the new test "ignores tickets outside the committed list" FAILS (returns 16 instead of 8 — still summing spillover).

- [ ] **Step 6.3: Update sprintKpis**

Modify `lib/kpi.ts` — replace the file body with:

```ts
import { filterInScope, isComplete } from "@/lib/scope";
import type { Sprint, Ticket } from "@/lib/types";
import { workingDaysBetween } from "@/lib/working-days";

export interface SprintKpis {
  pointsCommitted: number;
  pointsToPr: number;
  percentComplete: number;
  daysRemaining: number;
}

export function sprintKpis(sprint: Sprint, tickets: Ticket[], todayISO: string): SprintKpis {
  const inSprint = tickets.filter((t) => sprint.ticketKeys.includes(t.key));
  const inScope = filterInScope(inSprint);

  // pointsCommitted: if the sprint has a frozen committed-ticket list, sum points only for
  // tickets in that list. Otherwise (sprint not yet past its cutoff), fall back to in-scope sum.
  const committedSet = sprint.committedTicketKeys
    ? new Set(sprint.committedTicketKeys)
    : null;
  const pointsCommitted = committedSet
    ? inSprint.filter((t) => committedSet.has(t.key)).reduce((s, t) => s + t.points, 0)
    : inScope.reduce((s, t) => s + t.points, 0);

  const pointsToPr = inScope.filter(isComplete).reduce((s, t) => s + t.points, 0);
  const percentComplete =
    pointsCommitted === 0 ? 0 : Math.round((pointsToPr / pointsCommitted) * 1000) / 10;

  const daysRemaining = workingDaysBetween(todayISO, sprint.endDate);

  return { pointsCommitted, pointsToPr, percentComplete, daysRemaining };
}
```

- [ ] **Step 6.4: Run tests to verify pass**

Run: `pnpm test kpi`
Expected: all 6 tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add lib/kpi.ts tests/unit/kpi.test.ts
git commit -m "feat(kpi): pointsCommitted uses frozen committedTicketKeys when present"
```

---

## Task 7: Reducer accepts existing commitments and freezes

**Files:**
- Modify: `lib/sync/reducer.ts`
- Modify: `tests/unit/sync-reducer.test.ts`

The reducer becomes the single place that decides what `committedTicketKeys` to write for each sprint. The caller (the sync action) is responsible for telling the reducer which sprints need freezing and with what key list — the reducer only mutates the upsert if a freeze is being applied. This keeps the reducer pure and testable.

- [ ] **Step 7.1: Extend SprintUpsert and SyncWriteInput**

Modify `lib/sync/reducer.ts`. Update `SprintUpsert`:

```ts
export interface SprintUpsert {
  id: string;
  name: string;
  state: "active" | "future" | "closed";
  startDate: string | null;
  endDate: string | null;
  baselinePoints: number;
  baselineCapturedAt: Date;
  committedTicketKeys: string[] | null;
  committedCapturedAt: Date | null;
  jiraBoardId: string;
}
```

Update `SyncWriteInput`:

```ts
export interface SyncWriteInput {
  sprints: ParsedSprint[];
  tickets: ParsedTicket[];
  assignees: DerivedTeamMember[];
  existingBaselines: Map<string, { baselinePoints: number; baselineCapturedAt: Date }>;
  existingCommitments: Map<string, { ticketKeys: string[]; capturedAt: Date }>;
  commitmentFreezes: Map<string, string[]>; // sprintId -> ticket keys to freeze (only sprints we want to freeze on this run)
  now: Date;
}
```

- [ ] **Step 7.2: Update the reducer body**

Replace the `sprintUpserts: SprintUpsert[] = sprints.map(...)` block with:

```ts
const sprintUpserts: SprintUpsert[] = sprints.map((s) => {
  const existingBaseline = existingBaselines.get(s.id);
  const existingCommitment = existingCommitments.get(s.id);
  const freezeKeys = commitmentFreezes.get(s.id);

  const sprintTickets = ticketsBySprint.get(s.id) ?? [];
  const baselinePoints = existingBaseline?.baselinePoints ?? sprintTickets.reduce((sum, t) => sum + t.points, 0);
  const baselineCapturedAt = existingBaseline?.baselineCapturedAt ?? now;

  // Commitment freeze: take existing if present, otherwise freeze if caller asked us to, otherwise null.
  let committedTicketKeys: string[] | null = existingCommitment?.ticketKeys ?? null;
  let committedCapturedAt: Date | null = existingCommitment?.capturedAt ?? null;
  if (!existingCommitment && freezeKeys) {
    committedTicketKeys = freezeKeys;
    committedCapturedAt = now;
  }

  return {
    id: s.id,
    name: s.name,
    state: s.state,
    startDate: s.startDate,
    endDate: s.endDate,
    baselinePoints,
    baselineCapturedAt,
    committedTicketKeys,
    committedCapturedAt,
    jiraBoardId: s.jiraBoardId,
  };
});
```

- [ ] **Step 7.3: Update existing sync-reducer tests to pass new input fields**

Modify `tests/unit/sync-reducer.test.ts`. Every existing `buildSyncWrite({ ... })` call must add:

```ts
existingCommitments: new Map(),
commitmentFreezes: new Map(),
```

Add these lines to each of the existing 5 test cases (after the `existingBaselines: ...` line in each).

- [ ] **Step 7.4: Add new tests for commitment freeze behavior**

Append inside `describe("buildSyncWrite", ...)`:

```ts
  it("freezes committedTicketKeys when caller passes commitmentFreezes and no existing commitment", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "in-progress", 5, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map([["42", ["CV-1", "CV-2"]]]),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].committedTicketKeys).toEqual(["CV-1", "CV-2"]);
    expect(result.sprintUpserts[0].committedCapturedAt).toEqual(new Date("2026-05-15T12:00:00Z"));
  });

  it("preserves existing committedTicketKeys (does not re-freeze)", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "in-progress", 5, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map([
        ["42", { ticketKeys: ["CV-1"], capturedAt: new Date("2026-05-10T00:00:00Z") }],
      ]),
      commitmentFreezes: new Map([["42", ["CV-1", "CV-2"]]]),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].committedTicketKeys).toEqual(["CV-1"]);
    expect(result.sprintUpserts[0].committedCapturedAt).toEqual(new Date("2026-05-10T00:00:00Z"));
  });

  it("leaves committedTicketKeys null when no freeze is requested and no existing commitment", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].committedTicketKeys).toBeNull();
    expect(result.sprintUpserts[0].committedCapturedAt).toBeNull();
  });
```

- [ ] **Step 7.5: Run tests**

Run: `pnpm test sync-reducer`
Expected: all 8 tests pass (5 existing + 3 new).

- [ ] **Step 7.6: Commit**

```bash
git add lib/sync/reducer.ts tests/unit/sync-reducer.test.ts
git commit -m "feat(sync): reducer freezes committedTicketKeys when caller requests it"
```

---

## Task 8: Sync action computes freezes and persists

**Files:**
- Modify: `lib/actions/sync.ts`

This task wires it all together. The action:
1. Loads existing commitments alongside baselines.
2. Determines which active sprints are past their cutoff AND don't yet have a commitment.
3. For each such sprint, fetches changelogs for its tickets and computes which were in at cutoff.
4. Passes the freeze map to the reducer.
5. Persists the new columns via an updated `onConflictDoUpdate`.

- [ ] **Step 8.1: Update imports**

In `lib/actions/sync.ts`, update the imports:

```ts
import {
  jiraConfigFromEnv,
  fetchActiveAndFutureSprints,
  fetchIssuesForSprint,
  fetchIssueChangelog,
} from "@/lib/jira/client";
import { parseIssueIntoTicket, parseSprintList } from "@/lib/jira/parsers";
import { deriveTeam } from "@/lib/sync/team-derivation";
import { buildSyncWrite } from "@/lib/sync/reducer";
import { committedCutoff } from "@/lib/sprint/cutoff";
import { wasInSprintAt } from "@/lib/jira/sprint-history";
```

- [ ] **Step 8.2: Load existing commitments after existingBaselines**

After the existing `existingBaselines` block (currently around line 70-74), add:

```ts
const existingCommitments = new Map(
  existingSprintRows
    .filter((s) => s.committedTicketKeys != null && s.committedCapturedAt != null)
    .map((s) => [s.id, { ticketKeys: s.committedTicketKeys!, capturedAt: s.committedCapturedAt! }]),
);
```

- [ ] **Step 8.3: Compute commitmentFreezes via changelogs**

Right BEFORE the `const write = buildSyncWrite(...)` line, add:

```ts
const now = new Date();

// For each sprint past its Monday 8AM Brisbane cutoff with no existing commitment, reconstruct
// the ticket set that was in the sprint at cutoff using each ticket's Jira changelog.
const commitmentFreezes = new Map<string, string[]>();
for (let i = 0; i < parsedSprints.length; i++) {
  const s = parsedSprints[i];
  if (existingCommitments.has(s.id)) continue;
  const cutoff = committedCutoff(s.startDate);
  if (!cutoff || now.getTime() < cutoff.getTime()) continue;

  const sprintIssues = allIssues[i].issues;
  const committedKeys: string[] = [];
  for (const issue of sprintIssues) {
    const changelogResp = await fetchIssueChangelog(cfg, issue.key);
    const inAtCutoff = wasInSprintAt({
      sprintId: s.id,
      issueCreated: issue.fields.created,
      changelog: changelogResp.values,
      at: cutoff,
    });
    if (inAtCutoff) committedKeys.push(issue.key);
  }
  commitmentFreezes.set(s.id, committedKeys);
}
```

- [ ] **Step 8.4: Pass new inputs to the reducer**

Replace the `buildSyncWrite({...})` call:

```ts
const write = buildSyncWrite({
  sprints: parsedSprints,
  tickets: parsedTickets,
  assignees: team,
  existingBaselines,
  existingCommitments,
  commitmentFreezes,
  now,
});
```

(Note: pass the `now` from the line above, not `new Date()`.)

- [ ] **Step 8.5: Persist the new columns in the upsert**

Update the `onConflictDoUpdate` for sprints (inside the transaction) — add to the `set:` block:

```ts
set: {
  name: sql`excluded.name`,
  state: sql`excluded.state`,
  startDate: sql`excluded.start_date`,
  endDate: sql`excluded.end_date`,
  baselinePoints: sql`excluded.baseline_points`,
  baselineCapturedAt: sql`excluded.baseline_captured_at`,
  committedTicketKeys: sql`excluded.committed_ticket_keys`,
  committedCapturedAt: sql`excluded.committed_captured_at`,
  jiraBoardId: sql`excluded.jira_board_id`,
},
```

- [ ] **Step 8.6: Run typecheck + all tests**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck passes, all unit tests pass.

- [ ] **Step 8.7: Commit**

```bash
git add lib/actions/sync.ts
git commit -m "feat(sync): backfill committedTicketKeys via Jira changelog at Monday 8AM Brisbane cutoff"
```

---

## Task 9: Manual verification on the running app

This task is a sanity check, not code. The user runs the dev server, triggers a sync, and confirms the column gets populated correctly for the current active sprint.

- [ ] **Step 9.1: Start dev server**

Run: `pnpm dev` (let the user open the dashboard).

- [ ] **Step 9.2: Trigger a manual sync**

Click the sync button in the dashboard, or whichever path the project uses. Watch the network panel — expect N+1 calls (one issue-list + N changelog calls for the active sprint) on this first post-cutoff sync. Subsequent syncs should skip the changelog fetches.

- [ ] **Step 9.3: Inspect the DB**

Run (or ask the user to run):

```sql
SELECT id, name, committed_ticket_keys, committed_captured_at
FROM sprints
WHERE state = 'active';
```

Expected: `committed_ticket_keys` is a populated text array, `committed_captured_at` ≈ now. Confirm the array does NOT contain spillover tickets the user expects to see excluded.

- [ ] **Step 9.4: Confirm KPI in the UI**

Reload `/dashboard`. The "Points committed" tile should now show a lower number than before (if there was spillover). Add a ticket to the sprint in Jira (as a test), sync again, and confirm "Points committed" does NOT change.

If everything looks right, the user can decide whether to extend to past closed sprints (out of scope here).

---

## Self-Review

- **Spec coverage:**
  - Lock committed at Monday 8AM Brisbane: Tasks 2 + 7 + 8.
  - Backfill from Jira activity: Tasks 3 + 4 + 8.
  - Stop new tickets bumping committed: Task 6.
  - Re-estimates still count: covered by Task 6 tests.
  - Backfill scope = current active sprint only: handled in Task 8 (skips when commitment exists OR cutoff not passed; closed sprints already have commitments=null and won't be re-frozen unless explicitly run).
- **Placeholders:** none.
- **Type consistency:** `committedTicketKeys` / `committedCapturedAt` used consistently in schema (snake_case via drizzle casing), types, reducer, queries, sync. `existingCommitments` key shape matches reducer input.
- **Risk note:** Closed sprints synced before this feature lands will have `committedTicketKeys=null` permanently. KPIs on those sprints fall back to in-scope sum (their pre-feature behavior). This is the documented v1 scope.
