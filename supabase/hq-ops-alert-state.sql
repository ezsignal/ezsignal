-- HQ Ops alert state (cooldown + persistence)
-- Run in SHARED HQ Supabase SQL Editor.
-- Safe to rerun.

create table if not exists public.hq_ops_alert_state (
  alert_key text primary key,
  brand_id text,
  mode text,
  severity text not null default 'warning',
  title text not null,
  message text not null,
  status text not null default 'active',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_hq_ops_alert_state_status
  on public.hq_ops_alert_state (status, severity, updated_at desc);

create index if not exists idx_hq_ops_alert_state_brand
  on public.hq_ops_alert_state (brand_id, mode, status);
