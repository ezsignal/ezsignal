# Shared Supabase Plan

Status: draft for review. Do not run against production yet.

## Decision

One Supabase project can serve KAFRA SIGNAL, SARJAN SIGNAL, RICH JOKER, and SHINOBI, but only after the apps become brand-aware at the database boundary.

The important rule: `brand_id` is required on every shared table, but `brand_id` alone is not enough while browser code can query Supabase directly with the anon key. Public access must go through server routes or RPCs that apply the correct brand from the domain or environment.

## Current Audit

| Brand | Schema status | Notes |
| --- | --- | --- |
| KAFRA SIGNAL | Current core | Has `link_redemptions`, `be` outcome, and tighter access key update grants. |
| SARJAN SIGNAL | Patched to core parity locally | Added `link_redemptions`, `be` outcome repair, and tighter access key update grants in local schema. |
| RICH JOKER | Current core | Matches KAFRA-style flow with link redemption and `be` outcome. |
| SHINOBI | Current core | Matches KAFRA-style flow with link redemption and `be` outcome. |

## Main Risk

The current white label apps still read some data directly from Supabase in the browser:

- `signals`
- `performance_logs`
- `access_keys`
- realtime channels for signal, log, and key changes
- `security_alerts` inserts

In separate Supabase projects, this is acceptable because each database only contains one brand. In one shared Supabase project, broad anon policies like `using (true)` would let one brand see another brand if any query misses a filter or if someone calls the API directly.

## HQ Webhook Direction

Planned direction: one inbound webhook at EZ SIGNAL HQ, then fan-out to brand pipelines with `brand_id` routing rules and retry queue controls.

Reference: `docs/HQ_WEBHOOK_ROUTING_PLAN.md`

## Target Architecture

Browser app:

1. Detect brand from domain or server env, for example `BRAND_ID=sarjan`.
2. Call Next.js server routes for access authorization, signal feed, logs, alerts, link redemptions, and public CMS.
3. Server routes talk to Supabase with service role or controlled RPCs.
4. Every query includes the server-owned `brand_id`.

HQ app:

1. Uses Supabase Auth for admins.
2. Uses `admin_profiles` and `admin_memberships`.
3. RLS allows admins to see only assigned brands, unless they are super admin.

## Core Shared Tables

- `brands`: brand registry, domains, repo, Vercel project, local folder.
- `admin_profiles`: HQ admin identity.
- `admin_memberships`: admin access per brand and role.
- `subscribers`: CRM users per brand.
- `access_keys`: authorization keys per brand.
- `security_alerts`: suspicious login/device events per brand.
- `signals`: live signal feed per brand.
- `performance_logs`: closed signal results per brand.
- `performance_log_edits`: audit trail for performance edits.
- `package_links`: registration/payment/package links per brand.
- `link_redemptions`: one-time link usage tracking per brand.
- `telegram_bots`: bot and channel mapping per brand.
- `landing_settings`: landing page copy, pricing, FAQ, and theme per brand.
- `audit_logs`: HQ/admin actions.

## Role Model

| Role | Scope |
| --- | --- |
| `super_admin` | Can manage all brands and HQ settings. |
| `brand_admin` | Can manage one assigned brand. |
| `signal_operator` | Can publish signals and performance logs for assigned brand. |
| `support` | Can manage subscribers and access keys for assigned brand. |
| `viewer` | Can read dashboards for assigned brand. |

## RLS Position

Safe target:

- No anon `select` on raw `access_keys`, `subscribers`, `package_links`, or `link_redemptions`.
- No anon direct `select` on shared `signals` or `performance_logs` unless the request carries a trusted brand claim.
- Public websites should use server routes that enforce `brand_id`.
- HQ admin reads/writes should use RLS through Supabase Auth and `admin_memberships`.
- Access keys should move toward `key_hash` instead of storing only plaintext keys.

## Migration Phases

1. Normalize all four schemas to KAFRA parity.
   - Local SARJAN schema is now patched.
   - SARJAN schema source has been pushed to GitHub.
   - Next: run the SARJAN schema in its current Supabase SQL editor after review.
2. Move access authorization from browser Supabase reads to server routes.
   - Done in KAFRA, SARJAN, RICH JOKER, and SHINOBI source.
   - Browser no longer reads/updates `access_keys` during login.
   - Browser session polling now calls `/api/access/session`.
3. Add `brand_id` to all operational tables in each existing project and backfill values.
4. Create the new shared Supabase project with `brands` seeded.
5. Update every app to use server-owned brand context for signals, performance logs, registration links, and alerts.
6. Migrate one brand at a time into the shared database.
7. Verify dashboard counts, access login, registration links, signal realtime, and Telegram delivery.
8. Only then retire the old free Supabase projects.

## Next Engineering Tasks

- Review and apply patched SARJAN schema in its current Supabase SQL editor.
- Keep shared schema as draft until brand apps are server-route aware.
- Add `BRAND_ID` to each brand app environment.
- Move signal and performance public reads behind brand-aware server routes.
- Add HQ Supabase Auth and the first super admin account.
- Add HQ webhook ingress tables and dispatch queue tables in shared schema draft.
- Add central performance edit endpoint with audit trail payload diffs.
  - Implemented in HQ source:
    - `GET /api/hq/performance`
    - `POST /api/hq/performance` (guarded by `HQ_PERFORMANCE_EDITOR_ENABLED`)
- Secure dispatch worker trigger:
  - `GET/POST /api/hq/dispatch/run` now expects bearer token in production (`HQ_DISPATCH_RUN_TOKEN` or `CRON_SECRET`)
  - Vercel cron target is configured in `vercel.json` for daily retry sweep
