-- LIZA FX ACADEMY rollout (HQ shared DB)
-- Run in the SHARED HQ Supabase SQL Editor.
--
-- LIZA is a BRAND-NEW independent white-label brand (NOT a rename/migration
-- from another brand like KAPITAN<-SARJAN), so there is only a Section A
-- (brand setup). No data-move block is needed. Run section A, then verify the
-- LIZA app login/registration against the shared DB.

-- =========================================================
-- A) Register LIZA brand + default publish rule
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
  ('liza', 'LIZA FX ACADEMY', 'LIZA FX ACADEMY', 'lizafx.ezos.my', 'lizafx/lizafx', 'lizafx', 'LIZA', 'white_label')
on conflict (id) do update set
  display_name = excluded.display_name,
  canonical_name = excluded.canonical_name,
  domain = excluded.domain,
  github_repo = excluded.github_repo,
  vercel_project = excluded.vercel_project,
  local_folder = excluded.local_folder,
  role = excluded.role,
  updated_at = now();

-- Default publish rule for LIZA.
-- Independent brand: it ingests its own TradingView webhook directly
-- (webhook_enabled = true) and does NOT receive HQ fan-out (fanout_enabled =
-- false), routing direct. Adjust later from the HQ admin if LIZA is moved
-- under HQ fan-out.
insert into public.brand_publish_rules (
  brand_id,
  webhook_enabled,
  fanout_enabled,
  routing_mode,
  settings
)
values
  ('liza', true, false, 'direct', '{}'::jsonb)
on conflict (brand_id) do update set
  webhook_enabled = excluded.webhook_enabled,
  fanout_enabled = excluded.fanout_enabled,
  routing_mode = excluded.routing_mode,
  settings = excluded.settings;

-- (Optional) LIZA registration-alert Telegram bot.
-- The LIZA website sends its own registration alerts via env vars
-- (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID in the LIZA app .env.local), so an
-- HQ telegram_bots row is NOT required for normal operation. Add one only if
-- HQ-side fan-out is later enabled for LIZA. Template (fill the secret ref +
-- channel id first, then set is_active = true):
--
-- insert into public.telegram_bots (brand_id, bot_name, bot_token_secret_ref, channel_id, is_active)
-- values ('liza', 'registration_alert', '<vault-secret-ref>', '<channel_id>', false)
-- on conflict (brand_id, bot_name) do update set
--   bot_token_secret_ref = excluded.bot_token_secret_ref,
--   channel_id = excluded.channel_id,
--   is_active = excluded.is_active,
--   updated_at = now();

-- Quick verify A:
-- select * from public.brands where id = 'liza';
-- select brand_id, webhook_enabled, fanout_enabled, routing_mode
--   from public.brand_publish_rules where brand_id = 'liza';

-- =========================================================
-- B) Data migration: NOT APPLICABLE
-- =========================================================
-- LIZA starts empty. Subscribers, access keys, signals and performance logs
-- are created live through the LIZA app once it is connected to this DB.
