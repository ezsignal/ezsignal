# EZ SIGNAL HQ Vercel Go-Live Checklist

Last updated: 2026-05-14.

Use this checklist to activate HQ in production safely.

## 1) Open Project

1. Go to Vercel dashboard.
2. Open project: `EZ SIGNAL HQ` (or your connected HQ project name).
3. Open `Settings` -> `Environment Variables`.

## 2) Add / Update Environment Variables (Production)

Set these values in Vercel Production:

- `NEXT_PUBLIC_HQ_NAME`
- `NEXT_PUBLIC_HQ_MODE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `HQ_SUPABASE_URL`
- `HQ_SUPABASE_SERVICE_ROLE_KEY`
- `HQ_WEBHOOK_ENABLED=true`
- `HQ_WEBHOOK_SHADOW_MODE=false`
- `HQ_WEBHOOK_FANOUT_ENABLED=true`
- `HQ_WEBHOOK_EAGER_DISPATCH_ENABLED=true`
- `HQ_PERFORMANCE_EDITOR_ENABLED=true`
- `HQ_WEBHOOK_SECRET`
- `HQ_DISPATCH_RUN_TOKEN`
- `CRON_SECRET`
- `HQ_BRAND_DEFAULT_WEBHOOK_PATH=/api/webhook/tradingview`
- `HQ_BRAND_REQUEST_TIMEOUT_MS=12000`
- `HQ_BRAND_MAX_ATTEMPTS=5`
- `HQ_BRAND_RETRY_BASE_SECONDS=30`
- `HQ_BRAND_DEFAULT_WEBHOOK_HEADERS`
- `HQ_BRAND_KAFRA_WEBHOOK_URL`
- `HQ_BRAND_KAFRA_WEBHOOK_SECRET`
- `HQ_BRAND_SARJAN_WEBHOOK_URL`
- `HQ_BRAND_SARJAN_WEBHOOK_SECRET`
- `HQ_BRAND_RICHJOKER_WEBHOOK_URL`
- `HQ_BRAND_RICHJOKER_WEBHOOK_SECRET`
- `HQ_BRAND_SHINOBI_WEBHOOK_URL`
- `HQ_BRAND_SHINOBI_WEBHOOK_SECRET`

Important:

- `HQ_DISPATCH_RUN_TOKEN` and `CRON_SECRET` must be non-empty.
- Use the same values you set in local `.env.local`, unless rotating.

## 3) Redeploy

1. Go to `Deployments`.
2. Redeploy latest commit (or push new commit).
3. Wait until deployment status is `Ready`.

## 4) Confirm Cron

1. Ensure `vercel.json` exists in repo root and contains `/api/hq/dispatch/run`.
2. In Vercel, check `Cron Jobs` section for active schedule.

Current repo schedule:

- `0 0 * * *` (daily backlog sweep)

Real-time fanout is handled by eager dispatch on webhook ingress.

## 5) Production Smoke Test

Run from PowerShell using the helper script:

```powershell
cd "C:\Users\USER\Desktop\VSC\.codex\EZ SIGNAL\EZ SIGNAL HQ"
.\scripts\hq-prod-smoke.ps1 `
  -BaseUrl "https://<your-hq-domain>" `
  -DispatchToken "<HQ_DISPATCH_RUN_TOKEN>" `
  -WebhookSecret "<HQ_WEBHOOK_SECRET>" `
  -Brand "kafra"
```

Pass criteria:

- unauthorized dispatch call is rejected
- authorized dispatch call returns `ok: true`
- webhook ingress returns `ok: true`
- `dispatch/status` shows no growing `failed`/`deadLetter`

## 6) Rollback Switch (If Needed)

In Vercel env:

- `HQ_WEBHOOK_FANOUT_ENABLED=false`

Redeploy and keep ingress enabled for audit logging.
