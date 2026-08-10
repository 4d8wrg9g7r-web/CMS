# CMS — Church Management System

A multi-tenant church management platform: People, Groups, Events, Forms, Workflows,
Tasks, Journeys, Communications, Check-in, Volunteers, Files, and a developer API with
signed webhooks. Extracted from the Ruach codebase as its own product; the master
product/technical spec lives in [`docs/architecture/`](docs/architecture/).

## Quick start

```bash
pnpm install
cp .env.example .env          # then start Postgres (docker compose up -d)
pnpm db:migrate && pnpm db:seed
pnpm dev                      # http://localhost:3000 — owner@cms.dev / devpassword123
```

## Repository layout

```
apps/dashboard        Next.js 15 app: authenticated dashboard, public surfaces
                      (/f forms, /e event registration, /c calendar, /g group finder),
                      public API (/api/v1/*), outbox cron endpoint
packages/database     Prisma schema + tenant-guarded client, service layer,
                      authorization matrices, pure domain helpers + unit tests
packages/email        EmailProvider seam (Console mock / Resend)
packages/storage      Public + private storage provider seams
docs/architecture     Product & technical blueprint, Constitution, ADRs, merge gate
docs/domain           Per-feature specs (people, groups, forms, workflows, …)
```

## Commands

```bash
pnpm dev              # run the dashboard
pnpm test             # unit tests (vitest) across packages
pnpm -r typecheck     # workspace typecheck
pnpm tenant-check     # CI backstop: forbids bypassing tenant scoping
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # idempotent dev seed
```

## Tenant isolation (three layers)

1. **Service layer** (`packages/database/src/services/`) — every query scoped by
   `organizationId`; application code never touches Prisma directly.
2. **Runtime guard** (`tenant-guard.ts`) — a Prisma extension that throws on any
   unscoped query against a tenant model.
3. **CI grep** (`scripts/check-tenant-scoping.sh`) — forbids `tenantDb`/`rawDb`
   outside the service layer.

Read [`docs/architecture/CONSTITUTION.md`](docs/architecture/CONSTITUTION.md) before
changing anything architectural, and `CLAUDE.md` for contributor ground rules.
