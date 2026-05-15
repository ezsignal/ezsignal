-- EZ SIGNAL HQ admin/schema alignment
-- Run in the SHARED HQ Supabase SQL Editor.
-- Safe to rerun. Aligns HQ shared tables with brand admin/dashboard fields.

alter table public.signals add column if not exists mode text not null default 'scalping';
alter table public.signals add column if not exists live_price numeric;
alter table public.signals add column if not exists max_floating_pips numeric;

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

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'signals'
      and con.contype = 'c'
      and con.conname like '%mode%'
  loop
    execute format('alter table public.signals drop constraint %I', constraint_name);
  end loop;

  alter table public.signals
    add constraint signals_mode_check
    check (mode in ('scalping', 'intraday'));
end;
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'performance_logs'
      and con.contype = 'c'
      and con.conname like '%mode%'
  loop
    execute format('alter table public.performance_logs drop constraint %I', constraint_name);
  end loop;

  alter table public.performance_logs
    add constraint performance_logs_mode_check
    check (mode in ('scalping', 'intraday'));
end;
$$;

create or replace view hq_migration.brand_tally as
with base as (
  select id as brand_id
  from public.brands
  where id in ('kafra', 'sarjan', 'richjoker', 'shinobi')
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

select * from hq_migration.brand_tally;
