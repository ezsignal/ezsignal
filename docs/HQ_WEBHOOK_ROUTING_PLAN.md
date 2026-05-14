# EZ SIGNAL HQ Webhook Routing Plan

Status: draft for implementation.

Last updated: 2026-05-13.

## Current implementation progress

- Done: route scaffolds for
  - `POST /api/hq/webhooks/signal`
  - `POST /api/hq/dispatch/run`
  - `GET /api/hq/dispatch/status`
- Done: environment flags scaffold in `.env.example`.
- Done: local `.env.local` shadow-mode test setup.
- Done: HQ dashboard runtime panel for ingress/dispatch visibility.
- Done: runtime now supports dual backend (Supabase DB when service-role env is set, fallback memory when not set).
- Done: dispatch worker now performs real HTTP fanout to each brand target endpoint.
- Done: dispatch attempts are written to `webhook_delivery_attempts`.
- Done: retry path supports exponential backoff and dead-letter status.
- Current mode: memory backend in local unless `HQ_SUPABASE_URL` and `HQ_SUPABASE_SERVICE_ROLE_KEY` are configured.

## Decision

Use one inbound webhook at EZ SIGNAL HQ, then fan-out to all brand pipelines with brand-safe rules.

High-level flow:

1. Upstream provider sends signal event to HQ webhook endpoint.
2. HQ verifies signature, normalizes payload, and writes one immutable event row.
3. HQ creates delivery jobs for each enabled brand.
4. Worker dispatches each job to the target brand signal path.
5. HQ records delivery status, retries failed jobs, and raises alerts when needed.

## Why this is good

- One secure ingress point.
- Easier monitoring and audit.
- Consistent signal format for all brands.
- Faster parity: one change in HQ can apply to all brands.

## Main risks and controls

### Risk: single point of failure

Controls:

- retry queue with exponential backoff
- dead-letter status after max attempts
- alerting when failure threshold is exceeded
- fast rollback toggle to old direct webhook path

### Risk: duplicate signal when webhook retries

Controls:

- `event_key` idempotency key (unique)
- skip duplicate processing if same key already exists

### Risk: wrong brand receives signal

Controls:

- explicit routing rules per brand (`brand_publish_rules`)
- dispatch log per brand target
- dry-run mode before cutover

## Ingress authentication modes

Supported now:

1. `x-hq-signature` header (`sha256=<hex>` HMAC over raw JSON body)
2. JSON body secret field (`webhook_secret` or `secret`) matched with `HQ_WEBHOOK_SECRET`

Note:

- For platforms that cannot set custom headers, use JSON body secret mode.
- Inbound payload secret fields are stripped before saving payload to database.

## Feature flags

- `HQ_WEBHOOK_ENABLED`: enable HQ ingress path.
- `HQ_WEBHOOK_SHADOW_MODE`: accept + store + validate, but do not fan-out.
- `HQ_WEBHOOK_FANOUT_ENABLED`: allow HQ dispatch to brand targets.
- `HQ_WEBHOOK_EAGER_DISPATCH_ENABLED`: dispatch queued jobs immediately after ingress planning.
- `HQ_PERFORMANCE_EDITOR_ENABLED`: allow HQ edit UI for all brands.

Default rollout: only `HQ_WEBHOOK_SHADOW_MODE=true` first.

## Brand target configuration

Priority order:

1. `brand_publish_rules.settings` (per-brand, database-managed)
2. `HQ_BRAND_<BRAND>_WEBHOOK_*` env fallback
3. Domain-derived URL fallback: `https://<brand-domain>/api/webhook/tradingview`

Recommended minimal env setup for fallback mode:

- `HQ_BRAND_KAFRA_WEBHOOK_URL`, `HQ_BRAND_KAFRA_WEBHOOK_SECRET`
- `HQ_BRAND_SARJAN_WEBHOOK_URL`, `HQ_BRAND_SARJAN_WEBHOOK_SECRET`
- `HQ_BRAND_RICHJOKER_WEBHOOK_URL`, `HQ_BRAND_RICHJOKER_WEBHOOK_SECRET`
- `HQ_BRAND_SHINOBI_WEBHOOK_URL`, `HQ_BRAND_SHINOBI_WEBHOOK_SECRET`

## Data model (draft)

- `webhook_event_ingress`: immutable inbound events.
- `signal_dispatch_jobs`: one row per event x target brand.
- `brand_publish_rules`: per-brand publish and transform config.
- `webhook_delivery_attempts`: optional detail table for retries.
- `performance_log_edits`: continue as central edit audit (extend payload fields).

## API routes (proposed)

- `POST /api/hq/webhooks/signal`: ingress endpoint.
- `GET/POST /api/hq/dispatch/run`: internal worker trigger (Bearer auth required in production).
- `GET /api/hq/dispatch/status`: queue metrics.
- `GET /api/hq/performance`: central read endpoint for performance logs.
- `POST /api/hq/performance`: central edit endpoint for any brand.

## Performance editing strategy

Target model:

- HQ edits `performance_logs` directly with required `brand_id`.
- Each edit writes to `performance_log_edits` with `edited_by`, before/after payload, and reason.
- Brand apps read the same source-of-truth rows through brand-aware server routes.

## Rollout phases (safe and reversible)

1. Schema and routes in HQ only (no traffic switch).
2. Shadow mode: ingress + verify + store, no dispatch.
3. Dual-run: keep old webhook live, HQ dispatch active for selected brand.
4. Expand to all 4 brands with alerts enabled.
5. Cut old webhook after stable window.

## Rollback plan

If incident:

1. Set `HQ_WEBHOOK_FANOUT_ENABLED=false`.
2. Set upstream back to old direct brand webhooks.
3. Keep HQ ingress logging active for audit.
4. Replay pending jobs manually after fix.

Recovery target:

- service restoration under 15 minutes for routing failure class.

## Cron execution note

- `vercel.json` currently uses daily schedule `0 0 * * *` for `/api/hq/dispatch/run`.
- This is safe for hobby plan constraints and acts as retry/backlog sweep.
- Real-time fanout is handled by eager dispatch on ingress.

## Acceptance checklist

- No duplicated signals from same webhook event.
- Fan-out success rate >= 99% in dual-run window.
- Each brand receives only its routed payload.
- HQ performance edit updates right brand only.
- Audit log contains actor, brand, change, timestamp.
