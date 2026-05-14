# EZ SIGNAL HQ

Central operations dashboard for EZ SIGNAL brands.

## Scope

- Brand registry for KAFRA SIGNAL, SARJAN SIGNAL, RICH JOKER, and SHINOBI.
- Multi-brand analytics overview.
- Operational map for GitHub, Vercel, Supabase, Telegram, access keys, signals, and landing page controls.
- Live shared-Supabase metrics with fallback UI when DB is unavailable.

## Webhook Ops

- Ingress: `POST /api/hq/webhooks/signal`
- Queue run: `GET/POST /api/hq/dispatch/run`
- Runtime status: `GET /api/hq/dispatch/status`
- Performance editor API: `GET/POST /api/hq/performance`
- Tally audit API: `GET /api/hq/audit/tally`
- Go-live runbook: `docs/VERCEL_GO_LIVE_CHECKLIST.md`
- TradingView templates: `docs/HQ_TRADINGVIEW_ALERTS.md`
- Production smoke test helper: `scripts/hq-prod-smoke.ps1`
- Shared data migration runbook: `docs/SHARED_DATA_MIGRATION_RUNBOOK.md`
- Shared data migration SQL playbook: `supabase/shared-data-migration.playbook.sql`
- Tally gate script: `scripts/hq-tally-check.ps1`

Production security:

- Set `HQ_DISPATCH_RUN_TOKEN` and/or `CRON_SECRET`.
- `dispatch/run` requires bearer auth in production.
- `vercel.json` includes cron path `/api/hq/dispatch/run`.

## Commands

```bash
npm install
npm run dev
npm run build
```
