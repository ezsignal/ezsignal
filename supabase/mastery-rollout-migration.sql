-- MASTERY SIGNAL rollout (HQ shared DB)
-- Run in the SHARED HQ Supabase SQL Editor.
--
-- MASTERY is a brand-new white-label brand. Section A only (brand setup).
-- It starts empty — subscribers, access keys, signals and performance logs are
-- created live through the MASTERY app once connected to this shared DB.

-- =========================================================
-- A) Register MASTERY SIGNAL brand + publish rule
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
  ('mastery', 'MASTERY SIGNAL', 'MASTERY SIGNAL', 'www.masterysignal.com', 'masterysignal/masterysignal', 'masterysignal', 'MASTERY SIGNAL', 'white_label')
on conflict (id) do update set
  display_name = excluded.display_name,
  canonical_name = excluded.canonical_name,
  domain = excluded.domain,
  github_repo = excluded.github_repo,
  vercel_project = excluded.vercel_project,
  local_folder = excluded.local_folder,
  role = excluded.role,
  updated_at = now();

-- Publish rule. routing_mode is 'direct' | 'transform'. MASTERY receives the
-- same HQ fan-out signal stream as the other brands; fan-out delivery is gated
-- by the env secret HQ_BRAND_MASTERY_WEBHOOK_SECRET (HQ Vercel) which must equal
-- MASTERY's TRADINGVIEW_WEBHOOK_SECRET. (webhook_enabled/fanout_enabled are
-- legacy flags kept for compatibility.)
insert into public.brand_publish_rules (
  brand_id,
  webhook_enabled,
  fanout_enabled,
  routing_mode,
  settings
)
values
  ('mastery', true, true, 'direct', '{}'::jsonb)
on conflict (brand_id) do update set
  webhook_enabled = excluded.webhook_enabled,
  fanout_enabled = excluded.fanout_enabled,
  routing_mode = excluded.routing_mode,
  settings = excluded.settings;

-- Quick verify:
-- select * from public.brands where id = 'mastery';
-- select brand_id, webhook_enabled, fanout_enabled, routing_mode
--   from public.brand_publish_rules where brand_id = 'mastery';

-- =========================================================
-- B) Data migration: NOT APPLICABLE
-- =========================================================
-- MASTERY starts empty. Do NOT run any per-brand schema against the shared DB —
-- all tables already exist (see the brand app's supabase/README.md).
