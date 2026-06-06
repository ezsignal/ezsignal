-- Brand isolation via signed-JWT claim (Option A) — HQ shared DB
-- Run in the SHARED HQ Supabase SQL Editor.
--
-- WHAT THIS DOES
--   Replaces the open `to anon ... using (true)` policies on the brand-facing
--   tables with brand-scoped policies that filter by a `brand_id` claim carried
--   in a SIGNED JWT. A client can only read/write rows whose `brand_id` matches
--   the brand in its token. The token is signed server-side, so the client
--   cannot forge another brand's id.
--
--   Data is NOT touched. Only policies and grants change.
--
-- ⚠️ APP-SIDE PREREQUISITE (do this BEFORE running, or the public apps go blank)
--   Each brand app must stop using the raw anon key for table access and instead
--   mint a short-lived JWT, signed with the project's JWT secret, shaped like:
--       { "role": "authenticated", "brand_id": "shinobi", "exp": <unix-ts> }
--   ...then use that token as the Supabase access token (createClient global
--   headers Authorization, or supabase.realtime.setAuth(token) for Realtime).
--   The brand_id MUST equal the brand's id in public.brands
--   ('kafra' | 'sarjan' | 'shinobi' | 'richjoker' | 'kapitan' | 'liza').
--
--   Rollback: re-run the original `using (true)` policies from each
--   brand's supabase/schema.sql to restore previous behaviour.

-- ---------------------------------------------------------------
-- Helper: brand id from the request JWT (null when absent/empty)
-- ---------------------------------------------------------------
create or replace function public.current_brand_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'brand_id', '');
$$;

revoke all on function public.current_brand_id() from public;
grant execute on function public.current_brand_id() to authenticated;

-- ---------------------------------------------------------------
-- signals — read only own brand (Realtime-compatible)
-- ---------------------------------------------------------------
drop policy if exists "anon_can_read_signals" on public.signals;
drop policy if exists "brand_can_read_signals" on public.signals;
create policy "brand_can_read_signals" on public.signals for select to authenticated
  using (brand_id = public.current_brand_id());

-- ---------------------------------------------------------------
-- performance_logs — read only own brand
-- ---------------------------------------------------------------
drop policy if exists "anon_can_read_logs" on public.performance_logs;
drop policy if exists "brand_can_read_logs" on public.performance_logs;
create policy "brand_can_read_logs" on public.performance_logs for select to authenticated
  using (brand_id = public.current_brand_id());

-- ---------------------------------------------------------------
-- access_keys — read/update only own brand, session-bound
-- ---------------------------------------------------------------
drop policy if exists "anon_can_read_access_keys" on public.access_keys;
drop policy if exists "anon_can_update_access_keys" on public.access_keys;
drop policy if exists "brand_can_read_access_keys" on public.access_keys;
drop policy if exists "brand_can_update_access_keys" on public.access_keys;

create policy "brand_can_read_access_keys" on public.access_keys for select to authenticated
  using (is_active = true and brand_id = public.current_brand_id());

create policy "brand_can_update_access_keys" on public.access_keys for update to authenticated
  using (
    is_active = true
    and brand_id = public.current_brand_id()
    and (expired_at is null or expired_at > now())
  )
  with check (
    is_active = true
    and brand_id = public.current_brand_id()
    and (expired_at is null or expired_at > now())
  );

-- ---------------------------------------------------------------
-- security_alerts — insert only into own brand
-- ---------------------------------------------------------------
drop policy if exists "anon_can_insert_alerts" on public.security_alerts;
drop policy if exists "brand_can_insert_alerts" on public.security_alerts;
create policy "brand_can_insert_alerts" on public.security_alerts for insert to authenticated
  with check (brand_id = public.current_brand_id());

-- ---------------------------------------------------------------
-- Grants: move the column-level access from anon -> authenticated
-- (RLS still gates the rows; grants just allow the verb on the table)
-- ---------------------------------------------------------------
grant select on public.signals to authenticated;
grant select on public.performance_logs to authenticated;
grant select on public.access_keys to authenticated;
grant insert on public.security_alerts to authenticated;

-- access_keys: client may only touch session fields, never identity/brand fields
revoke update (key, label, is_active, expired_at, subscriber_id, brand_id) on public.access_keys from authenticated;
grant update (fingerprint_id, session_token, last_login_at) on public.access_keys to authenticated;

-- Remove the now-unused anon table privileges so anon cannot read cross-brand.
revoke select on public.signals from anon;
revoke select on public.performance_logs from anon;
revoke select on public.access_keys from anon;
revoke update (fingerprint_id, session_token, last_login_at) on public.access_keys from anon;
revoke insert on public.security_alerts from anon;
