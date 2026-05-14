# CV-Dash Dashboard Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a Next.js 16 + Tailwind + shadcn project and build the read-only manager dashboard UI (sprint selector, points-based KPI tiles, burndown chart, assignee filter, kanban ticket columns) running on mock data.

**Architecture:** Single-page full-stack Next.js (App Router). UI uses shadcn primitives composed into dashboard components. Mock data layer in `lib/mock/` exposes the same shapes that real Jira data will later use. Pure logic (scope filtering, KPI math, working-day math) lives in `lib/` and is TDD'd with Vitest. The page itself is verified end-to-end with one Playwright smoke test.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, shadcn/ui, pnpm, Biome (lint + format), Vitest (unit), Playwright (E2E), Recharts (via shadcn `chart`), lucide-react icons.

**Scope boundaries:**
- ✅ Project bootstrap, UI scaffold, mock data
- ❌ Neon Postgres, Drizzle, Clerk auth (deferred to data-wiring spec)
- ❌ Real Jira API calls (deferred)

**Specs implemented:**
- `docs/superpowers/specs/2026-05-14-tech-stack-design.md` (partial — Postgres/Drizzle/Clerk deferred)
- `docs/superpowers/specs/2026-05-14-dashboard-ui-design.md` (in full)

---

## File structure (locked)

```
/
├── app/
│   ├── globals.css                       # Tailwind v4 import + theme tokens
│   ├── layout.tsx                        # Root layout + ThemeProvider
│   ├── page.tsx                          # Redirects to /dashboard
│   ├── error.tsx                         # Global error boundary
│   ├── not-found.tsx                     # 404
│   └── (app)/
│       ├── layout.tsx                    # App shell (header)
│       └── dashboard/
│           └── page.tsx                  # The dashboard
├── components/
│   ├── ui/                               # shadcn primitives
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── avatar.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── toggle-group.tsx
│   │   ├── toggle.tsx
│   │   └── chart.tsx
│   ├── theme-provider.tsx
│   └── dashboard/
│       ├── sprint-selector.tsx
│       ├── kpi-tile.tsx
│       ├── kpi-row.tsx
│       ├── burndown-chart.tsx
│       ├── assignee-filter.tsx
│       ├── ticket-card.tsx
│       └── ticket-columns.tsx
├── lib/
│   ├── types.ts                          # Sprint, TeamMember, Ticket, Status, etc.
│   ├── status.ts                         # Status order + label/colour map
│   ├── scope.ts                          # In-scope predicate + "complete" predicate
│   ├── kpi.ts                            # KPI calculations
│   ├── working-days.ts                   # Working-day count
│   ├── utils.ts                          # cn() (from shadcn init)
│   └── mock/
│       ├── team.ts
│       ├── sprints.ts
│       ├── tickets.ts
│       ├── burndown.ts
│       └── index.ts                      # Public exports
├── tests/
│   ├── unit/
│   │   ├── scope.test.ts
│   │   ├── kpi.test.ts
│   │   └── working-days.test.ts
│   └── e2e/
│       └── dashboard.spec.ts
├── biome.json
├── vitest.config.ts
├── playwright.config.ts
├── next.config.ts
├── components.json                       # shadcn config
├── tsconfig.json
├── package.json
├── .gitignore
├── .nvmrc                                # 24
├── .mcp.json                             # ALREADY EXISTS — do not overwrite
└── CLAUDE.md                             # ALREADY EXISTS — do not overwrite
```

### shadcn note

`CLAUDE.md` mandates the `shadcn-studio-mcp` MCP for component discovery. When a task says "install shadcn X", the engineer should:

1. **Preferred:** query `shadcn-studio-mcp` (`get-component-meta-content`, `get_add_command_for_components`) for the latest install command and any matching blocks.
2. **Fallback (MCP not yet approved):** use the canonical `pnpm dlx shadcn@latest add <component>` form shown in each task.

The `pnpm dlx` commands in this plan are valid in either case.

---

## Phase 1 — Bootstrap project

### Task 1: Scaffold Next.js 16 project

**Files:**
- Create: entire Next.js project structure (package.json, app/, etc.)

- [ ] **Step 1: Confirm working directory is empty (except .git, CLAUDE.md, .mcp.json, docs/)**

Run:
```bash
ls -la /Users/joew/.superset/projects/CV-Dash
```
Expected: `.git`, `.mcp.json`, `CLAUDE.md`, `docs/` only.

- [ ] **Step 2: Scaffold Next.js with create-next-app into a temp subdir, then move files up**

Doing it via a temp subdir avoids any non-empty-directory complaint:

```bash
pnpm create next-app@latest _scaffold \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --use-pnpm \
  --no-eslint \
  --yes
```

Then move the scaffold contents into the project root:

```bash
# Move all non-hidden files and dotfiles (except .git) up
shopt -s dotglob nullglob
mv _scaffold/* _scaffold/.[!.]* ./ 2>/dev/null || true
rmdir _scaffold
shopt -u dotglob
```

Verify `package.json`, `next.config.ts` (or `.mjs`), `app/`, `tsconfig.json` all live at project root and `CLAUDE.md`, `.mcp.json`, `docs/` are still intact:

```bash
ls -la
```
Expected: project root contains `package.json`, `app/`, `tsconfig.json`, `CLAUDE.md`, `.mcp.json`, `docs/`, `.git/`.

Then ensure dependencies are installed:

```bash
pnpm install
```

- [ ] **Step 3: Add `.nvmrc`**

Create `.nvmrc`:
```
24
```

- [ ] **Step 4: Verify the dev server starts**

Run:
```bash
pnpm dev --port 3000 &
DEV_PID=$!
sleep 5
curl -sSf http://localhost:3000 > /dev/null && echo "OK" || echo "FAIL"
kill $DEV_PID
```
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 16 project with Tailwind and TypeScript"
```

---

### Task 2: Replace default lint config with Biome

**Files:**
- Create: `biome.json`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install Biome**

```bash
pnpm add -D --save-exact @biomejs/biome
```

- [ ] **Step 2: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

- [ ] **Step 3: Add npm scripts**

Modify `package.json` `"scripts"` to include:
```json
{
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write .",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```
Expected: clean (no errors). If errors appear from scaffolded files, run `pnpm lint:fix` to auto-fix, then re-run `pnpm lint`. Fix any remaining manually.

- [ ] **Step 5: Commit**

```bash
git add biome.json package.json pnpm-lock.yaml
git commit -m "Replace ESLint with Biome for lint and format"
```

---

### Task 3: Set up Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/unit/smoke.test.ts`
- Modify: `package.json` (scripts), `tsconfig.json` (types)

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -D vitest @vitest/coverage-v8 happy-dom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add Vitest types to `tsconfig.json`**

Modify the `"compilerOptions"` block to ensure `"types"` includes `"vitest/globals"` (only if globals were ever enabled — they aren't here, so this step can be skipped if `compilerOptions.types` is not set).

- [ ] **Step 4: Create smoke test**

`tests/unit/smoke.test.ts`:
```ts
import { describe, expect, it } from "vitest";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Add `test` script**

In `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Run tests**

```bash
pnpm test
```
Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tests/unit/smoke.test.ts package.json pnpm-lock.yaml tsconfig.json
git commit -m "Set up Vitest with a smoke test"
```

---

### Task 4: Set up Playwright

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json` (scripts), `.gitignore`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
```

- [ ] **Step 2: Create `playwright.config.ts`**
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: Install Chromium browser**

```bash
pnpm exec playwright install chromium
```

- [ ] **Step 4: Append to `.gitignore`**

Add (if not present):
```
# Playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

- [ ] **Step 5: Add scripts**

In `package.json`:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 6: Commit (Playwright spec comes later — Task 23)**

```bash
git add playwright.config.ts package.json pnpm-lock.yaml .gitignore
git commit -m "Set up Playwright for E2E tests"
```

---

## Phase 2 — shadcn init + primitives

### Task 5: Initialize shadcn and install primitives

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/*.tsx`

- [ ] **Step 1: Run shadcn init**

```bash
pnpm dlx shadcn@latest init --yes --defaults
```

Expected: creates `components.json`, `lib/utils.ts`, and configures `app/globals.css` with the shadcn CSS variables (defaults to neutral base colour).

- [ ] **Step 2: Install primitives needed by the dashboard**

```bash
pnpm dlx shadcn@latest add button card badge avatar select separator toggle toggle-group chart
```

Expected: files created under `components/ui/`. Recharts is installed automatically with `chart`.

- [ ] **Step 3: Install `next-themes` for theme provider**

```bash
pnpm add next-themes
```

- [ ] **Step 4: Create `components/theme-provider.tsx`**

```tsx
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 5: Wire ThemeProvider into root layout**

Edit `app/layout.tsx` so the body wraps children in the ThemeProvider:
```tsx
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "CV-Dash",
  description: "Manager dashboard for the CV product team",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components.json components/ lib/utils.ts app/globals.css app/layout.tsx package.json pnpm-lock.yaml
git commit -m "Initialize shadcn and add UI primitives"
```

---

## Phase 3 — Types and mock data

### Task 6: Domain types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Create `lib/types.ts`**

```ts
export type Status =
  | "to-do"
  | "in-progress"
  | "in-review"
  | "peer-review"
  | "testing"
  | "done"
  | "closed";

export type TicketType = "story" | "bug" | "task";

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  avatarUrl?: string;
}

export interface Ticket {
  key: string;
  title: string;
  type: TicketType;
  status: Status;
  points: number;
  assigneeId: string;
}

export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  ticketKeys: string[];
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Add domain types"
```

---

### Task 7: Status enum metadata

**Files:**
- Create: `lib/status.ts`

- [ ] **Step 1: Create `lib/status.ts`**

```ts
import type { Status } from "@/lib/types";

export const IN_SCOPE_STATUSES = [
  "to-do",
  "in-progress",
  "in-review",
  "peer-review",
] as const satisfies readonly Status[];

export type InScopeStatus = (typeof IN_SCOPE_STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  "to-do": "To Do",
  "in-progress": "In Progress",
  "in-review": "In Review",
  "peer-review": "Peer Review",
  testing: "Testing",
  done: "Done",
  closed: "Closed",
};

// Tailwind classes for badge colour. Out-of-scope statuses included for completeness.
export const STATUS_BADGE_CLASS: Record<Status, string> = {
  "to-do": "bg-muted text-muted-foreground",
  "in-progress": "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  "in-review": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "peer-review": "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  testing: "bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200",
  done: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  closed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add lib/status.ts && git commit -m "Add status metadata and badge colour map"
```

---

### Task 8: Mock team and sprints

**Files:**
- Create: `lib/mock/team.ts`, `lib/mock/sprints.ts`

- [ ] **Step 1: Create `lib/mock/team.ts`**

```ts
import type { TeamMember } from "@/lib/types";

export const team: TeamMember[] = [
  { id: "joe-w",    name: "Joe Whitmore",  initials: "JW" },
  { id: "alex-k",   name: "Alex Kim",      initials: "AK" },
  { id: "priya-s",  name: "Priya Singh",   initials: "PS" },
  { id: "sam-l",    name: "Sam Lopez",     initials: "SL" },
  { id: "noor-h",   name: "Noor Hassan",   initials: "NH" },
  { id: "rachel-b", name: "Rachel Brooks", initials: "RB" },
  { id: "dan-r",    name: "Dan Reilly",    initials: "DR" },
  { id: "mia-t",    name: "Mia Tanaka",    initials: "MT" },
];

export const teamById: Record<string, TeamMember> = Object.fromEntries(
  team.map((member) => [member.id, member]),
);
```

- [ ] **Step 2: Create `lib/mock/sprints.ts`**

Today is 2026-05-14. Use 2-week sprints. Sprint 42 spans 2026-05-05 → 2026-05-18 (current).

```ts
import type { Sprint } from "@/lib/types";

export const currentSprintId = "sprint-42";

export const sprints: Sprint[] = [
  {
    id: "sprint-41",
    name: "Sprint 41",
    startDate: "2026-04-21",
    endDate: "2026-05-04",
    ticketKeys: [
      "CV-1200", "CV-1201", "CV-1202", "CV-1203", "CV-1204",
    ],
  },
  {
    id: "sprint-42",
    name: "Sprint 42 (current)",
    startDate: "2026-05-05",
    endDate: "2026-05-18",
    ticketKeys: [
      "CV-1300", "CV-1301", "CV-1302", "CV-1303", "CV-1304", "CV-1305",
      "CV-1306", "CV-1307", "CV-1308", "CV-1309", "CV-1310", "CV-1311",
      "CV-1312", "CV-1313", "CV-1314", "CV-1315",
    ],
  },
  {
    id: "sprint-43",
    name: "Sprint 43",
    startDate: "2026-05-19",
    endDate: "2026-06-01",
    ticketKeys: [
      "CV-1400", "CV-1401", "CV-1402", "CV-1403", "CV-1404",
    ],
  },
];

export const sprintById: Record<string, Sprint> = Object.fromEntries(
  sprints.map((s) => [s.id, s]),
);
```

- [ ] **Step 3: Commit**

```bash
pnpm typecheck && git add lib/mock/team.ts lib/mock/sprints.ts && git commit -m "Add mock team and sprints"
```

---

### Task 9: Mock tickets

**Files:**
- Create: `lib/mock/tickets.ts`

- [ ] **Step 1: Create `lib/mock/tickets.ts`**

Generate 16 tickets for the current sprint (sprint-42), distributed across the 4 in-scope statuses, plus a couple in `testing`/`done` to prove the scope filter excludes them. Plus a handful of tickets for sprints 41 and 43 so the sprint selector has content.

```ts
import type { Ticket } from "@/lib/types";

export const tickets: Ticket[] = [
  // ---- Sprint 42 (current) — in-scope statuses ----
  // To Do
  { key: "CV-1300", title: "Add sprint selector to dashboard", type: "story", status: "to-do", points: 3, assigneeId: "joe-w" },
  { key: "CV-1301", title: "Wire assignee filter to URL state", type: "task",  status: "to-do", points: 2, assigneeId: "alex-k" },
  { key: "CV-1302", title: "Build burndown chart legend", type: "story", status: "to-do", points: 3, assigneeId: "priya-s" },
  { key: "CV-1303", title: "Fix dark-mode contrast on KPI tile", type: "bug",   status: "to-do", points: 1, assigneeId: "sam-l" },

  // In Progress
  { key: "CV-1304", title: "Compose dashboard header with theme toggle", type: "story", status: "in-progress", points: 5, assigneeId: "rachel-b" },
  { key: "CV-1305", title: "Status badge colour map polish",             type: "task",  status: "in-progress", points: 2, assigneeId: "noor-h" },
  { key: "CV-1306", title: "Ticket card hover lift jitter",              type: "bug",   status: "in-progress", points: 1, assigneeId: "dan-r" },
  { key: "CV-1307", title: "Define burndown ideal-line algorithm",       type: "story", status: "in-progress", points: 3, assigneeId: "mia-t" },

  // In Review
  { key: "CV-1308", title: "Refactor mock data exports",       type: "task",  status: "in-review", points: 2, assigneeId: "joe-w" },
  { key: "CV-1309", title: "Avatar fallback for missing image", type: "bug",   status: "in-review", points: 1, assigneeId: "alex-k" },
  { key: "CV-1310", title: "Working-day helper edge cases",     type: "story", status: "in-review", points: 3, assigneeId: "priya-s" },

  // Peer Review (== "complete" for scope rule)
  { key: "CV-1311", title: "Type definitions for dashboard data",       type: "story", status: "peer-review", points: 3, assigneeId: "sam-l" },
  { key: "CV-1312", title: "shadcn ToggleGroup wrapping on narrow viewports", type: "bug",   status: "peer-review", points: 2, assigneeId: "rachel-b" },
  { key: "CV-1313", title: "Status colour tokens in Tailwind theme",    type: "task",  status: "peer-review", points: 2, assigneeId: "noor-h" },

  // Out of scope — proves scope filter
  { key: "CV-1314", title: "Smoke test for /dashboard",     type: "task", status: "testing", points: 2, assigneeId: "dan-r" },
  { key: "CV-1315", title: "Initial Next.js project setup", type: "task", status: "done",    points: 1, assigneeId: "mia-t" },

  // ---- Sprint 41 (past) ----
  { key: "CV-1200", title: "Sprint 41 prep task",      type: "task",  status: "done",        points: 2, assigneeId: "joe-w" },
  { key: "CV-1201", title: "Sprint 41 in-progress",    type: "story", status: "in-progress", points: 3, assigneeId: "alex-k" },
  { key: "CV-1202", title: "Sprint 41 to do",          type: "task",  status: "to-do",       points: 1, assigneeId: "priya-s" },
  { key: "CV-1203", title: "Sprint 41 peer review",    type: "story", status: "peer-review", points: 5, assigneeId: "sam-l" },
  { key: "CV-1204", title: "Sprint 41 bug",            type: "bug",   status: "in-review",   points: 2, assigneeId: "noor-h" },

  // ---- Sprint 43 (upcoming) ----
  { key: "CV-1400", title: "Sprint 43 planned story A", type: "story", status: "to-do", points: 5, assigneeId: "rachel-b" },
  { key: "CV-1401", title: "Sprint 43 planned story B", type: "story", status: "to-do", points: 3, assigneeId: "dan-r" },
  { key: "CV-1402", title: "Sprint 43 planned task A",  type: "task",  status: "to-do", points: 2, assigneeId: "mia-t" },
  { key: "CV-1403", title: "Sprint 43 planned task B",  type: "task",  status: "to-do", points: 2, assigneeId: "joe-w" },
  { key: "CV-1404", title: "Sprint 43 planned bug fix", type: "bug",   status: "to-do", points: 1, assigneeId: "alex-k" },
];

export const ticketByKey: Record<string, Ticket> = Object.fromEntries(
  tickets.map((t) => [t.key, t]),
);
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add lib/mock/tickets.ts && git commit -m "Add mock tickets for three sprints"
```

---

### Task 10: Mock burndown

**Files:**
- Create: `lib/mock/burndown.ts`

- [ ] **Step 1: Create `lib/mock/burndown.ts`**

Sprint 42 runs 2026-05-05 → 2026-05-18. Working days only (Mon–Fri). Committed = 33 points (computed from sprint-42 in-scope tickets above: 3+2+3+1+5+2+1+3+2+1+3+3+2+2 = 33). Today is 2026-05-14 (Thu). Actual burndown should reach `33 - 7 = 26` remaining by today (7 points reached Peer Review = CV-1311 (3) + CV-1312 (2) + CV-1313 (2)).

```ts
import type { BurndownPoint } from "@/lib/types";

// Sprint 42: 2026-05-05 (Tue) -> 2026-05-18 (Mon). Working days only.
// Ideal line drops linearly from 33 to 0 across the working-day timeline.
// Actual is a step pattern that reaches 26 today (2026-05-14).
const COMMITTED = 33;
const WORKING_DAYS = [
  "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08", // wk 1: Tue-Fri
  "2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15", // wk 2: Mon-Fri
  "2026-05-18", // wk 3: Mon (last day)
];

const ACTUAL_REMAINING = [33, 33, 31, 30, 28, 28, 27, 26, /* future */ 26, 26];

export const burndownBySprint: Record<string, BurndownPoint[]> = {
  "sprint-42": WORKING_DAYS.map((date, i) => ({
    date,
    remaining: ACTUAL_REMAINING[i],
    ideal: Math.round((COMMITTED * (WORKING_DAYS.length - 1 - i)) / (WORKING_DAYS.length - 1)),
  })),
};
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add lib/mock/burndown.ts && git commit -m "Add mock burndown for current sprint"
```

---

### Task 11: Mock data barrel export

**Files:**
- Create: `lib/mock/index.ts`

- [ ] **Step 1: Create `lib/mock/index.ts`**

```ts
export { team, teamById } from "./team";
export { sprints, sprintById, currentSprintId } from "./sprints";
export { tickets, ticketByKey } from "./tickets";
export { burndownBySprint } from "./burndown";
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add lib/mock/index.ts && git commit -m "Add mock data barrel export"
```

---

## Phase 4 — Pure logic (TDD)

### Task 12: Working-days helper (TDD)

**Files:**
- Create: `tests/unit/working-days.test.ts`, `lib/working-days.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/working-days.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { workingDaysBetween } from "@/lib/working-days";

describe("workingDaysBetween", () => {
  it("counts Mon-Fri only, inclusive of both endpoints", () => {
    // Mon 2026-05-04 to Fri 2026-05-08 = 5 working days
    expect(workingDaysBetween("2026-05-04", "2026-05-08")).toBe(5);
  });

  it("excludes weekends", () => {
    // Sat 2026-05-09 to Sun 2026-05-10 = 0 working days
    expect(workingDaysBetween("2026-05-09", "2026-05-10")).toBe(0);
  });

  it("returns 0 when end is before start", () => {
    expect(workingDaysBetween("2026-05-10", "2026-05-04")).toBe(0);
  });

  it("counts a single working day as 1", () => {
    expect(workingDaysBetween("2026-05-14", "2026-05-14")).toBe(1);
  });

  it("clamps to 0 (not negative) for past end dates", () => {
    expect(workingDaysBetween("2026-05-20", "2026-05-14")).toBe(0);
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
pnpm test tests/unit/working-days.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/working-days'`.

- [ ] **Step 3: Implement**

`lib/working-days.ts`:
```ts
/**
 * Count working days (Mon-Fri) between two ISO date strings, inclusive of both endpoints.
 * Returns 0 if end is before start.
 */
export function workingDaysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
```

- [ ] **Step 4: Verify it passes**

```bash
pnpm test tests/unit/working-days.test.ts
```
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/working-days.test.ts lib/working-days.ts
git commit -m "Add working-days helper with tests"
```

---

### Task 13: Scope predicates (TDD)

**Files:**
- Create: `tests/unit/scope.test.ts`, `lib/scope.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/scope.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Ticket } from "@/lib/types";
import { isInScope, isComplete, filterInScope } from "@/lib/scope";

const t = (status: Ticket["status"]): Ticket => ({
  key: "CV-1",
  title: "x",
  type: "task",
  status,
  points: 1,
  assigneeId: "joe-w",
});

describe("isInScope", () => {
  it.each([
    ["to-do", true],
    ["in-progress", true],
    ["in-review", true],
    ["peer-review", true],
    ["testing", false],
    ["done", false],
    ["closed", false],
  ] as const)("status=%s -> %s", (status, expected) => {
    expect(isInScope(t(status))).toBe(expected);
  });
});

describe("isComplete", () => {
  it("returns true only for peer-review", () => {
    expect(isComplete(t("peer-review"))).toBe(true);
    expect(isComplete(t("in-review"))).toBe(false);
    expect(isComplete(t("done"))).toBe(false);
  });
});

describe("filterInScope", () => {
  it("keeps only in-scope tickets", () => {
    const tickets = [t("to-do"), t("done"), t("peer-review"), t("testing")];
    expect(filterInScope(tickets)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
pnpm test tests/unit/scope.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/scope.ts`:
```ts
import type { Ticket } from "@/lib/types";
import { IN_SCOPE_STATUSES } from "@/lib/status";

const IN_SCOPE = new Set<string>(IN_SCOPE_STATUSES);

export function isInScope(ticket: Ticket): boolean {
  return IN_SCOPE.has(ticket.status);
}

export function isComplete(ticket: Ticket): boolean {
  return ticket.status === "peer-review";
}

export function filterInScope(tickets: Ticket[]): Ticket[] {
  return tickets.filter(isInScope);
}
```

- [ ] **Step 4: Verify it passes**

```bash
pnpm test tests/unit/scope.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/scope.test.ts lib/scope.ts
git commit -m "Add scope predicates with tests"
```

---

### Task 14: KPI calculations (TDD)

**Files:**
- Create: `tests/unit/kpi.test.ts`, `lib/kpi.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/kpi.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Sprint, Ticket } from "@/lib/types";
import { sprintKpis } from "@/lib/kpi";

const ticket = (key: string, status: Ticket["status"], points: number): Ticket => ({
  key,
  title: "x",
  type: "task",
  status,
  points,
  assigneeId: "joe-w",
});

const sprint: Sprint = {
  id: "s1",
  name: "S1",
  startDate: "2026-05-05",
  endDate: "2026-05-18",
  ticketKeys: ["CV-1", "CV-2", "CV-3", "CV-4", "CV-5"],
};

describe("sprintKpis", () => {
  it("sums points for in-scope tickets, ignores out-of-scope", () => {
    const tickets = [
      ticket("CV-1", "to-do", 3),
      ticket("CV-2", "in-progress", 5),
      ticket("CV-3", "peer-review", 2),
      ticket("CV-4", "done", 100),     // ignored
      ticket("CV-5", "testing", 100),  // ignored
    ];
    const today = "2026-05-14";
    const kpis = sprintKpis(sprint, tickets, today);

    expect(kpis.pointsCommitted).toBe(10);
    expect(kpis.pointsToPr).toBe(2);
    expect(kpis.percentComplete).toBe(20);
    // 2026-05-14 (Thu) -> 2026-05-18 (Mon) inclusive = Thu, Fri, Mon = 3 working days
    expect(kpis.daysRemaining).toBe(3);
  });

  it("returns 0% complete when committed is 0", () => {
    const kpis = sprintKpis(sprint, [], "2026-05-14");
    expect(kpis.pointsCommitted).toBe(0);
    expect(kpis.percentComplete).toBe(0);
  });

  it("clamps daysRemaining to 0 after sprint end", () => {
    const tickets = [ticket("CV-1", "to-do", 3)];
    const kpis = sprintKpis(sprint, tickets, "2026-06-01");
    expect(kpis.daysRemaining).toBe(0);
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
pnpm test tests/unit/kpi.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/kpi.ts`:
```ts
import type { Sprint, Ticket } from "@/lib/types";
import { filterInScope, isComplete } from "@/lib/scope";
import { workingDaysBetween } from "@/lib/working-days";

export interface SprintKpis {
  pointsCommitted: number;
  pointsToPr: number;
  percentComplete: number; // 0..100, one decimal place precision
  daysRemaining: number;
}

export function sprintKpis(sprint: Sprint, tickets: Ticket[], todayISO: string): SprintKpis {
  const inSprint = tickets.filter((t) => sprint.ticketKeys.includes(t.key));
  const inScope = filterInScope(inSprint);

  const pointsCommitted = inScope.reduce((s, t) => s + t.points, 0);
  const pointsToPr = inScope.filter(isComplete).reduce((s, t) => s + t.points, 0);
  const percentComplete = pointsCommitted === 0
    ? 0
    : Math.round((pointsToPr / pointsCommitted) * 1000) / 10;

  const daysRemaining = workingDaysBetween(todayISO, sprint.endDate);

  return { pointsCommitted, pointsToPr, percentComplete, daysRemaining };
}
```

- [ ] **Step 4: Verify it passes**

```bash
pnpm test tests/unit/kpi.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/kpi.test.ts lib/kpi.ts
git commit -m "Add sprint KPI calculations with tests"
```

---

## Phase 5 — UI components

### Task 15: App shell and landing redirect

**Files:**
- Modify: `app/page.tsx`
- Create: `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`, `app/error.tsx`, `app/not-found.tsx`

- [ ] **Step 1: Replace landing page with redirect**

Replace `app/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
```

- [ ] **Step 2: Create `app/(app)/layout.tsx`**

```tsx
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <span className="font-semibold tracking-tight">CV-Dash</span>
          <span className="text-sm text-muted-foreground">Product Team</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Create stub dashboard page**

`app/(app)/dashboard/page.tsx`:
```tsx
export default function DashboardPage() {
  return <div>Dashboard placeholder</div>;
}
```

(Will be filled in by Task 22.)

- [ ] **Step 4: Error and 404 boundaries**

`app/error.tsx`:
```tsx
"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-foreground px-3 py-1.5 text-sm text-background"
      >
        Try again
      </button>
    </div>
  );
}
```

`app/not-found.tsx`:
```tsx
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h2 className="text-lg font-semibold">Page not found</h2>
    </div>
  );
}
```

- [ ] **Step 5: Run dev server and smoke check**

```bash
pnpm dev &
DEV_PID=$!
sleep 5
curl -sSL http://localhost:3000 | grep -q "Dashboard placeholder" && echo OK || echo FAIL
kill $DEV_PID
```
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add app/
git commit -m "Add app shell, landing redirect, error and 404 boundaries"
```

---

### Task 16: Sprint selector component

**Files:**
- Create: `components/dashboard/sprint-selector.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Sprint } from "@/lib/types";

interface Props {
  sprints: Sprint[];
  value: string;
  onChange: (sprintId: string) => void;
}

export function SprintSelector({ sprints, value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[220px]" aria-label="Select sprint">
        <SelectValue placeholder="Select sprint" />
      </SelectTrigger>
      <SelectContent>
        {sprints.map((sprint) => (
          <SelectItem key={sprint.id} value={sprint.id}>
            {sprint.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add components/dashboard/sprint-selector.tsx && git commit -m "Add sprint selector"
```

---

### Task 17: KPI tile and KPI row

**Files:**
- Create: `components/dashboard/kpi-tile.tsx`, `components/dashboard/kpi-row.tsx`

- [ ] **Step 1: Create `kpi-tile.tsx`**

```tsx
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  label: string;
  value: string;
  hint?: string;
}

export function KpiTile({ label, value, hint }: Props) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `kpi-row.tsx`**

```tsx
import { KpiTile } from "./kpi-tile";
import type { SprintKpis } from "@/lib/kpi";

interface Props {
  kpis: SprintKpis;
}

export function KpiRow({ kpis }: Props) {
  const pct = kpis.percentComplete.toFixed(1);
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiTile label="Points committed" value={String(kpis.pointsCommitted)} hint="In-scope tickets only" />
      <KpiTile label="Points to PR" value={String(kpis.pointsToPr)} hint="Reached Peer Review" />
      <KpiTile label="% complete" value={`${pct}%`} />
      <KpiTile label="Days remaining" value={String(kpis.daysRemaining)} hint="Working days (Mon-Fri)" />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck && git add components/dashboard/kpi-tile.tsx components/dashboard/kpi-row.tsx && git commit -m "Add KPI tile and row"
```

---

### Task 18: Burndown chart

**Files:**
- Create: `components/dashboard/burndown-chart.tsx`

- [ ] **Step 1: Create the chart**

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { BurndownPoint } from "@/lib/types";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

const config = {
  remaining: { label: "Actual", color: "var(--chart-1)" },
  ideal:     { label: "Ideal",  color: "var(--chart-2)" },
} satisfies ChartConfig;

interface Props {
  data: BurndownPoint[];
}

export function BurndownChart({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Burndown</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[280px] w-full">
          <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="ideal"
              stroke="var(--color-ideal)"
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="remaining"
              stroke="var(--color-remaining)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add components/dashboard/burndown-chart.tsx && git commit -m "Add burndown chart"
```

---

### Task 19: Assignee filter

**Files:**
- Create: `components/dashboard/assignee-filter.tsx`

- [ ] **Step 1: Create the filter**

```tsx
"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TeamMember } from "@/lib/types";

interface Props {
  team: TeamMember[];
  value: string[]; // assignee ids
  onChange: (ids: string[]) => void;
}

export function AssigneeFilter({ team, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Assignees</span>
      <ToggleGroup
        type="multiple"
        value={value}
        onValueChange={onChange}
        className="flex flex-wrap gap-1"
      >
        {team.map((member) => (
          <ToggleGroupItem
            key={member.id}
            value={member.id}
            aria-label={member.name}
            className="h-8 gap-2 px-2 data-[state=on]:bg-secondary"
          >
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[10px]">{member.initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs">{member.name.split(" ")[0]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add components/dashboard/assignee-filter.tsx && git commit -m "Add assignee filter"
```

---

### Task 20: Ticket card

**Files:**
- Create: `components/dashboard/ticket-card.tsx`

- [ ] **Step 1: Create the card**

```tsx
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/status";
import type { Ticket, TeamMember } from "@/lib/types";
import { Bug, BookOpen, CircleCheck } from "lucide-react";

const JIRA_BASE = "https://carevicinity.atlassian.net/browse";

const TYPE_ICON = {
  story: BookOpen,
  bug: Bug,
  task: CircleCheck,
} as const;

interface Props {
  ticket: Ticket;
  assignee: TeamMember | undefined;
}

export function TicketCard({ ticket, assignee }: Props) {
  const TypeIcon = TYPE_ICON[ticket.type];
  return (
    <a
      href={`${JIRA_BASE}/${ticket.key}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`${ticket.key}: ${ticket.title}`}
      className="block transition-shadow hover:shadow-md"
    >
      <Card>
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs">
              <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-mono text-muted-foreground">{ticket.key}</span>
            </span>
            <Badge className={STATUS_BADGE_CLASS[ticket.status]} variant="secondary">
              {STATUS_LABEL[ticket.status]}
            </Badge>
          </div>
          <p className="line-clamp-2 text-sm font-medium leading-snug">{ticket.title}</p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">{assignee?.initials ?? "??"}</AvatarFallback>
              </Avatar>
              <span className="truncate">{assignee?.name ?? "Unassigned"}</span>
            </span>
            <Badge variant="outline" className="font-mono">{ticket.points}</Badge>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add components/dashboard/ticket-card.tsx && git commit -m "Add ticket card"
```

---

### Task 21: Ticket columns

**Files:**
- Create: `components/dashboard/ticket-columns.tsx`

- [ ] **Step 1: Create the kanban columns**

```tsx
import { TicketCard } from "./ticket-card";
import { Badge } from "@/components/ui/badge";
import { IN_SCOPE_STATUSES, STATUS_LABEL, type InScopeStatus } from "@/lib/status";
import type { TeamMember, Ticket } from "@/lib/types";

interface Props {
  tickets: Ticket[];
  team: TeamMember[];
}

export function TicketColumns({ tickets, team }: Props) {
  const byStatus: Record<InScopeStatus, Ticket[]> = {
    "to-do": [],
    "in-progress": [],
    "in-review": [],
    "peer-review": [],
  };
  for (const t of tickets) {
    if ((IN_SCOPE_STATUSES as readonly string[]).includes(t.status)) {
      byStatus[t.status as InScopeStatus].push(t);
    }
  }

  const teamById = Object.fromEntries(team.map((m) => [m.id, m]));

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 snap-x md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-4">
      {IN_SCOPE_STATUSES.map((status) => (
        <section
          key={status}
          aria-label={STATUS_LABEL[status]}
          className="flex min-w-[260px] flex-col gap-3 snap-start md:min-w-0"
        >
          <header className="sticky top-0 flex items-center justify-between gap-2 border-b bg-background py-2">
            <h3 className="text-sm font-medium">{STATUS_LABEL[status]}</h3>
            <Badge variant="outline">{byStatus[status].length}</Badge>
          </header>
          <div className="flex flex-col gap-3">
            {byStatus[status].map((t) => (
              <TicketCard key={t.key} ticket={t} assignee={teamById[t.assigneeId]} />
            ))}
            {byStatus[status].length === 0 ? (
              <p className="text-xs text-muted-foreground">No tickets</p>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck && git add components/dashboard/ticket-columns.tsx && git commit -m "Add ticket columns"
```

---

## Phase 6 — Wire it all together

### Task 22: Assemble the dashboard page

**Files:**
- Replace: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Replace dashboard page**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { AssigneeFilter } from "@/components/dashboard/assignee-filter";
import { BurndownChart } from "@/components/dashboard/burndown-chart";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { SprintSelector } from "@/components/dashboard/sprint-selector";
import { TicketColumns } from "@/components/dashboard/ticket-columns";
import { sprintKpis } from "@/lib/kpi";
import {
  burndownBySprint,
  currentSprintId,
  sprints,
  sprintById,
  team,
  tickets,
} from "@/lib/mock";

const TODAY = "2026-05-14";

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();

  const sprintId = params.get("sprint") ?? currentSprintId;
  const sprint = sprintById[sprintId] ?? sprintById[currentSprintId];
  const assigneeIds = (params.get("assignees") ?? "").split(",").filter(Boolean);

  const sprintTickets = useMemo(
    () => tickets.filter((t) => sprint.ticketKeys.includes(t.key)),
    [sprint],
  );

  const kpis = useMemo(() => sprintKpis(sprint, tickets, TODAY), [sprint]);
  const burndown = burndownBySprint[sprint.id] ?? [];

  const visibleTickets = useMemo(
    () =>
      assigneeIds.length === 0
        ? sprintTickets
        : sprintTickets.filter((t) => assigneeIds.includes(t.assigneeId)),
    [sprintTickets, assigneeIds],
  );

  function update(next: { sprintId?: string; assigneeIds?: string[] }) {
    const sp = new URLSearchParams(params.toString());
    if (next.sprintId !== undefined) sp.set("sprint", next.sprintId);
    if (next.assigneeIds !== undefined) {
      if (next.assigneeIds.length === 0) sp.delete("assignees");
      else sp.set("assignees", next.assigneeIds.join(","));
    }
    router.replace(`/dashboard?${sp.toString()}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{sprint.name}</h1>
        <SprintSelector
          sprints={sprints}
          value={sprint.id}
          onChange={(id) => update({ sprintId: id })}
        />
      </div>

      <KpiRow kpis={kpis} />

      <BurndownChart data={burndown} />

      <AssigneeFilter
        team={team}
        value={assigneeIds}
        onChange={(ids) => update({ assigneeIds: ids })}
      />

      <TicketColumns tickets={visibleTickets} team={team} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <DashboardInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```
Expected: clean.

- [ ] **Step 3: Manual smoke check in browser**

```bash
pnpm dev
```

Open http://localhost:3000:
- Lands on `/dashboard`.
- Shows "Sprint 42 (current)" by default.
- Four KPI tiles render with numbers (committed=33, to PR=7, % complete=21.2%, days remaining=3).
- Burndown chart renders with two lines.
- Assignee chips render.
- Four columns of cards render. Tickets in `testing`/`done` (CV-1314, CV-1315) are NOT shown.

Verify URL state by:
- Changing sprint dropdown → URL updates `?sprint=sprint-41`.
- Toggling an assignee chip → URL updates `&assignees=joe-w`.
- Clicking a card → opens `https://carevicinity.atlassian.net/browse/CV-...` in a new tab.

Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/dashboard/page.tsx
git commit -m "Assemble dashboard page with mock data and URL state"
```

---

## Phase 7 — E2E verification

### Task 23: Playwright smoke test

**Files:**
- Create: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from "@playwright/test";

test.describe("Dashboard scaffold", () => {
  test("renders KPIs, columns, and Jira-linked cards", async ({ page }) => {
    await page.goto("/");

    // Redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // KPI tiles
    await expect(page.getByText("Points committed")).toBeVisible();
    await expect(page.getByText("Points to PR")).toBeVisible();
    await expect(page.getByText("% complete")).toBeVisible();
    await expect(page.getByText("Days remaining")).toBeVisible();

    // Burndown chart
    await expect(page.getByText("Burndown")).toBeVisible();

    // Columns
    for (const label of ["To Do", "In Progress", "In Review", "Peer Review"]) {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }

    // At least one ticket card links to Jira
    const firstCard = page.locator('a[href^="https://carevicinity.atlassian.net/browse/CV-"]').first();
    await expect(firstCard).toHaveAttribute("target", "_blank");
    await expect(firstCard).toHaveAttribute("rel", /noreferrer/);

    // Out-of-scope tickets must not render
    await expect(page.getByText("Smoke test for /dashboard")).toHaveCount(0); // CV-1314 (testing)
    await expect(page.getByText("Initial Next.js project setup")).toHaveCount(0); // CV-1315 (done)
  });

  test("sprint selector changes URL", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Select sprint").click();
    await page.getByRole("option", { name: "Sprint 41" }).click();
    await expect(page).toHaveURL(/sprint=sprint-41/);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test:e2e
```
Expected: 2 passed.

If the test fails on the first run because the dev server hasn't compiled the page yet, re-run once.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/dashboard.spec.ts
git commit -m "Add Playwright smoke test for dashboard"
```

---

## Phase 8 — Final cleanup

### Task 24: Full verification + cleanup

**Files:** none new

- [ ] **Step 1: Run the full verification suite**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```
Expected: all green.

- [ ] **Step 2: Final commit if any auto-fixes**

```bash
git status
```
If clean, skip. Otherwise:
```bash
git add -A
git commit -m "Final lint/format cleanup"
```

- [ ] **Step 3: Push to remote (if remote configured)**

Skip if no remote. Otherwise:
```bash
git push origin main
```

---

## Acceptance — all spec criteria met

When this plan completes, the dashboard spec's acceptance criteria are satisfied:

| Criterion | Where |
|---|---|
| Sprint dropdown updates KPIs/burndown/cards | Task 22 manual check + Task 23 URL test |
| Assignee chips filter cards only | Task 22 manual check |
| Card click opens Jira in new tab | Task 23 link assertion |
| KPI values match hand-calc | Task 14 unit tests + Task 22 manual check |
| Burndown renders both series | Task 18 + Task 23 |
| `testing`/`done`/`closed` excluded | Task 13 + Task 23 explicit exclusion test |
| Responsive at breakpoints | Task 21 grid classes + Task 17 grid classes |
| Light + dark mode render | shadcn theme provider (Task 5) + status colour map (Task 7) covers both |
| URL search params survive refresh | Task 22 |
| Playwright smoke test | Task 23 |
