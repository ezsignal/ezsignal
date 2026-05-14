# EZ SIGNAL Project Map

This file is a working registry for the four EZ SIGNAL distributions.

| Display Brand | Canonical Brand | Local Folder | Role | GitHub | Vercel | Domain | Supabase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| KAFRA SIGNAL | KAFRA SIGNAL | KAFRA SIGNAL | Core | kafrasignal/kafrasignal | kafrasignal | signal.kafra.ai | Supabase account A |
| SARJAN SIGNAL | SARJAN SIGNAL | SARJAN SIGNAL | White label | sarjansignal/sarjansignal | sarjansignal | sarjansignal.ezos.my | Supabase account A |
| RICH JOKER | RICH JOKER INDI | RICH JOKER INDI | White label | richjokerindi/richjokerindi | richjoker | richjoker.ezos.my | Supabase account B |
| SHINOBI | SHINOBI INDI | SHINOBI INDI | White label | shinobiindi/shinobiindi | shinobi | shinobi.ezos.my | Supabase account B |

## HQ Rules

- KAFRA SIGNAL is the core reference.
- White label apps must track core flow parity.
- Shared Supabase migration must add `brand_id` isolation before any live data merge.
- Telegram tokens, service role keys, and admin secrets must stay server-side.

## Shared Supabase Planning

- Architecture plan: `docs/SHARED_SUPABASE_PLAN.md`
- Webhook routing plan: `docs/HQ_WEBHOOK_ROUTING_PLAN.md`
- Draft schema: `supabase/shared-schema.draft.sql`
- Data migration playbook: `supabase/shared-data-migration.playbook.sql`
- Data migration runbook: `docs/SHARED_DATA_MIGRATION_RUNBOOK.md`
- Current decision: one shared Supabase project is acceptable only after public brand apps stop relying on broad anon table access.
- Current progress: access key login/session checks now run through server API routes in all four brand apps.

## EZ SIGNAL HQ MVP Status

- HQ overview dashboard is live with:
  - brand registry
  - migration phase tracker
  - core parity board
  - signal and Telegram lanes
  - execution queue from shared Supabase plan
- Brand detail pages now include quick actions to domain, GitHub, and admin endpoints.
- HQ webhook API scaffold is live in source:
  - `POST /api/hq/webhooks/signal`
  - `POST /api/hq/dispatch/run`
  - `GET /api/hq/dispatch/status`
  - `GET /api/hq/performance`
  - `POST /api/hq/performance`
- HQ webhook shadow mode local testing is active:
  - `.env.local` uses `HQ_WEBHOOK_ENABLED=true`, `HQ_WEBHOOK_SHADOW_MODE=true`, `HQ_WEBHOOK_FANOUT_ENABLED=false`
  - HQ dashboard now has live "HQ Webhook Runtime" panel.
- HQ webhook runtime now supports:
  - Supabase DB backend when `HQ_SUPABASE_URL` and `HQ_SUPABASE_SERVICE_ROLE_KEY` are set
  - automatic in-memory fallback when DB env is not configured
  - real HTTP fanout to brand webhooks with retry and dead-letter tracking
  - eager dispatch on ingress (`HQ_WEBHOOK_EAGER_DISPATCH_ENABLED=true`) for near-real-time fanout
  - per-brand target config from `brand_publish_rules.settings` or `HQ_BRAND_*` env fallback
  - delivery attempt audit rows in `webhook_delivery_attempts`
  - central performance editor panel and API (guarded by `HQ_PERFORMANCE_EDITOR_ENABLED`)
  - secure dispatch trigger endpoint (`GET/POST /api/hq/dispatch/run`) with bearer token (`HQ_DISPATCH_RUN_TOKEN` or `CRON_SECRET`)
