# Brand Isolation Rollout (App-Side JWT + RLS)

**STATUS: ✅ LIVE & VERIFIED.** `brand_id` isolation is enforced on the shared HQ Supabase.
Each brand app only reads/writes its own rows.

Goal (achieved): replace the open `to anon ... using (true)` policies on the brand-facing
tables with brand-scoped policies keyed off a signed `brand_id` JWT claim.

SQL applied: [`../supabase/brand-isolation-rls.sql`](../supabase/brand-isolation-rls.sql).

## Reference implementation (KAFRA — done)

KAFRA is the core reference. The scaffold:

- `src/lib/brand-jwt.ts` — `mintBrandToken(brandId)` signs `{ role: "authenticated", brand_id, iat, exp }`
  with `SUPABASE_JWT_SECRET` (HS256, Node `crypto`, no new dependency). Returns `null` when the
  secret is unset.
- `src/app/api/access/supabase-token/route.ts` — validates the access-key + session-token (same
  check as `/api/access/session`), then returns `{ data: { token } }`. Returns `{ token: null }`
  when the secret is unset.
- `src/app/access/page.tsx` — the realtime effect fetches the token and calls
  `sb.realtime.setAuth(token)` before `.subscribe()`. A `null` token leaves the anon connection
  unchanged.

Key safety property: **with `SUPABASE_JWT_SECRET` unset, behaviour is identical to pre-rollout.**
Data reads already go through server API routes (`/api/signals`, `/api/performance-logs`), so the
only browser anon usage is realtime — that is what now carries the brand token.

## Per-app replication — DONE (all 6 apps, pushed)

All six brand apps carry the scaffold (`brand-jwt.ts`, `supabase-token` route, realtime `setAuth`),
each typechecked clean and pushed to its GitHub repo:

- [x] KAFRA (reference) · [x] SARJAN · [x] RICH JOKER · [x] SHINOBI · [x] KAPITAN · [x] LIZA

`BRAND_ID` env is **optional** — each app's `src/lib/brand-id.ts` already defaults to its own brand,
and the server resolves brand by request host too. `SUPABASE_JWT_SECRET` is the only required env.

## What was applied (live)

The SQL hardened the 4 tables that had open `anon ... using(true)` policies:

| Table | After |
| --- | --- |
| signals, performance_logs | `select` to `authenticated` where `brand_id = current_brand_id()`; anon revoked |
| access_keys | brand-scoped `select` + session-field-only `update`; anon revoked |
| security_alerts | brand-scoped `insert`; anon revoked |

The other RLS-enabled tables (`subscribers`, `performance_log_edits`, `package_links`,
`link_redemptions`, `web_push_subscriptions`) had **no anon policy** → already deny-by-default to
anon. No change needed; server routes reach them via the service-role key (bypasses RLS).

## Verification done

- Token endpoint returns a valid `{ role: "authenticated", brand_id }` JWT in production (KAFRA, DevTools).
- RLS isolation proven in SQL editor by simulating each brand's JWT — every brand sees ONLY its own
  rows (kafra 1160, sarjan 2011, shinobi 2110, kapitan 1199, richjoker 2104 signals; no cross-brand).
- KAFRA app regression: dashboard loads + console clean under RLS.

## Remaining follow-ups (non-blocking)

- [ ] Realtime under RLS: confirm a live signal still streams when the market reopens (Monday).
      Rollback ready below if it does not.
- [ ] Regression spot-check the other 5 apps (identical code to KAFRA).
- [ ] Rotate `HQ_WEBHOOK_SECRET` (was hardcoded plaintext in the MT5 EA) + recompile `HQ MT5.ex5`.
- [ ] `SHINOBI INDI/.env.example` held real (stale, old-project) secrets — sanitize to placeholders
      and rotate any still-valid ones.

## Rollback (if an app blanks / realtime dies)

Restore open read access while debugging:

```sql
create policy "anon_can_read_signals" on public.signals for select to anon using (true);
create policy "anon_can_read_logs" on public.performance_logs for select to anon using (true);
grant select on public.signals to anon;
grant select on public.performance_logs to anon;
```

## Notes

- The token is brand-scoped only (no user identity); strictly tighter than the old open anon.
- Tokens are short-lived (1h default); the realtime effect re-mints on re-subscribe.
- Admin/server routes keep using the service-role key and are unaffected by RLS.
