# Deploying CMS

Target stack: **Vercel** (Next.js app + cron) + **Neon** (Postgres) + **Resend**
(email). Any Node host + Postgres works — Vercel-specific bits are called out.

## 1. Database (Neon)

1. Create a Neon project (e.g. `cms-prod`), Postgres 16+.
2. Grab both connection strings from the Neon dashboard:
   - **Pooled** (`…-pooler.…neon.tech`) → `DATABASE_URL` — what the app uses at runtime.
   - **Direct** (no `-pooler`) → `DIRECT_DATABASE_URL` — what Prisma migrations use.
3. Nothing to create by hand: migrations run automatically during the Vercel build
   (`prisma migrate deploy` in `apps/dashboard/vercel.json`'s buildCommand) and are
   additive/idempotent.

## 2. App (Vercel)

1. **New Project → import the `cms` GitHub repo.**
2. **Root Directory: `apps/dashboard`.** Vercel detects the pnpm workspace and
   installs from the repo root; `vercel.json` (already in that directory) supplies the
   build command (migrate + build) and the cron schedule.
3. **Environment variables** (Production):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** connection string |
   | `DIRECT_DATABASE_URL` | Neon **direct** connection string |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | the production URL, e.g. `https://cms.victorychurch.nu` |
   | `CRON_SECRET` | `openssl rand -base64 32` |
   | `RESEND_API_KEY` | from Resend (optional — see §3) |
   | `RESEND_EMAIL_DOMAIN` | your verified Resend domain (optional) |
   | `ANTHROPIC_API_KEY` | from console.anthropic.com (optional — enables "Analyze with AI" on People import, ADR-011) |

4. Deploy. First build takes a few minutes (install + prisma generate + migrate + build).

### Outbox cron

Workflows, queued messages, and webhook deliveries drain opportunistically after
requests, but a scheduler must hit `GET /api/cron/outbox` with
`Authorization: Bearer $CRON_SECRET` as the durable backstop:

- **Vercel Pro**: the `*/5 * * * *` cron in `vercel.json` just works — Vercel sends
  the `CRON_SECRET` env var as the Bearer token automatically.
- **Vercel Hobby**: crons only fire **once per day**. Use the included GitHub Actions
  workflow (`.github/workflows/outbox-cron.yml`) instead: add repo secrets
  `CRON_URL` (`https://<your-domain>/api/cron/outbox`) and `CRON_SECRET`, and it
  pings every 5 minutes. (Until secrets are set it no-ops.)

Sanity check after deploy:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/outbox
# → {"processed":0,"failed":0,"retried":0,"advancedRuns":0,"webhookAttempts":0}
```

## 3. Email (Resend)

Without `RESEND_API_KEY`, the app falls back to a console email provider — invites,
password resets, and workflow SEND_EMAIL steps log instead of sending. For real mail:
create a Resend account, verify your sending domain, and set both `RESEND_*` vars.
Sender is `CMS <noreply@$RESEND_EMAIL_DOMAIN>`.

## 4. First run

1. Visit the production URL → `/signup` → create your account.
2. Onboarding asks for the church name and creates the organization (you're OWNER).
3. Settings → add campuses; People → Import CSV to load your people.
4. Team → invite staff (requires email to be configured, since invites are emailed).

## Known limitations on serverless hosts

- **File uploads (Person attachments)** need object storage in production — the
  local-disk fallback does not survive Vercel's ephemeral filesystem. Set the
  `STORAGE_S3_*` variables (below) to switch to the S3-compatible provider
  (Cloudflare R2 recommended: free tier, no egress fees). The bucket stays fully
  private; downloads always flow through the authorizing app route.

  1. Cloudflare dashboard → R2 → Create bucket (e.g. `cms-private`). No public
     access needed.
  2. R2 → Manage API Tokens → Create API token, Object Read & Write, scoped to the
     bucket → copy the Access Key ID + Secret Access Key and your account's S3
     endpoint (`https://<account-id>.r2.cloudflarestorage.com`).
  3. Add to Vercel env (Production) and redeploy:

  | Variable | Value |
  |---|---|
  | `STORAGE_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
  | `STORAGE_S3_BUCKET` | `cms-private` |
  | `STORAGE_S3_REGION` | `auto` (R2) or the AWS region for S3 |
  | `STORAGE_S3_ACCESS_KEY_ID` | from the API token |
  | `STORAGE_S3_SECRET_ACCESS_KEY` | from the API token |
- **API rate limiting is in-memory per instance** — fine as an abuse speed bump, not
  a strict global limit across serverless instances.
- `maxDuration = 300` on the cron route requires Fluid compute (default on new Vercel
  projects). If the build rejects it on an older plan, lower it in
  `app/api/cron/outbox/route.ts`.
- **NextAuth host trust**: on Vercel this is automatic. On other hosts set
  `AUTH_TRUST_HOST=true` alongside `NEXTAUTH_URL`.

## Non-Vercel hosts

Any Node 20+ host works: run `pnpm install`, `pnpm --filter @cms/database exec prisma
migrate deploy`, `pnpm --filter @cms/dashboard build`, then `next start` from
`apps/dashboard` with the same environment variables, and schedule the cron endpoint
with cron(1) or your platform's scheduler.
