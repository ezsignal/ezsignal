-- KAPITAN rollout + SARJAN -> KAPITAN migration (HQ shared DB)
-- Run in SHARED HQ Supabase SQL Editor.
-- Safe pattern: run section A first (brand setup), verify app, then run section B (data move).

-- =========================================================
-- A) Add KAPITAN brand + clone SARJAN brand-level settings
-- =========================================================

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
  ('kapitan', 'KAPITAN SIGNAL', 'KAPITAN SIGNAL', 'kapitan.ezos.my', 'kapitansignal/kapitansignal', 'kapitansignal', 'KAPITAN SIGNAL', 'white_label')
on conflict (id) do update set
  display_name = excluded.display_name,
  canonical_name = excluded.canonical_name,
  domain = excluded.domain,
  github_repo = excluded.github_repo,
  vercel_project = excluded.vercel_project,
  local_folder = excluded.local_folder,
  role = excluded.role,
  updated_at = now();

-- Clone SARJAN publish rule to KAPITAN (if SARJAN rule exists).
insert into public.brand_publish_rules (
  brand_id,
  webhook_enabled,
  fanout_enabled,
  routing_mode,
  settings
)
select
  'kapitan' as brand_id,
  webhook_enabled,
  fanout_enabled,
  routing_mode,
  settings
from public.brand_publish_rules
where brand_id = 'sarjan'
on conflict (brand_id) do update set
  webhook_enabled = excluded.webhook_enabled,
  fanout_enabled = excluded.fanout_enabled,
  routing_mode = excluded.routing_mode,
  settings = excluded.settings;

-- Clone SARJAN telegram registration-alert bot settings to KAPITAN.
insert into public.telegram_bots (
  brand_id,
  bot_name,
  bot_token_secret_ref,
  channel_id,
  is_active
)
select
  'kapitan' as brand_id,
  bot_name,
  bot_token_secret_ref,
  channel_id,
  is_active
from public.telegram_bots
where brand_id = 'sarjan'
  and bot_name = 'registration_alert'
on conflict (brand_id, bot_name) do update set
  bot_token_secret_ref = excluded.bot_token_secret_ref,
  channel_id = excluded.channel_id,
  is_active = excluded.is_active,
  updated_at = now();

-- Quick verify A:
-- select * from public.brands where id in ('sarjan','kapitan');
-- select brand_id, bot_name, is_active from public.telegram_bots where brand_id in ('sarjan','kapitan');
-- select brand_id, webhook_enabled, fanout_enabled, routing_mode from public.brand_publish_rules where brand_id in ('sarjan','kapitan');

-- =========================================================
-- B) Migrate data SARJAN -> KAPITAN (run during short maintenance window)
-- =========================================================
-- Suggested flow:
-- 1) Pause SARJAN registration + SARJAN fanout/webhook temporarily
-- 2) Run this block
-- 3) Resume using KAPITAN app + brand id

begin;

-- Pre-check counts before move
create temporary table _kapitan_pre_counts as
select 'subscribers' as table_name, count(*)::bigint as total from public.subscribers where brand_id = 'sarjan'
union all
select 'access_keys', count(*)::bigint from public.access_keys where brand_id = 'sarjan'
union all
select 'signals', count(*)::bigint from public.signals where brand_id = 'sarjan'
union all
select 'performance_logs', count(*)::bigint from public.performance_logs where brand_id = 'sarjan'
union all
select 'security_alerts', count(*)::bigint from public.security_alerts where brand_id = 'sarjan';

-- Main move
update public.subscribers
set brand_id = 'kapitan',
    updated_at = now()
where brand_id = 'sarjan';

update public.access_keys
set brand_id = 'kapitan',
    updated_at = now()
where brand_id = 'sarjan';

update public.signals
set brand_id = 'kapitan',
    updated_at = now()
where brand_id = 'sarjan';

update public.performance_logs
set brand_id = 'kapitan'
where brand_id = 'sarjan';

update public.security_alerts
set brand_id = 'kapitan'
where brand_id = 'sarjan';

-- Optional ancillary tables (safe if table exists and has brand_id)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='webhook_event_ingress' and column_name='brand_id') then
    execute 'update public.webhook_event_ingress set brand_id = ''kapitan'' where brand_id = ''sarjan''';
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='signal_dispatch_jobs' and column_name='brand_id') then
    execute 'update public.signal_dispatch_jobs set brand_id = ''kapitan'' where brand_id = ''sarjan''';
  end if;
end $$;

-- Post-check
create temporary table _kapitan_post_counts as
select 'subscribers' as table_name, count(*)::bigint as total from public.subscribers where brand_id = 'kapitan'
union all
select 'access_keys', count(*)::bigint from public.access_keys where brand_id = 'kapitan'
union all
select 'signals', count(*)::bigint from public.signals where brand_id = 'kapitan'
union all
select 'performance_logs', count(*)::bigint from public.performance_logs where brand_id = 'kapitan'
union all
select 'security_alerts', count(*)::bigint from public.security_alerts where brand_id = 'kapitan';

commit;

-- Compare moved totals:
select
  coalesce(pre.table_name, post.table_name) as table_name,
  coalesce(pre.total, 0) as sarjan_before,
  coalesce(post.total, 0) as kapitan_after
from _kapitan_pre_counts pre
full outer join _kapitan_post_counts post
  on post.table_name = pre.table_name
order by table_name;

-- Final sanity:
-- select brand_id, count(*) from public.subscribers where brand_id in ('sarjan','kapitan') group by 1 order by 1;
-- select brand_id, mode, status, count(*) from public.signals where brand_id in ('sarjan','kapitan') group by 1,2,3 order by 1,2,3;
