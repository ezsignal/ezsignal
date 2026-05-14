import Link from "next/link";
import { ArrowRight, Activity, Database, GitBranch } from "lucide-react";
import HqShell from "@/app/hq-shell";
import { StatusBadge } from "@/app/hq-ui";
import { brands, systemLanes, totals } from "@/lib/registry";
import { getHqOverviewSnapshot } from "@/lib/hqOverview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fallbackTotals = totals();

export default async function BrandsPage() {
  const liveSnapshot = await getHqOverviewSnapshot();
  const total = liveSnapshot?.totals ?? fallbackTotals;
  const lanes = systemLanes.map((lane) =>
    lane.label === "Users" ? { ...lane, value: `${total.activeUsers} active` } : lane,
  );

  return (
    <HqShell>
      <section className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Brands</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Core dan white-label registry dengan metrik live setiap brand.
        </p>
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Brand Registry</h2>
              <p className="text-xs font-bold text-slate-500">
                Core and white label operating map.
              </p>
            </div>
            <Link href="/supabase" className="text-button">
              Schema Map
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="brand-grid">
            {brands.map((brand) => {
              const liveBrand = liveSnapshot?.brands[brand.id];
              const activeUsers = liveBrand?.activeUsers ?? brand.activeUsers;
              const keysIssued = liveBrand?.keysIssued ?? brand.keysIssued;
              const signalsToday = liveBrand?.signalsToday ?? brand.signalsToday;
              return (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.id}`}
                  className="soft-panel block p-4 transition hover:border-slate-400 hover:bg-white"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-10 w-10 place-items-center rounded-lg text-sm font-black text-slate-950"
                        style={{
                          backgroundColor: `${brand.accent}33`,
                          border: `1px solid ${brand.accent}`,
                        }}
                      >
                        {brand.displayName.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-950">
                          {brand.displayName}
                        </p>
                        <p className="text-xs font-bold text-slate-500">{brand.role}</p>
                      </div>
                    </div>
                    <StatusBadge status={brand.status} />
                  </div>
                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${brand.parity}%`,
                        backgroundColor: brand.accent,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>Core parity</span>
                    <span className="mono text-slate-950">{brand.parity}%</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="mono text-lg font-black text-slate-950">{activeUsers}</p>
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                        Active
                      </p>
                    </div>
                    <div>
                      <p className="mono text-lg font-black text-slate-950">{keysIssued}</p>
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                        Keys
                      </p>
                    </div>
                    <div>
                      <p className="mono text-lg font-black text-slate-950">{signalsToday}</p>
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                        Signals
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="text-lg font-black text-slate-950">System Lanes</h2>
          <div className="mt-4 space-y-2">
            {lanes.map((lane) => (
              <div
                key={lane.label}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="icon-button" aria-hidden="true">
                    <lane.icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-black text-slate-950">{lane.label}</p>
                </div>
                <p className="text-xs font-extrabold text-slate-500">{lane.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-black text-slate-500">
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center">
              <GitBranch className="mx-auto mb-1 h-3.5 w-3.5" />
              Git
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center">
              <Activity className="mx-auto mb-1 h-3.5 w-3.5" />
              Ops
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center">
              <Database className="mx-auto mb-1 h-3.5 w-3.5" />
              DB
            </span>
          </div>
        </div>
      </section>
    </HqShell>
  );
}
