# CV-Dash Dashboard — UI Structure Design

**Date:** 2026-05-14
**Status:** Approved
**Author:** Joe W (via brainstorm)
**Builds on:** `2026-05-14-tech-stack-design.md`

## Goal

A single-page manager dashboard for at-a-glance sprint status. Read-only. This spec covers UI structure and components only — data is mocked. Real Jira wiring is a follow-up spec.

## Audience

Product team managers. Desktop-first. Light + dark mode.

## Core scoping rule (applies to every metric and view)

- **In-scope tickets** = those currently in one of: `To Do`, `In Progress`, `In Review`, `Peer Review`.
- **"Complete"** = ticket has reached `Peer Review`.
- Tickets in `Testing`, `Done`, `Closed` are out of scope for KPIs, burndown, and cards.

This rule is encoded in a single helper (`lib/scope.ts`) and used by every metric calculation and filter.

## Page layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header                                Sprint selector (▼)       │
├─────────────────────────────────────────────────────────────────┤
│  KPI tiles (4 across)                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Points   │ │ Points   │ │  %       │ │ Days     │            │
│  │ committed│ │ to PR    │ │ complete │ │ remaining│            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
├─────────────────────────────────────────────────────────────────┤
│  Burndown chart (full width)                                     │
├─────────────────────────────────────────────────────────────────┤
│  Assignee filter (chip row)                                      │
├─────────────────────────────────────────────────────────────────┤
│  Ticket columns (kanban, 4 across)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ To Do    │ │ In Prog. │ │ In Review│ │ Peer Rev.│            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## KPI tiles

| Tile | Label | Definition |
|---|---|---|
| 1 | Points committed | Sum of story points across all in-scope tickets in the selected sprint |
| 2 | Points to PR | Sum of points for tickets currently in `Peer Review` |
| 3 | % complete | `Points to PR ÷ Points committed`, rendered as a percentage with a single decimal |
| 4 | Days remaining | Working days (Mon–Fri) between today and the sprint end date; clamped to 0 |

Each tile is a shadcn `Card` with a large numeric value, a label below, and optional delta/sub-text (deferred).

## Burndown chart

- Type: line chart, shadcn `chart` (Recharts under the hood).
- **X-axis:** sprint days from start date to end date.
- **Y-axis:** story points remaining (committed − reached Peer Review).
- **Series:**
  - `Ideal`: straight line from `Points committed` on day 0 to `0` on the last day.
  - `Actual`: step line built from daily snapshots; today's point is the live value.
- Tooltip on hover shows date + both series values.
- Scope rule applied throughout — only in-scope tickets contribute.

## Assignee filter

- shadcn `ToggleGroup` (single row of avatar chips) — multi-select, free toggle.
- Each chip shows avatar + first name; tooltip shows full name.
- `All` toggle resets selection (visually distinct from individual chips).
- Filter affects **only** the card columns. KPIs and burndown remain sprint-wide.

## Ticket cards

Card content:
```
┌──────────────────────────────────────┐
│ [type icon] CV-1234   [Status badge] │
│                                      │
│ Ticket title (2-line clamp)          │
│                                      │
│ [avatar] Joe Whitmore        [ 5 ]   │
└──────────────────────────────────────┘
```

- **Type icon** (lucide-react): `BookOpen` = Story, `Bug` = Bug, `CircleCheck` = Task.
- **Ticket key**: monospaced, e.g. `CV-1234`.
- **Status badge**: shadcn `Badge` with a status-specific colour token (`secondary` / `outline` etc., mapped in a small helper).
- **Title**: 2-line clamp via Tailwind `line-clamp-2`.
- **Assignee**: shadcn `Avatar` + name.
- **Story points**: small rounded badge with the number.
- **Interaction**: whole card is an `<a target="_blank" rel="noreferrer">` to `https://carevicinity.atlassian.net/browse/{ticketKey}`. Hover lifts the card via shadow.

## Ticket columns

- 4 columns of equal width on `lg` and up: `To Do`, `In Progress`, `In Review`, `Peer Review`.
- Each column header shows status name + count badge.
- Cards stack vertically inside the column, separated by `gap-3`.
- Below `lg`: columns become a horizontal scroll lane with snap-x; on mobile (`< md`) they stack vertically with sticky headers.

## Components (all via `shadcn-studio-mcp`)

| Need | shadcn primitive | Notes |
|---|---|---|
| Sprint selector | `select` | Sprint name + date range |
| KPI tile | `card` | Plus a small `KpiTile` wrapper |
| Burndown chart | `chart` | Recharts line chart, two series |
| Assignee filter | `toggle-group` + `avatar` | Avatars from `lib/mock/team.ts` |
| Status badge | `badge` | Colour map in `lib/status.ts` |
| Ticket card | `card` + `badge` + `avatar` | Anchor wraps the card |
| Layout | `separator`, container utilities | |
| Theme | `theme-provider` + toggle (later) | Dark + light |

The MCP will be queried for any **block** (e.g. stat-row, kanban-column) that already matches before composing from primitives.

## File structure

```
app/
├── page.tsx                          # Redirects to /dashboard
├── (app)/
│   ├── layout.tsx                    # Header + shell
│   └── dashboard/
│       └── page.tsx                  # The dashboard
components/
├── ui/                               # shadcn primitives (MCP-installed)
└── dashboard/
    ├── sprint-selector.tsx
    ├── kpi-tile.tsx
    ├── kpi-row.tsx
    ├── burndown-chart.tsx
    ├── assignee-filter.tsx
    ├── ticket-card.tsx
    ├── ticket-column.tsx
    └── ticket-columns.tsx
lib/
├── mock/
│   ├── sprints.ts
│   ├── team.ts
│   ├── tickets.ts
│   ├── burndown.ts
│   └── index.ts                      # public exports
├── scope.ts                          # in-scope predicate + complete-predicate
├── status.ts                         # status enum + colour map
└── types.ts                          # Sprint, TeamMember, Ticket, Status
```

## State management

- **Sprint** and **assignee filter** held in URL search params:
  - `?sprint={sprintId}&assignees={comma-separated-ids}`
- Read via `useSearchParams`, update via `useRouter().replace()`.
- This keeps views shareable and refresh-safe and avoids any client state library.

## Data types (mock-shaped — same shapes used for real data later)

```ts
type Status = "to-do" | "in-progress" | "in-review" | "peer-review"
            | "testing" | "done" | "closed";

type TicketType = "story" | "bug" | "task";

interface TeamMember {
  id: string;        // e.g. "joe-whitmore"
  name: string;      // "Joe Whitmore"
  initials: string;  // "JW"
  avatarUrl?: string;
}

interface Ticket {
  key: string;       // "CV-1234"
  title: string;
  type: TicketType;
  status: Status;
  points: number;
  assigneeId: string;
}

interface Sprint {
  id: string;        // "CV-Sprint-42"
  name: string;      // "Sprint 42"
  startDate: string; // ISO date
  endDate: string;   // ISO date
  ticketKeys: string[];
}

interface BurndownPoint {
  date: string;          // ISO date
  remaining: number;     // actual
  ideal: number;
}
```

## Mock data (this phase)

- **3 sprints**: one current (today within range), one past, one upcoming.
- **8 team members** with consistent IDs/initials.
- **~25 tickets** distributed across the 4 in-scope statuses, plus a handful of `done`/`testing` to prove scope filtering works.
- **Burndown** for the current sprint: a `BurndownPoint[]` covering each working day from sprint start to today, with plausible step pattern.

All exported from `lib/mock/` so the swap to real Jira data later is a single boundary.

## Responsiveness

| Breakpoint | KPI row | Burndown | Columns |
|---|---|---|---|
| `< md` (mobile) | 2×2 grid | Full width, smaller | Stacked vertically with sticky headers |
| `md` – `lg` | 4 across | Full width | Horizontal scroll lane, snap-x |
| `≥ lg` | 4 across | Full width | 4 columns side by side |

## Theme

- shadcn `ThemeProvider` with `class` strategy on `<html>`.
- Default to system preference; theme toggle deferred (next iteration).

## Accessibility

- Status badge colours must also be distinguishable by label text (no colour-only meaning).
- Card link must be reachable via keyboard and announce ticket key + title.
- Burndown chart receives an accessible label and a screen-reader-only summary of the latest values.

## Out of scope (deferred to next spec)

- Real Jira data wiring, caching, refresh
- Auth gating beyond Clerk session (no role-based logic)
- Theme toggle UI
- Drill-down (clicking a tile/series to focus a subset)
- Historical sprint comparison
- Storybook or visual regression tests

## Acceptance criteria

UI structure is "built" when, with mock data:

1. Selecting a different sprint in the dropdown updates KPIs, burndown, and cards.
2. Toggling assignee chips filters the cards (KPIs and burndown remain sprint-wide).
3. Clicking a ticket card opens the Jira URL in a new tab.
4. KPI values match a hand-calculation against the mock data.
5. Burndown renders both ideal and actual series with correct end points.
6. Cards in `Testing`/`Done`/`Closed` are not rendered anywhere.
7. Layout is responsive at `< md`, `md–lg`, `≥ lg` per the table above.
8. Light and dark mode both render without contrast issues.
9. URL search params reflect sprint + assignee filter and survive refresh.
10. Playwright smoke test (`tests/e2e/dashboard.spec.ts`) loads `/dashboard`, asserts the four KPI tiles render, and asserts a ticket card link points at `https://carevicinity.atlassian.net/browse/...`.
