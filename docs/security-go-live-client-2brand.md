# Security Go-Live Checklist (Client 2 Brand)

Scope: Dedicated client stack for `richjoker` + `shinobi` only.

## Rules

- Checklist document only.
- No direct production change from this file.
- Tick items only after verification is complete.

## 1) Project Isolation

- [ ] Create dedicated Supabase project for client stack.
- [ ] Create dedicated Vercel project for client stack.
- [ ] Use dedicated domain/subdomain for client stack.
- [ ] Confirm no shared runtime secret with the 5-brand core stack.

## 2) Secret Management

- [ ] Generate unique `TRADINGVIEW_WEBHOOK_SECRET` for each brand.
- [ ] Generate unique admin key(s) for client admin access.
- [ ] Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- [ ] Store all secrets in environment variables only (never in repo).
- [ ] Set a secret rotation schedule (30/60/90 days).

## 3) Access Control & Auth

- [ ] Enable MFA for all admin/operator accounts.
- [ ] Review all admin routes and require strong auth checks.
- [ ] Enforce least-privilege access for operators/support users.
- [ ] Revoke unused test keys and stale sessions before go-live.

## 4) Data Access Security

- [ ] Confirm RLS enabled on all exposed tables.
- [ ] Validate RLS policy isolation by `brand_id`.
- [ ] Confirm public/anon role cannot read cross-brand data.
- [ ] Confirm service-role queries are used only in server routes.

## 5) Webhook & API Hardening

- [ ] Verify webhook signature/secret validation is enforced.
- [ ] Keep idempotency/duplicate protection enabled.
- [ ] Ensure shadow/testing endpoints are disabled in production mode.
- [ ] Apply request timeout and retry policy with safe limits.

## 6) Monitoring & Audit

- [ ] Enable and review logs for auth failures and suspicious activity.
- [ ] Monitor webhook failures, retry spikes, and dead jobs.
- [ ] Track session takeover alerts and investigate promptly.
- [ ] Set spend/usage alerts for Vercel and Supabase.

## 7) Backup & Recovery

- [ ] Enable backup policy for client project.
- [ ] Run at least one restore drill before go-live.
- [ ] Record RTO/RPO target and actual restore timing.
- [ ] Store rollback plan and owner contacts in ops notes.

## 8) Incident Response

- [ ] Define on-call person and backup person.
- [ ] Define severity levels and response SLA.
- [ ] Define containment steps (key revoke, webhook pause, session revoke).
- [ ] Define communication template for client updates.

## 9) Final Go/No-Go Gate

- [ ] Security checklist owner sign-off.
- [ ] Technical owner sign-off.
- [ ] Client-facing readiness confirmed.
- [ ] Go-live date/time approved.

---

Last updated: 2026-05-21 (MYT)
