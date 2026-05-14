import Link from "next/link";
import { RadioTower, RefreshCw, Signal, TrendingUp } from "lucide-react";
import HqShell from "@/app/hq-shell";
import { MetricCard } from "@/app/hq-ui";
import { brands } from "@/lib/registry";
import { loadSignalsPageData } from "@/lib/hqOpsData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
}

function brandHref(brandId: string | null) {
  if (!brandId) return "/signals";
  return `/signals?brand=${brandId}`;
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const data = await loadSignalsPageData({ brandId: brand, limit: 120 });
  const buyCount = data.ok ? data.rows.filter((row) => row.action === "buy").length : 0;
  const sellCount = data.ok ? data.rows.filter((row) => row.action === "sell").length : 0;

  return (
    <HqShell>
      <section className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Signals</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Live monitor signal feed semua brand dari shared database.
          </p>
        </div>
        <Link href={brandHref(data.ok ? data.brandId : null)} className="text-button">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Link>
      </section>

      <section className="mb-4 flex flex-wrap gap-2">
        <Link href="/signals" className={`text-button ${data.ok && data.brandId === null ? "primary-button" : ""}`}>
          All brands
        </Link>
        {brands.map((brandItem) => (
          <Link
            key={brandItem.id}
            href={`/signals?brand=${brandItem.id}`}
            className={`text-button ${data.ok && data.brandId === brandItem.id ? "primary-button" : ""}`}
          >
            {brandItem.displayName}
          </Link>
        ))}
      </section>

      {!data.ok ? (
        <p className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {data.error}
        </p>
      ) : (
        <>
          <section className="metric-grid mb-6">
            <MetricCard label="Total Signals" value={String(data.stats.totalSignals)} icon={Signal} />
            <MetricCard label="Signals Today" value={String(data.stats.signalsToday)} icon={RadioTower} />
            <MetricCard label="Buy" value={String(buyCount)} icon={TrendingUp} />
            <MetricCard label="Sell" value={String(sellCount)} icon={TrendingUp} />
          </section>

          <section className="panel p-4">
            <div className="mb-4">
              <h2 className="text-lg font-black text-slate-950">Recent Signals</h2>
              <p className="text-xs font-bold text-slate-500">
                Showing latest {data.rows.length} rows.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Pair</th>
                    <th>Action</th>
                    <th>Entry</th>
                    <th>SL</th>
                    <th>TP1</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono text-xs">{row.brandId}</td>
                      <td>{row.pair}</td>
                      <td className={row.action === "buy" ? "text-teal-700" : "text-rose-700"}>
                        {row.action.toUpperCase()}
                      </td>
                      <td>{row.entry}</td>
                      <td>{row.stopLoss ?? "-"}</td>
                      <td>{row.takeProfit1 ?? "-"}</td>
                      <td>{row.status}</td>
                      <td>{dateText(row.createdAt)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-xs font-bold text-slate-500">
                        No signal data yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </HqShell>
  );
}
