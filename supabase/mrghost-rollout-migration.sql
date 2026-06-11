-- MR GHOST rollout (HQ shared DB)
-- Run in the SHARED HQ Supabase SQL Editor.
--
-- MR GHOST is a brand-new white-label brand (cloned from SARJAN, full-scale).
-- Section A only (brand setup). It starts empty — subscribers, access keys,
-- signals and performance logs are created live through the MR GHOST app once
-- connected to this shared DB.

-- =========================================================
-- A) Register MR GHOST brand + publish rule
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
  ('mrghost', 'MR GHOST', 'MR GHOST', 'mrghost.ezos.my', 'mrghostsignal/mrghostsignal', 'mrghostsignal', 'MR GHOST', 'white_label')
on conflict (id) do update set
  display_name = excluded.display_name,
  canonical_name = excluded.canonical_name,
  domain = excluded.domain,
  github_repo = excluded.github_repo,
  vercel_project = excluded.vercel_project,
  local_folder = excluded.local_folder,
  role = excluded.role,
  updated_at = now();

-- Publish rule. routing_mode is 'direct' | 'transform'. MR GHOST receives the
-- same HQ fan-out signal stream as the other brands at FULL scale.
-- settings = '{}' means NO price-distance multiplier override -> defaults to 1.0
-- (full-scale, like KAFRA/SARJAN/KAPITAN; NOT the 0.5 used by richjoker/shinobi).
insert into public.brand_publish_rules (
  brand_id,
  webhook_enabled,
  fanout_enabled,
  routing_mode,
  settings
)
values
  ('mrghost', true, true, 'direct', '{}'::jsonb)
on conflict (brand_id) do update set
  webhook_enabled = excluded.webhook_enabled,
  fanout_enabled = excluded.fanout_enabled,
  routing_mode = excluded.routing_mode,
  settings = excluded.settings;

-- Quick verify:
-- select * from public.brands where id = 'mrghost';
-- select brand_id, webhook_enabled, fanout_enabled, routing_mode
--   from public.brand_publish_rules where brand_id = 'mrghost';

-- =========================================================
-- B) Data migration: NOT APPLICABLE
-- =========================================================
-- MR GHOST starts empty. Do NOT run any per-brand schema against the shared DB —
-- all tables already exist (see the brand app's supabase/README.md).
