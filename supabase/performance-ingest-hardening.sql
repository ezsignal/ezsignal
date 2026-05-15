-- Performance ingest hardening (HQ shared database)
-- Run in SHARED HQ Supabase SQL Editor.
-- Safe to rerun.

create index if not exists idx_performance_logs_brand_created_at
  on public.performance_logs (brand_id, created_at desc);

create or replace function hq_migration.prevent_duplicate_performance_logs()
returns trigger
language plpgsql
as $$
declare
  is_duplicate boolean;
  bucket_seconds integer;
  bucket_start timestamptz;
  bucket_end timestamptz;
begin
  if new.created_at is null then
    new.created_at := now();
  end if;

  if new.mode is null then
    new.mode := 'scalping';
  end if;

  bucket_seconds := case when coalesce(new.mode, 'scalping') = 'intraday' then 14400 else 1800 end;
  bucket_start := to_timestamp(floor(extract(epoch from new.created_at) / bucket_seconds) * bucket_seconds);
  bucket_end := bucket_start + make_interval(secs => bucket_seconds);

  if new.signal_id is not null then
    select exists (
      select 1
      from public.performance_logs p
      where p.brand_id = new.brand_id
        and p.signal_id = new.signal_id
    ) into is_duplicate;

    if is_duplicate then
      return null;
    end if;
  end if;

  select exists (
    select 1
    from public.performance_logs p
    where p.brand_id = new.brand_id
      and coalesce(p.pair, 'XAUUSD') = coalesce(new.pair, 'XAUUSD')
      and coalesce(p.mode, 'scalping') = coalesce(new.mode, 'scalping')
      and coalesce(p.action, 'buy') = coalesce(new.action, 'buy')
      and p.created_at >= bucket_start
      and p.created_at < bucket_end
  ) into is_duplicate;

  if is_duplicate then
    return null;
  end if;

  new.created_at := bucket_start;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_performance_logs
on public.performance_logs;

create trigger trg_prevent_duplicate_performance_logs
before insert on public.performance_logs
for each row
execute function hq_migration.prevent_duplicate_performance_logs();

-- Optional monitor query:
-- select
--   brand_id,
--   date_trunc('minute', created_at) as minute_bucket,
--   mode,
--   action,
--   outcome,
--   round(coalesce(net_pips, points), 4) as net_pips_4dp,
--   count(*) as rows_in_bucket
-- from public.performance_logs
-- group by 1,2,3,4,5,6
-- having count(*) > 1
-- order by minute_bucket desc, brand_id;
