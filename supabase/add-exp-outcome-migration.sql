-- ============================================================================
-- Add 'exp' (expired) to performance_logs.outcome allowed values
-- Signal Model v2: a 30-min scalping signal that ends without hitting TP1 or SL
-- and without running >= 20 pips peak is recorded as 'exp' (expired, 0 pips, neutral).
--
-- Run this ONCE in the shared Supabase SQL editor BEFORE deploying the v2 webhook.
-- Idempotent: safe to re-run.
-- ============================================================================

do $$
declare
  c_name text;
begin
  -- drop any existing CHECK constraint on outcome (name may vary)
  for c_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'performance_logs'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%outcome%'
  loop
    execute format('alter table public.performance_logs drop constraint %I', c_name);
  end loop;

  -- re-add with 'exp' included
  alter table public.performance_logs
    add constraint performance_logs_outcome_check
    check (outcome in ('tp1', 'tp2', 'tp3', 'sl', 'be', 'exp'));
end $$;

-- verify
-- select pg_get_constraintdef(con.oid)
-- from pg_constraint con join pg_class rel on rel.oid = con.conrelid
-- where rel.relname = 'performance_logs' and con.conname = 'performance_logs_outcome_check';
