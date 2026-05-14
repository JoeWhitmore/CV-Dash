# CV-Dash — Tech Stack Design

**Date:** 2026-05-14
**Status:** Approved
**Author:** Joe W (via brainstorm)

## Goal

Establish the foundational tech stack for CV-Dash so all subsequent feature work has a consistent, opinionated foundation. Greenfield project, no existing code to preserve.

## Constraints

- **shadcn/ui is mandatory** for all UI work (per `CLAUDE.md`). All components installed and composed via the `shadcn-studio-mcp` MCP server already registered in `.mcp.json`.
- **Vercel is the deployment target.** Choices favour native Vercel integrations and Vercel Marketplace products for auto-provisioning.
- **TypeScript everywhere.** No JS, no mixed runtimes.

## Architecture

Single full-stack **Next.js 16 (App Router)** application deployed on **Vercel**. React UI (Server and Client Components) and the API surface (Route Handlers, Server Actions) live in one repo, one deploy, one set of env vars.

```
┌─────────────────────────────────────────────────┐
│  Browser (React Client Components)              │
└────────────────┬────────────────────────────────┘
                 │ HTTP
┌────────────────▼────────────────────────────────┐
│  Next.js on Vercel Fluid Compute                │
│  ┌──────────────────────────────────────────┐   │
│  │ Routing Middleware (Clerk auth check)    │   │
│  └──────────────────┬───────────────────────┘   │
│  ┌──────────────────▼───────────────────────┐   │
│  │ Server Components / Route Handlers /     │   │
│  │ Server Actions                           │   │
│  └──────────────────┬───────────────────────┘   │
│  ┌──────────────────▼───────────────────────┐   │
│  │ Drizzle ORM (lib/db)                     │   │
│  └──────────────────┬───────────────────────┘   │
└─────────────────────┼───────────────────────────┘
                      │ @neondatabase/serverless
┌─────────────────────▼───────────────────────────┐
│  Neon Postgres (Vercel Marketplace)             │
└─────────────────────────────────────────────────┘
```

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | Vercel-native, React Server Components, full-stack in one repo |
| UI primitives | shadcn/ui installed via `shadcn-studio-mcp` | Mandated by `CLAUDE.md` |
| Styling | Tailwind CSS v4 + CSS variables | shadcn standard, dark mode via class strategy |
| Database | Neon Postgres via Vercel Marketplace | Serverless, branch-per-preview, env auto-provisioned |
| ORM | Drizzle ORM + drizzle-kit | TS-first schema, lightweight runtime, serverless-friendly |
| DB driver | `@neondatabase/serverless` | HTTP/WS driver tuned for Fluid Compute |
| Auth | Clerk via Vercel Marketplace | Drop-in `<SignIn/>`, `<UserButton/>`, env auto-provisioned |
| Testing — unit/integration | Vitest | Vite-powered, fast, TS-native |
| Testing — E2E | Playwright | Real browser, runs against preview URLs |
| Package manager | pnpm | Fast, disk-efficient, Vercel-supported |
| Lint + format | Biome | One tool, fast, replaces ESLint + Prettier |
| Runtime | Node.js 24 LTS on Fluid Compute (default) | Vercel default, full Node API surface |
| Project config | `vercel.ts` (replaces `vercel.json`) | Typed config with dynamic logic |

## Project layout

```
/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Clerk sign-in / sign-up routes
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (app)/                    # Authenticated app shell
│   │   ├── layout.tsx            # Sidebar + topbar shell
│   │   └── page.tsx              # Dashboard home
│   ├── api/                      # Route handlers (when needed)
│   ├── layout.tsx                # Root layout: ClerkProvider, ThemeProvider
│   ├── page.tsx                  # Public landing
│   ├── error.tsx                 # Global error boundary
│   └── not-found.tsx
├── components/
│   ├── ui/                       # shadcn primitives (installed via MCP)
│   └── ...                       # Composed feature components
├── lib/
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema definitions
│   │   ├── index.ts              # db client (Neon serverless driver)
│   │   └── migrations/           # drizzle-kit output (committed)
│   ├── auth.ts                   # Clerk server helpers (auth(), currentUser())
│   └── utils.ts                  # cn(), shared formatters
├── tests/
│   ├── unit/                     # Vitest specs
│   └── e2e/                      # Playwright specs
├── middleware.ts                 # Clerk auth middleware
├── drizzle.config.ts             # drizzle-kit config
├── vercel.ts                     # Vercel project config
├── biome.json                    # Lint + format config
├── tailwind.config.ts
├── tsconfig.json
├── .mcp.json                     # shadcn-studio-mcp (already exists)
├── CLAUDE.md                     # shadcn mandate (already exists)
└── package.json
```

## Data flow

1. Request hits Next.js on Vercel Fluid Compute.
2. `middleware.ts` (Clerk) checks session → either redirects to `/sign-in` or attaches `userId`.
3. Server Component, Route Handler, or Server Action runs.
4. DB access goes through `lib/db` (Drizzle + Neon serverless driver).
5. Result is rendered server-side (RSC) or returned as JSON.
6. Client Components hydrate and handle interactivity.

## Environment variables

All auto-provisioned by Vercel Marketplace when integrations are installed:

| Variable | Source |
|---|---|
| `DATABASE_URL` | Neon (pooled) |
| `DATABASE_URL_UNPOOLED` | Neon (direct, used by drizzle-kit migrations) |
| `CLERK_PUBLISHABLE_KEY` | Clerk |
| `CLERK_SECRET_KEY` | Clerk |
| `NEXT_PUBLIC_CLERK_*_URL` | Clerk (sign-in/up/after-sign-in redirects) |

Local dev uses `vercel env pull .env.local` to sync. `.env*` is gitignored.

## Error handling

- DB calls in Server Actions and Route Handlers are wrapped in `try/catch`. Server Actions return typed error objects; Route Handlers return JSON with appropriate status codes.
- `app/error.tsx` and nested `error.tsx` files catch render-time errors.
- `app/not-found.tsx` for 404s.
- Production observability (Sentry) is deferred — added when there is something worth observing.

## Testing

- **Unit / integration (Vitest):** Pure functions and Drizzle query helpers tested against a local Postgres (Docker) or an ephemeral Neon branch in CI.
- **E2E (Playwright):** Spec files under `tests/e2e/` target a deployed preview URL. CI invokes after a successful Vercel preview deploy.
- **Coverage target:** Not enforced as a percentage — focus on critical paths.

## Out of scope (deferred until needed)

- Sentry / observability tooling
- Background jobs (Vercel Queues, Cron Jobs)
- Email (Resend or similar)
- File storage (Vercel Blob)
- Analytics
- Mobile / React Native client
- Multi-tenancy / orgs (Clerk supports it when needed)
- Internationalisation

## Open decisions punted intentionally

- **Domain model.** Schema is empty at bootstrap. First feature spec will define initial tables.
- **Sentry vs other observability.** Re-evaluate after first deploy.
- **CI provider config.** Vercel's built-in checks cover deploys; GitHub Actions config will be added when test runs need a separate runner.

## Acceptance criteria for the bootstrap

The tech stack is "installed" when:

1. `pnpm dev` runs Next.js locally with shadcn theme applied.
2. Clerk sign-in/sign-up flow works end-to-end against the linked Clerk project.
3. A Drizzle schema with at least one table is defined and a migration is applied to Neon.
4. A `SELECT 1` style query from a Server Component renders successfully.
5. `pnpm test` runs Vitest (passing on a placeholder unit test).
6. `pnpm test:e2e` runs Playwright (passing on a smoke test that loads `/`).
7. `pnpm lint` runs Biome cleanly.
8. The project is linked to Vercel, Neon and Clerk integrations are installed, and a preview deploy succeeds.
