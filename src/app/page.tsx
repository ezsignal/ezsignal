import Link from "next/link";
import { ArrowRight, CircleDashed, CircleAlert, KeyRound, RadioTower, RefreshCw, Settings2, UsersRound } from "lucide-react";
import HqShell from "@/app/hq-shell";
import TallyAuditPanel from "@/app/tally-audit-panel";
import { MetricCard } from "@/app/hq-ui";
import { migrationProgress, nextTasks, totals } from "@/lib/registry";
import { getHqOverviewSnapshot } from "@/lib/hqOverview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fallbackTotals = totals();
const phasePercent = migrationProgress();

export default async function Home() {
  const liveSnapshot = await getHqOverviewSnapshot();
  const total = liveSnapshot?.totals ?? fallbackTotals;

  return (
    <HqShell>
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-teal-700">
            EZ SIGNAL operations
          </p>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            HQ Overview
          </h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            Ringkasan live untuk users, keys, signal, dan progress migrasi shared database.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="icon-button" title="Refresh registry" type="button">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button className="text-button primary-button" type="button">
            <Settings2 className="h-4 w-4" />
            Configure
          </button>
        </div>
      </section>

      <section className="metric-grid mb-6">
        <MetricCard label="Active Users" value={String(total.activeUsers)} icon={UsersRound} />
        <MetricCard label="Expired Users" value={String(total.expiredUsers)} icon={CircleAlert} />
        <MetricCard label="Keys Issued" value={String(total.keysIssued)} icon={KeyRound} />
        <MetricCard label="Signals Today" value={String(total.signalsToday)} icon={RadioTower} />
      </section>

      <TallyAuditPanel />

      <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-slate-950">Execution Queue</h2>
              <p className="text-xs font-bold text-slate-500">
                Shared Supabase readiness tasks from HQ plan.
              </p>
            </div>
            <Link href="/supabase" className="text-button">
              SQL Plan
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-2">
            {nextTasks.map((task) => (
              <div
                key={task}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
              >
                <CircleDashed className="mt-0.5 h-4 w-4 text-slate-400" />
                <p className="text-sm font-bold text-slate-700">{task}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="text-lg font-black text-slate-950">Migration Progress</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Shared Supabase rollout completion
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-500"
              style={{ width: `${phasePercent}%` }}
            />
          </div>
          <p className="mono mt-3 text-2xl font-black text-slate-950">
            {phasePercent}%
          </p>
          <p className="text-xs font-bold text-slate-500">
            Based on completed migration phases.
          </p>
        </div>
      </section>
    </HqShell>
  );
}
