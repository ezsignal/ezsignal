# Post-Deploy Sanity Matrix (All Brands)

Use this after every deploy for:
- KAFRA
- SARJAN
- RICHJOKER
- SHINOBI

## 1) Subscriber / Expiry

For each brand `/admin`:
1. Edit one subscriber `package_name` (example: `Package 7D` -> `Package 30D`), save.
2. Confirm `key_expired_at` updates to now + package days.
3. Edit `key_expired_at` manually, save.
4. Refresh page and confirm manual expiry is preserved.

Expected:
- Package edit syncs expiry automatically.
- Manual expiry edit is accepted and persisted.

## 2) Webhook / Signal Fanout

From HQ webhook monitor:
1. Send one `signal` payload.
2. Send one `price_update` payload.
3. Check job status for all 4 brands = `sent`.

Expected:
- No `404` job error.
- Each brand dashboard `/access` shows active setup + live price updates.

## 3) Performance Consistency

1. Verify `/access` and `/admin` performance list has no same-minute duplicates.
2. In HQ Performance page, check grouped rows look clean (no noisy repeated rows).

Expected:
- One logical record per brand per timestamp bucket.

## 4) Quick SQL Validation (HQ shared DB)

```sql
select brand_id, count(*) as total_rows
from public.performance_logs
group by brand_id
order by brand_id;
```

```sql
select
  brand_id,
  date_trunc('minute', created_at) as minute_bucket,
  mode,
  action,
  outcome,
  round(coalesce(net_pips, points), 4) as net_pips_4dp,
  count(*) as rows_in_bucket
from public.performance_logs
group by 1,2,3,4,5,6
having count(*) > 1
order by minute_bucket desc, brand_id;
```

Expected:
- Second query should return none (or only truly different signals in same minute).
