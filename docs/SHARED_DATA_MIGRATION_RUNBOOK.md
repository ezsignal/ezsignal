# Shared Data Migration Runbook (4 Brands -> 1 Supabase)

Last updated: 2026-05-14.

Goal: move `KAFRA`, `SARJAN`, `RICH JOKER`, `SHINOBI` live data into shared HQ Supabase and make tally pass.

## 0) Before Starting

1. Shared schema already applied (`supabase/shared-schema.draft.sql`).
2. HQ production env points to shared Supabase:
   - `HQ_SUPABASE_URL`
   - `HQ_SUPABASE_SERVICE_ROLE_KEY`
3. HQ live audit endpoint is available:
   - `GET https://signal.ezos.my/api/hq/audit/tally`

## 1) Run SQL Playbook Once (Shared Supabase)

Open SQL Editor in shared Supabase and run:

- `supabase/shared-data-migration.playbook.sql`

This creates:

- stage tables in schema `hq_migration`
- merge function `hq_migration.merge_brand_stage(...)`
- verification views:
  - `hq_migration.brand_tally`
  - `hq_migration.unknown_brand_rows`

## 2) Export CSV from Each Old Brand Supabase

From each old project (brand DB), export these tables as CSV:

1. `subscribers`
2. `access_keys`
3. `signals`
4. `performance_logs`

For each exported CSV:

- add a new column: `source_brand`
- fill all rows with one value:
  - `kafra` / `sarjan` / `richjoker` / `shinobi`

## 3) Import CSV to Stage Tables (Shared Supabase)

Import to:

- `hq_migration.stage_subscribers`
- `hq_migration.stage_access_keys`
- `hq_migration.stage_signals`
- `hq_migration.stage_performance_logs`

Important:

- keep original `id` values from source.
- do not edit UUID format.

## 4) Merge by Brand (Shared Supabase SQL Editor)

Run in order:

```sql
select hq_migration.merge_brand_stage('kafra', 'kafra');
select hq_migration.merge_brand_stage('sarjan', 'sarjan');
select hq_migration.merge_brand_stage('richjoker', 'richjoker');
select hq_migration.merge_brand_stage('shinobi', 'shinobi');
```

If rerun needed for one brand:

```sql
select hq_migration.clear_stage('sarjan');
-- re-import only sarjan CSVs to stage
select hq_migration.merge_brand_stage('sarjan', 'sarjan');
```

## 5) SQL Verification

```sql
select * from hq_migration.brand_tally;
select * from hq_migration.unknown_brand_rows;
```

Pass target:

- brand tally numbers look correct per brand.
- all `unknown_rows = 0`.

## 6) HQ Verification (Production)

1. Open:
   - `https://signal.ezos.my`
2. Check `Live Tally Audit` panel:
   - status should become healthy
   - no mismatch issues
3. Check raw API:
   - `GET https://signal.ezos.my/api/hq/audit/tally`

Pass target:

- `"healthy": true`
- `"issues": []`
- all gaps = `0`

## 7) Final Signal Routing Test

After data migration passes:

1. send one manual HQ signal to all brands
2. verify dispatch status:
   - `GET /api/hq/dispatch/status`
3. verify each brand website/admin sees incoming signal correctly.

---

If tally still fails, first check:

1. wrong `source_brand` value in CSV
2. missing `brand_id` mapping during merge
3. import skipped rows due to invalid UUID/type in CSV
4. duplicate/dirty source rows from repeated export
