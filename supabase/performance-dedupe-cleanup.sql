-- Remove duplicated performance rows across all brands.
-- Keeps only one row per brand + pair + mode + type + time bucket.
-- Scalping bucket = 30 minutes, Intraday bucket = 4 hours.
-- Safe to run multiple times.

with ranked as (
  select
    id,
    row_number() over (
      partition by
        brand_id,
        coalesce(pair, 'XAUUSD'),
        coalesce(mode, 'scalping'),
        coalesce(action, 'buy'),
        to_timestamp(
          floor(
            extract(epoch from created_at)
            /
            case when coalesce(mode, 'scalping') = 'intraday' then 14400 else 1800 end
          )
          *
          case when coalesce(mode, 'scalping') = 'intraday' then 14400 else 1800 end
        )
      order by created_at desc, id desc
    ) as rn
  from public.performance_logs
)
delete from public.performance_logs p
using ranked r
where p.id = r.id
  and r.rn > 1;

-- Optional quick check:
-- select brand_id, count(*) from public.performance_logs group by brand_id order by brand_id;
