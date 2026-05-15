-- EZ SIGNAL HQ shared data migration playbook
-- Run in SHARED Supabase project SQL Editor (the HQ project).
-- This script is idempotent and safe to rerun.

create extension if not exists pgcrypto;
create schema if not exists hq_migration;

-- 0) Ensure the 4 brands are present (normally seeded by shared-schema.draft.sql).
insert into public.brands (
  id,
  display_name,
  canonical_name,
  domain,
  github_repo,
  vercel_project,
  local_folder,
  role
)
values
  ('kafra', 'KAFRA SIGNAL', 'KAFRA SIGNAL', 'signal.kafra.ai', 'kafrasignal/kafrasignal', 'kafrasignal', 'KAFRA SIGNAL', 'core'),
  ('sarjan', 'SARJAN SIGNAL', 'SARJAN SIGNAL', 'sarjansignal.ezos.my', 'sarjansignal/sarjansignal', 'sarjansignal', 'SARJAN SIGNAL', 'white_label'),
  ('richjoker', 'RICH JOKER', 'RICH JOKER INDI', 'richjoker.ezos.my', 'richjokerindi/richjokerindi', 'richjoker', 'RICH JOKER INDI', 'white_label'),
  ('shinobi', 'SHINOBI', 'SHINOBI INDI', 'shinobi.ezos.my', 'shinobiindi/shinobiindi', 'shinobi', 'SHINOBI INDI', 'white_label')
on conflict (id) do update set
  display_name = excluded.display_name,
  canonical_name = excluded.canonical_name,
  domain = excluded.domain,
  github_repo = excluded.github_repo,
  vercel_project = excluded.vercel_project,
  local_folder = excluded.local_folder,
  role = excluded.role,
  updated_at = now();

-- 1) Staging tables for import.
-- Import CSV data into these stage tables first (Table Editor).
create table if not exists hq_migration.stage_subscribers (
  like public.subscribers including defaults
);
alter table hq_migration.stage_subscribers add column if not exists source_brand text;

create table if not exists hq_migration.stage_access_keys (
  like public.access_keys including defaults
);
alter table hq_migration.stage_access_keys add column if not exists source_brand text;

create table if not exists hq_migration.stage_signals (
  like public.signals including defaults
);
alter table hq_migration.stage_signals add column if not exists source_brand text;
alter table public.signals add column if not exists mode text not null default 'scalping';
alter table public.signals add column if not exists live_price numeric;
alter table public.signals add column if not exists max_floating_pips numeric;
alter table hq_migration.stage_signals add column if not exists mode text;
alter table hq_migration.stage_signals add column if not exists type text;
alter table hq_migration.stage_signals add column if not exists entry_target numeric;
alter table hq_migration.stage_signals add column if not exists live_price numeric;
alter table hq_migration.stage_signals add column if not exists sl numeric;
alter table hq_migration.stage_signals add column if not exists tp1 numeric;
alter table hq_migration.stage_signals add column if not exists tp2 numeric;
alter table hq_migration.stage_signals add column if not exists tp3 numeric;
alter table hq_migration.stage_signals add column if not exists max_floating_pips numeric;

create table if not exists hq_migration.stage_performance_logs (
  like public.performance_logs including defaults
);
alter table hq_migration.stage_performance_logs add column if not exists source_brand text;
alter table public.performance_logs add column if not exists mode text not null default 'scalping';
alter table public.performance_logs add column if not exists net_pips numeric;
alter table public.performance_logs add column if not exists peak_pips numeric;
update public.signals
set mode = 'scalping'
where mode is null
   or mode not in ('scalping', 'intraday');
update public.performance_logs
set mode = 'scalping'
where mode is null
   or mode not in ('scalping', 'intraday');
update public.performance_logs
set net_pips = points
where net_pips is null
  and points is not null;
update public.performance_logs
set peak_pips = coalesce(peak_pips, net_pips, points)
where peak_pips is null
  and coalesce(net_pips, points) is not null;
alter table hq_migration.stage_performance_logs add column if not exists mode text;
alter table hq_migration.stage_performance_logs add column if not exists type text;
alter table hq_migration.stage_performance_logs add column if not exists net_pips numeric;
alter table hq_migration.stage_performance_logs add column if not exists peak_pips numeric;

-- Optional helper to clear stage rows per source brand before re-importing CSV.
create or replace function hq_migration.clear_stage(p_source_brand text)
returns void
language plpgsql
as $$
begin
  delete from hq_migration.stage_performance_logs where lower(coalesce(source_brand, '')) = lower(p_source_brand);
  delete from hq_migration.stage_access_keys where lower(coalesce(source_brand, '')) = lower(p_source_brand);
  delete from hq_migration.stage_signals where lower(coalesce(source_brand, '')) = lower(p_source_brand);
  delete from hq_migration.stage_subscribers where lower(coalesce(source_brand, '')) = lower(p_source_brand);
end;
$$;

-- 2) Merge one brand from stage -> public tables.
-- Required import order inside function:
-- subscribers -> access_keys -> signals -> performance_logs
create or replace function hq_migration.merge_brand_stage(
  p_source_brand text,
  p_target_brand text
)
returns jsonb
language plpgsql
as $$
declare
  v_subscribers bigint := 0;
  v_access_keys bigint := 0;
  v_signals bigint := 0;
  v_performance_logs bigint := 0;
begin
  if not exists (select 1 from public.brands where id = p_target_brand) then
    raise exception 'Unknown target brand: %', p_target_brand;
  end if;

  insert into public.subscribers (
    id,
    brand_id,
    name,
    email,
    phone,
    package_name,
    status,
    introducer,
    notes,
    created_at,
    updated_at
  )
  select
    s.id,
    p_target_brand,
    s.name,
    s.email,
    s.phone,
    coalesce(s.package_name, 'Premium'),
    coalesce(s.status, 'active'),
    s.introducer,
    s.notes,
    coalesce(s.created_at, now()),
    coalesce(s.updated_at, now())
  from hq_migration.stage_subscribers s
  where lower(coalesce(s.source_brand, '')) = lower(p_source_brand)
  on conflict (id) do update set
    brand_id = excluded.brand_id,
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    package_name = excluded.package_name,
    status = excluded.status,
    introducer = excluded.introducer,
    notes = excluded.notes,
    updated_at = now();
  get diagnostics v_subscribers = row_count;

  insert into public.access_keys (
    id,
    brand_id,
    subscriber_id,
    key,
    key_hash,
    label,
    fingerprint_id,
    session_token,
    is_active,
    expired_at,
    last_login_at,
    created_at,
    updated_at
  )
  select
    k.id,
    p_target_brand,
    case
      when k.subscriber_id is not null
        and exists (
          select 1
          from public.subscribers s
          where s.id = k.subscriber_id
            and s.brand_id = p_target_brand
        )
      then k.subscriber_id
      else null
    end as subscriber_id,
    k.key,
    k.key_hash,
    k.label,
    k.fingerprint_id,
    k.session_token,
    coalesce(k.is_active, true),
    k.expired_at,
    k.last_login_at,
    coalesce(k.created_at, now()),
    coalesce(k.updated_at, now())
  from hq_migration.stage_access_keys k
  where lower(coalesce(k.source_brand, '')) = lower(p_source_brand)
    and (k.key is not null or k.key_hash is not null)
  on conflict (id) do update set
    brand_id = excluded.brand_id,
    subscriber_id = excluded.subscriber_id,
    key = excluded.key,
    key_hash = excluded.key_hash,
    label = excluded.label,
    fingerprint_id = excluded.fingerprint_id,
    session_token = excluded.session_token,
    is_active = excluded.is_active,
    expired_at = excluded.expired_at,
    last_login_at = excluded.last_login_at,
    updated_at = now();
  get diagnostics v_access_keys = row_count;

  insert into public.signals (
    id,
    brand_id,
    pair,
    mode,
    action,
    entry,
    live_price,
    stop_loss,
    take_profit_1,
    take_profit_2,
    take_profit_3,
    max_floating_pips,
    status,
    note,
    created_at,
    updated_at
  )
  select
    sg.id,
    p_target_brand,
    coalesce(sg.pair, 'XAUUSD'),
    coalesce(nullif(sg.mode, ''), 'scalping'),
    coalesce(nullif(sg.action, ''), nullif(sg.type, ''), 'buy'),
    coalesce(sg.entry, sg.entry_target),
    sg.live_price,
    coalesce(sg.stop_loss, sg.sl),
    coalesce(sg.take_profit_1, sg.tp1),
    coalesce(sg.take_profit_2, sg.tp2),
    coalesce(sg.take_profit_3, sg.tp3),
    sg.max_floating_pips,
    coalesce(sg.status, 'active'),
    sg.note,
    coalesce(sg.created_at, now()),
    coalesce(sg.updated_at, now())
  from hq_migration.stage_signals sg
  where lower(coalesce(sg.source_brand, '')) = lower(p_source_brand)
  on conflict (id) do update set
    brand_id = excluded.brand_id,
    pair = excluded.pair,
    mode = excluded.mode,
    action = excluded.action,
    entry = excluded.entry,
    live_price = excluded.live_price,
    stop_loss = excluded.stop_loss,
    take_profit_1 = excluded.take_profit_1,
    take_profit_2 = excluded.take_profit_2,
    take_profit_3 = excluded.take_profit_3,
    max_floating_pips = excluded.max_floating_pips,
    status = excluded.status,
    note = excluded.note,
    updated_at = now();
  get diagnostics v_signals = row_count;

  insert into public.performance_logs (
    id,
    brand_id,
    signal_id,
    pair,
    mode,
    action,
    outcome,
    points,
    net_pips,
    peak_pips,
    price,
    created_at
  )
  select
    p.id,
    p_target_brand,
    case
      when p.signal_id is not null
        and exists (
          select 1
          from public.signals s
          where s.id = p.signal_id
            and s.brand_id = p_target_brand
        )
      then p.signal_id
      else null
    end as signal_id,
    coalesce(p.pair, 'XAUUSD'),
    coalesce(nullif(p.mode, ''), 'scalping'),
    coalesce(nullif(p.action, ''), nullif(p.type, ''), 'buy'),
    p.outcome,
    coalesce(p.points, p.net_pips),
    coalesce(p.net_pips, p.points),
    coalesce(p.peak_pips, p.net_pips, p.points),
    p.price,
    coalesce(p.created_at, now())
  from hq_migration.stage_performance_logs p
  where lower(coalesce(p.source_brand, '')) = lower(p_source_brand)
  on conflict (id) do update set
    brand_id = excluded.brand_id,
    signal_id = excluded.signal_id,
    pair = excluded.pair,
    mode = excluded.mode,
    action = excluded.action,
    outcome = excluded.outcome,
    points = excluded.points,
    net_pips = excluded.net_pips,
    peak_pips = excluded.peak_pips,
    price = excluded.price,
    created_at = excluded.created_at;
  get diagnostics v_performance_logs = row_count;

  return jsonb_build_object(
    'source_brand', p_source_brand,
    'target_brand', p_target_brand,
    'subscribers_upserted', v_subscribers,
    'access_keys_upserted', v_access_keys,
    'signals_upserted', v_signals,
    'performance_logs_upserted', v_performance_logs
  );
end;
$$;

-- 3) Tally queries for SQL-side verification.
-- A) counts by brand
create or replace view hq_migration.brand_tally as
with base as (
  select id as brand_id from public.brands where id in ('kafra', 'sarjan', 'richjoker', 'shinobi')
)
select
  b.brand_id,
  (select count(*) from public.subscribers s where s.brand_id = b.brand_id and s.status = 'active') as active_users,
  (select count(*) from public.subscribers s where s.brand_id = b.brand_id and s.status = 'expired') as expired_users,
  (select count(*) from public.access_keys k where k.brand_id = b.brand_id) as keys_issued,
  (select count(*) from public.signals sg where sg.brand_id = b.brand_id and sg.created_at >= date_trunc('day', now() at time zone 'utc')) as signals_today_utc,
  (select count(*) from public.performance_logs p where p.brand_id = b.brand_id) as performance_logs,
  (select count(*) from public.signals sg where sg.brand_id = b.brand_id) as signals_total,
  (select max(sg.created_at) from public.signals sg where sg.brand_id = b.brand_id) as latest_signal_at,
  (select max(p.created_at) from public.performance_logs p where p.brand_id = b.brand_id) as latest_performance_at
from base b
order by b.brand_id;

-- B) unknown brand_id rows
create or replace view hq_migration.unknown_brand_rows as
select 'subscribers' as table_name, count(*) as unknown_rows
from public.subscribers
where brand_id not in ('kafra', 'sarjan', 'richjoker', 'shinobi')
union all
select 'access_keys' as table_name, count(*) as unknown_rows
from public.access_keys
where brand_id not in ('kafra', 'sarjan', 'richjoker', 'shinobi')
union all
select 'signals' as table_name, count(*) as unknown_rows
from public.signals
where brand_id not in ('kafra', 'sarjan', 'richjoker', 'shinobi')
union all
select 'performance_logs' as table_name, count(*) as unknown_rows
from public.performance_logs
where brand_id not in ('kafra', 'sarjan', 'richjoker', 'shinobi');

-- Example calls after CSV imports:
-- select hq_migration.clear_stage('kafra');
-- select hq_migration.merge_brand_stage('kafra', 'kafra');
-- select hq_migration.merge_brand_stage('sarjan', 'sarjan');
-- select hq_migration.merge_brand_stage('richjoker', 'richjoker');
-- select hq_migration.merge_brand_stage('shinobi', 'shinobi');
-- select * from hq_migration.brand_tally;
-- select * from hq_migration.unknown_brand_rows;
