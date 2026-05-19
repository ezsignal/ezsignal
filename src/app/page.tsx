import Link from "next/link";
import { AlertTriangle, ArrowRight, Box, Building2, CircleDashed, CircleAlert, KeyRound, RadioTower, RefreshCw, Settings2, TimerReset, UsersRound } from "lucide-react";
import HqShell from "@/app/hq-shell";
import TallyAuditPanel from "@/app/tally-audit-panel";
import { MetricCard } from "@/app/hq-ui";
import TradingDaySettingsCard from "@/app/trading-day-settings-card";
import { migrationProgress, nextTasks, totals } from "@/lib/registry";
import { getHqOverviewSnapshot } from "@/lib/hqOverview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fallbackTotals = totals();
const phasePercent = migrationProgress();

export default async function Home() {
  const liveSnapshot = await getHqOverviewSnapshot({ dispatchOpsAlerts: true });
  const total = liveSnapshot?.totals ?? fallbackTotals;
  const overview = liveSnapshot?.overview ?? {
    newUsersToday: 0,
    signalsTodayHqMaster: 0,
    activePackageTypes: 0,
    expiringToday: 0,
    activeBrandsToday: 0,
  };
  const topAgents = liveSnapshot?.topAgents ?? [];
  const packageMix = liveSnapshot?.packageMix ?? [];
  const opsAlerts = liveSnapshot?.opsAlerts ?? [];

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
          <Link href="/" className="icon-button" title="Refresh registry">
            <RefreshCw className="h-4 w-4" />
          </Link>
          <Link href="/webhook" className="text-button primary-button">
            <Settings2 className="h-4 w-4" />
            Configure
          </Link>
        </div>
      </section>

      <section className="metric-grid mb-6">
        <MetricCard label="Active Users" value={String(total.activeUsers)} icon={UsersRound} />
        <MetricCard label="Expired Users" value={String(total.expiredUsers)} icon={CircleAlert} />
        <MetricCard label="Keys Issued" value={String(total.keysIssued)} icon={KeyRound} />
        <MetricCard label="SIGNALS TODAY" value={String(overview.signalsTodayHqMaster)} icon={RadioTower} />
      </section>

      <section className="metric-grid mb-6">
        <MetricCard label="New Users Today" value={String(overview.newUsersToday)} icon={UsersRound} />
        <MetricCard label="Package Active" value={String(overview.activePackageTypes)} icon={Box} />
        <MetricCard label="Expiring Today" value={String(overview.expiringToday)} icon={TimerReset} />
        <MetricCard label="Active Brands" value={`${overview.activeBrandsToday}/4`} icon={Building2} />
      </section>

      <section className="mb-6 panel p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-black text-slate-950">Ops Alerts</h2>
            <p className="text-xs font-bold text-slate-500">
              Auto monitor for missing active signal, live price kosong, atau feed stale. Telegram alert guna cooldown.
            </p>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${
            opsAlerts.length > 0
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {opsAlerts.length > 0 ? `${opsAlerts.length} issue` : "All clear"}
          </span>
        </div>

        {opsAlerts.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            Tiada issue kritikal sekarang.
          </div>
        ) : (
          <div className="space-y-2">
            {opsAlerts.slice(0, 12).map((alert) => (
              <div key={alert.key} className={`rounded-lg border px-3 py-2 ${
                alert.severity === "critical"
                  ? "border-rose-200 bg-rose-50"
                  : "border-amber-200 bg-amber-50"
              }`}>
                <p className={`text-xs font-black uppercase tracking-[0.08em] ${
                  alert.severity === "critical" ? "text-rose-700" : "text-amber-700"
                }`}>
                  {alert.severity} · {alert.brandId?.toUpperCase() ?? "ALL"} · {alert.mode?.toUpperCase() ?? "-"}
                </p>
                <p className="mt-1 text-sm font-black text-slate-900">{alert.title}</p>
                <p className="text-xs font-semibold text-slate-700">{alert.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Top 5 Agents</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {topAgents.length > 0 ? topAgents.map((row, index) => (
              <div key={row.name} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="mono text-xs font-black text-slate-500">#{index + 1}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{row.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-600">
                  Active {row.activeUsers} / Total {row.totalUsers}
                </p>
                <p className="mt-1 text-[11px] font-bold text-slate-500">
                  Brand: {row.brands.length ? row.brands.join(", ") : "-"}
                </p>
              </div>
            )) : (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-500">
                No agent data.
              </div>
            )}
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="text-lg font-black text-slate-950">Package Mix</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Active package distribution across all brands.
          </p>
          <div className="mt-4 table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Active Users</th>
                  <th>Total Users</th>
                </tr>
              </thead>
              <tbody>
                {packageMix.length > 0 ? packageMix.map((row) => (
                  <tr key={row.packageName}>
                    <td className="mono">{row.packageName}</td>
                    <td>{row.activeUsers}</td>
                    <td>{row.totalUsers}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="text-slate-500">No package data.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-[380px_1fr]">
        <TradingDaySettingsCard />
        <div className="panel p-4">
          <h2 className="text-lg font-black text-slate-950">Trading Day Logic</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            SIGNALS TODAY, New Users Today, and Expiring Today in HQ follow the boundary time set on the left.
          </p>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
            Use this when broker server time shifts between winter and summer. After updating the boundary, refresh the overview to see the latest totals.
          </p>
        </div>
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
