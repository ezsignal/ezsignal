-- EZ SIGNAL HQ shared Supabase schema draft.
-- Review first. Do not paste into production SQL editor until the app code is brand-aware.

create extension if not exists pgcrypto;

create table if not exists public.brands (
  id text primary key,
  display_name text not null,
  canonical_name text not null,
  domain text not null unique,
  github_repo text not null,
  vercel_project text not null,
  local_folder text not null,
  role text not null check (role in ('core', 'white_label')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_profiles(id) on delete cascade,
  brand_id text not null references public.brands(id) on delete cascade,
  role text not null check (role in ('brand_admin', 'signal_operator', 'support', 'viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, brand_id, role)
);

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  package_name text not null default 'Premium',
  status text not null default 'active' check (status in ('active', 'expired', 'pending', 'cancelled')),
  introducer text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_keys (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  subscriber_id uuid references public.subscribers(id) on delete set null,
  key text,
  key_hash text,
  label text,
  fingerprint_id text,
  session_token text,
  is_active boolean not null default true,
  expired_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key is not null or key_hash is not null)
);

create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  access_key_id uuid references public.access_keys(id) on delete set null,
  key text,
  reason text not null,
  fingerprint_id text,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  pair text not null default 'XAUUSD',
  mode text not null default 'scalping' check (mode in ('scalping', 'intraday')),
  action text not null check (action in ('buy', 'sell')),
  entry numeric not null,
  live_price numeric,
  stop_loss numeric,
  take_profit_1 numeric,
  take_profit_2 numeric,
  take_profit_3 numeric,
  max_floating_pips numeric,
  status text not null default 'active' check (status in ('active', 'closed', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  signal_id uuid references public.signals(id) on delete set null,
  pair text not null default 'XAUUSD',
  mode text not null default 'scalping' check (mode in ('scalping', 'intraday')),
  action text not null check (action in ('buy', 'sell')),
  outcome text not null check (outcome in ('tp1', 'tp2', 'tp3', 'sl', 'be')),
  points numeric,
  net_pips numeric,
  peak_pips numeric,
  price numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.performance_log_edits (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  log_id uuid not null references public.performance_logs(id) on delete cascade,
  previous_outcome text,
  next_outcome text,
  reason text,
  edited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.package_links (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  token text not null,
  package_name text not null default 'Premium',
  max_redemptions integer,
  redemptions_count integer not null default 0,
  expires_at timestamptz,
  agent_name text,
  click_count integer not null default 0,
  last_clicked_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, token)
);

create table if not exists public.link_redemptions (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  package_link_id uuid not null references public.package_links(id) on delete cascade,
  subscriber_id uuid references public.subscribers(id) on delete set null,
  access_key_id uuid references public.access_keys(id) on delete set null,
  email_normalized text,
  phone_normalized text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_bots (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.brands(id) on delete cascade,
  bot_name text not null,
  bot_token_secret_ref text not null,
  channel_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, bot_name)
);

-- Admin/dashboard compatibility columns for signal fanout and performance editing.
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

create table if not exists public.landing_settings (
  brand_id text primary key references public.brands(id) on delete cascade,
  hero_title text,
  hero_subtitle text,
  pricing jsonb not null default '[]'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  testimonials jsonb not null default '[]'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_settings (
  brand_id text primary key references public.brands(id) on delete cascade,
  registration_enabled boolean not null default true,
  signal_publish_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_event_ingress (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'unknown',
  event_key text not null unique,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'queued', 'processed', 'failed', 'duplicate')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);

create table if not exists public.brand_publish_rules (
  brand_id text primary key references public.brands(id) on delete cascade,
  webhook_enabled boolean not null default true,
  fanout_enabled boolean not null default false,
  routing_mode text not null default 'direct' check (routing_mode in ('direct', 'transform')),
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.signal_dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  ingress_id uuid not null references public.webhook_event_ingress(id) on delete cascade,
  brand_id text not null references public.brands(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'dead_letter')),
  attempts integer not null default 0,
  next_retry_at timestamptz,
  last_error text,
  signal_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (ingress_id, brand_id)
);

create table if not exists public.webhook_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.signal_dispatch_jobs(id) on delete cascade,
  attempt_no integer not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_status integer,
  response_body text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_no)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id text references public.brands(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text,
  row_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists subscribers_brand_email_unique
  on public.subscribers (brand_id, lower(email))
  where email is not null;

create unique index if not exists subscribers_brand_phone_unique
  on public.subscribers (brand_id, phone)
  where phone is not null;

create unique index if not exists access_keys_brand_key_unique
  on public.access_keys (brand_id, key)
  where key is not null;

create unique index if not exists access_keys_brand_key_hash_unique
  on public.access_keys (brand_id, key_hash)
  where key_hash is not null;

create unique index if not exists link_redemptions_brand_link_email_unique
  on public.link_redemptions (brand_id, package_link_id, email_normalized)
  where email_normalized is not null;

create unique index if not exists link_redemptions_brand_link_phone_unique
  on public.link_redemptions (brand_id, package_link_id, phone_normalized)
  where phone_normalized is not null;

create index if not exists signals_brand_created_at_idx
  on public.signals (brand_id, created_at desc);

create index if not exists performance_logs_brand_created_at_idx
  on public.performance_logs (brand_id, created_at desc);

create index if not exists access_keys_brand_active_idx
  on public.access_keys (brand_id, is_active, expired_at);

create index if not exists signal_dispatch_jobs_status_idx
  on public.signal_dispatch_jobs (status, next_retry_at);

create index if not exists signal_dispatch_jobs_brand_created_idx
  on public.signal_dispatch_jobs (brand_id, created_at desc);

create index if not exists webhook_event_ingress_received_idx
  on public.webhook_event_ingress (received_at desc);

create or replace function public.is_hq_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.admin_profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.has_brand_role(target_brand_id text, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_hq_super_admin()
    or exists (
      select 1
      from public.admin_memberships membership
      where membership.user_id = auth.uid()
        and membership.brand_id = target_brand_id
        and membership.role = any(allowed_roles)
    );
$$;

revoke all on function public.is_hq_super_admin() from public;
revoke all on function public.has_brand_role(text, text[]) from public;
grant execute on function public.is_hq_super_admin() to authenticated;
grant execute on function public.has_brand_role(text, text[]) to authenticated;

alter table public.brands enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.admin_memberships enable row level security;
alter table public.subscribers enable row level security;
alter table public.access_keys enable row level security;
alter table public.security_alerts enable row level security;
alter table public.signals enable row level security;
alter table public.performance_logs enable row level security;
alter table public.performance_log_edits enable row level security;
alter table public.package_links enable row level security;
alter table public.link_redemptions enable row level security;
alter table public.telegram_bots enable row level security;
alter table public.landing_settings enable row level security;
alter table public.brand_settings enable row level security;
alter table public.webhook_event_ingress enable row level security;
alter table public.brand_publish_rules enable row level security;
alter table public.signal_dispatch_jobs enable row level security;
alter table public.webhook_delivery_attempts enable row level security;
alter table public.audit_logs enable row level security;

create policy "brands_read_by_members"
  on public.brands for select to authenticated
  using (public.has_brand_role(id, array['brand_admin', 'signal_operator', 'support', 'viewer']));

create policy "brands_manage_by_super_admin"
  on public.brands for all to authenticated
  using (public.is_hq_super_admin())
  with check (public.is_hq_super_admin());

create policy "admin_profiles_read_own_or_super"
  on public.admin_profiles for select to authenticated
  using (id = auth.uid() or public.is_hq_super_admin());

create policy "admin_profiles_insert_own"
  on public.admin_profiles for insert to authenticated
  with check (id = auth.uid());

create policy "admin_profiles_update_own_or_super"
  on public.admin_profiles for update to authenticated
  using (id = auth.uid() or public.is_hq_super_admin())
  with check (id = auth.uid() or public.is_hq_super_admin());

create policy "admin_memberships_read_own_or_super"
  on public.admin_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_hq_super_admin());

create policy "admin_memberships_manage_by_super_admin"
  on public.admin_memberships for all to authenticated
  using (public.is_hq_super_admin())
  with check (public.is_hq_super_admin());

create policy "subscribers_read_by_brand_role"
  on public.subscribers for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'support', 'viewer']));

create policy "subscribers_write_by_brand_role"
  on public.subscribers for insert to authenticated
  with check (public.has_brand_role(brand_id, array['brand_admin', 'support']));

create policy "subscribers_update_by_brand_role"
  on public.subscribers for update to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'support']))
  with check (public.has_brand_role(brand_id, array['brand_admin', 'support']));

create policy "access_keys_read_by_brand_role"
  on public.access_keys for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'support', 'viewer']));

create policy "access_keys_write_by_brand_role"
  on public.access_keys for insert to authenticated
  with check (public.has_brand_role(brand_id, array['brand_admin', 'support']));

create policy "access_keys_update_by_brand_role"
  on public.access_keys for update to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'support']))
  with check (public.has_brand_role(brand_id, array['brand_admin', 'support']));

create policy "signals_read_by_brand_role"
  on public.signals for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator', 'support', 'viewer']));

create policy "signals_write_by_brand_role"
  on public.signals for insert to authenticated
  with check (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator']));

create policy "signals_update_by_brand_role"
  on public.signals for update to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator']))
  with check (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator']));

create policy "performance_logs_read_by_brand_role"
  on public.performance_logs for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator', 'support', 'viewer']));

create policy "performance_logs_write_by_brand_role"
  on public.performance_logs for insert to authenticated
  with check (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator']));

create policy "performance_logs_update_by_brand_role"
  on public.performance_logs for update to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator']))
  with check (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator']));

create policy "performance_log_edits_read_by_brand_role"
  on public.performance_log_edits for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator', 'viewer']));

create policy "performance_log_edits_write_by_brand_role"
  on public.performance_log_edits for insert to authenticated
  with check (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator']));

create policy "package_links_read_by_brand_role"
  on public.package_links for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'support', 'viewer']));

create policy "package_links_write_by_brand_role"
  on public.package_links for insert to authenticated
  with check (public.has_brand_role(brand_id, array['brand_admin', 'support']));

create policy "package_links_update_by_brand_role"
  on public.package_links for update to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'support']))
  with check (public.has_brand_role(brand_id, array['brand_admin', 'support']));

create policy "link_redemptions_read_by_brand_role"
  on public.link_redemptions for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'support', 'viewer']));

create policy "link_redemptions_write_by_brand_role"
  on public.link_redemptions for insert to authenticated
  with check (public.has_brand_role(brand_id, array['brand_admin', 'support']));

create policy "security_alerts_read_by_brand_role"
  on public.security_alerts for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'support', 'viewer']));

create policy "security_alerts_write_by_brand_role"
  on public.security_alerts for insert to authenticated
  with check (public.has_brand_role(brand_id, array['brand_admin', 'support', 'signal_operator']));

create policy "telegram_bots_read_by_brand_role"
  on public.telegram_bots for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'viewer']));

create policy "telegram_bots_manage_by_brand_admin"
  on public.telegram_bots for all to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin']))
  with check (public.has_brand_role(brand_id, array['brand_admin']));

create policy "landing_settings_read_by_brand_role"
  on public.landing_settings for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'viewer']));

create policy "landing_settings_manage_by_brand_admin"
  on public.landing_settings for all to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin']))
  with check (public.has_brand_role(brand_id, array['brand_admin']));

create policy "brand_settings_read_by_brand_role"
  on public.brand_settings for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'viewer']));

create policy "brand_settings_manage_by_brand_admin"
  on public.brand_settings for all to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin']))
  with check (public.has_brand_role(brand_id, array['brand_admin']));

create policy "webhook_event_ingress_read_by_super_admin"
  on public.webhook_event_ingress for select to authenticated
  using (public.is_hq_super_admin());

create policy "webhook_event_ingress_manage_by_super_admin"
  on public.webhook_event_ingress for all to authenticated
  using (public.is_hq_super_admin())
  with check (public.is_hq_super_admin());

create policy "brand_publish_rules_read_by_brand_role"
  on public.brand_publish_rules for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'viewer']));

create policy "brand_publish_rules_manage_by_brand_admin"
  on public.brand_publish_rules for all to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin']))
  with check (public.has_brand_role(brand_id, array['brand_admin']));

create policy "signal_dispatch_jobs_read_by_brand_role"
  on public.signal_dispatch_jobs for select to authenticated
  using (public.has_brand_role(brand_id, array['brand_admin', 'signal_operator', 'viewer']));

create policy "signal_dispatch_jobs_write_by_super_admin"
  on public.signal_dispatch_jobs for insert to authenticated
  with check (public.is_hq_super_admin());

create policy "signal_dispatch_jobs_update_by_super_admin"
  on public.signal_dispatch_jobs for update to authenticated
  using (public.is_hq_super_admin())
  with check (public.is_hq_super_admin());

create policy "webhook_delivery_attempts_read_by_super_admin"
  on public.webhook_delivery_attempts for select to authenticated
  using (public.is_hq_super_admin());

create policy "webhook_delivery_attempts_write_by_super_admin"
  on public.webhook_delivery_attempts for insert to authenticated
  with check (public.is_hq_super_admin());

create policy "audit_logs_read_by_brand_role"
  on public.audit_logs for select to authenticated
  using (
    (brand_id is null and public.is_hq_super_admin())
    or (
      brand_id is not null
      and public.has_brand_role(brand_id, array['brand_admin', 'viewer'])
    )
  );

create policy "audit_logs_write_by_brand_role"
  on public.audit_logs for insert to authenticated
  with check (
    (brand_id is null and public.is_hq_super_admin())
    or (
      brand_id is not null
      and public.has_brand_role(brand_id, array['brand_admin', 'signal_operator', 'support'])
    )
  );

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
  ('kafra', 'KAFRA SIGNAL', 'KAFRA SIGNAL', 'signal.kafra.ai', 'kafrasignal/kafrasignal', 'kafrasignal', 'KAFRA SIGNAL', 'core'),
  ('sarjan', 'SARJAN SIGNAL', 'SARJAN SIGNAL', 'sarjansignal.ezos.my', 'sarjansignal/sarjansignal', 'sarjansignal', 'SARJAN SIGNAL', 'white_label'),
  ('richjoker', 'RICH JOKER', 'RICH JOKER INDI', 'richjoker.ezos.my', 'richjokerindi/richjokerindi', 'richjoker', 'RICH JOKER INDI', 'white_label'),
  ('shinobi', 'SHINOBI', 'SHINOBI INDI', 'shinobi.ezos.my', 'shinobiindi/shinobiindi', 'shinobi', 'SHINOBI INDI', 'white_label')
on conflict (id) do update set
  display_name = excluded.display_name,
  canonical_name = excluded.canonical_name,
  domain = excluded.domain,
  github_repo = excluded.github_repo,
  vercel_project = excluded.vercel_project,
  local_folder = excluded.local_folder,
  role = excluded.role,
  updated_at = now();

-- Public brand websites should not use broad anon RLS on this shared database.
-- Build server routes/RPCs for:
-- 1. access key authorization
-- 2. public signal feed
-- 3. performance log feed
-- 4. security alert insert
-- 5. package link redemption

-- Prevent noisy duplicate performance inserts (same payload within 60s window).
create index if not exists idx_performance_logs_brand_created_at
  on public.performance_logs (brand_id, created_at desc);

create or replace function hq_migration.prevent_duplicate_performance_logs()
returns trigger
language plpgsql
as $$
declare
  is_duplicate boolean;
begin
  if new.created_at is null then
    new.created_at := now();
  end if;

  if new.mode is null then
    new.mode := 'scalping';
  end if;

  select exists (
    select 1
    from public.performance_logs p
    where p.brand_id = new.brand_id
      and coalesce(p.pair, 'XAUUSD') = coalesce(new.pair, 'XAUUSD')
      and coalesce(p.mode, 'scalping') = coalesce(new.mode, 'scalping')
      and coalesce(p.action, 'buy') = coalesce(new.action, 'buy')
      and coalesce(p.outcome, 'be') = coalesce(new.outcome, 'be')
      and coalesce(round(p.net_pips::numeric, 4), round(p.points::numeric, 4), 0)
        = coalesce(round(new.net_pips::numeric, 4), round(new.points::numeric, 4), 0)
      and coalesce(round(p.peak_pips::numeric, 4), round(p.points::numeric, 4), 0)
        = coalesce(round(new.peak_pips::numeric, 4), round(new.points::numeric, 4), 0)
      and abs(extract(epoch from (p.created_at - new.created_at))) < 60
  ) into is_duplicate;

  if is_duplicate then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_performance_logs
on public.performance_logs;

create trigger trg_prevent_duplicate_performance_logs
before insert on public.performance_logs
for each row
execute function hq_migration.prevent_duplicate_performance_logs();
