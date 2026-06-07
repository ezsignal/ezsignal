import Link from "next/link";
import { RadioTower, RefreshCw, Signal, TrendingUp } from "lucide-react";
import HqShell from "@/app/hq-shell";
import { MetricCard } from "@/app/hq-ui";
import { brands } from "@/lib/registry";
import { loadSignalsPageData } from "@/lib/hqOpsData";
import SignalsTable from "./signals-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

          <SignalsTable rows={data.rows} />
        </>
      )}
    </HqShell>
  );
}
