import Link from "next/link";
import { AlertTriangle, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import HqShell from "@/app/hq-shell";
import { CheckBadge, StatusBadge, MetricCard } from "@/app/hq-ui";
import { brands, parityBoard } from "@/lib/registry";
import { loadSecurityPageData } from "@/lib/hqOpsData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
}

function brandHref(brandId: string | null) {
  if (!brandId) return "/security";
  return `/security?brand=${brandId}`;
}

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const data = await loadSecurityPageData({ brandId: brand, limit: 120 });

  return (
    <HqShell>
      <section className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Security</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Security alerts live + core parity checklist untuk semua brand.
          </p>
        </div>
        <Link href={brandHref(data.ok ? data.brandId : null)} className="text-button">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Link>
      </section>

      <section className="mb-4 flex flex-wrap gap-2">
        <Link href="/security" className={`text-button ${data.ok && data.brandId === null ? "primary-button" : ""}`}>
          All brands
        </Link>
        {brands.map((brandItem) => (
          <Link
            key={brandItem.id}
            href={`/security?brand=${brandItem.id}`}
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
            <MetricCard label="Total Alerts" value={String(data.stats.totalAlerts)} icon={ShieldAlert} />
            <MetricCard label="24H Alerts" value={String(data.stats.alerts24h)} icon={AlertTriangle} />
            <MetricCard label="7D Alerts" value={String(data.stats.alerts7d)} icon={AlertTriangle} />
            <MetricCard label="Parity Checks" value={String(brands.length * 3)} icon={ShieldCheck} />
          </section>

          <section className="mb-6 panel p-4">
            <div className="mb-4">
              <h2 className="text-lg font-black text-slate-950">Recent Security Alerts</h2>
              <p className="text-xs font-bold text-slate-500">
                Showing latest {data.rows.length} rows.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Reason</th>
                    <th>Key</th>
                    <th>Fingerprint</th>
                    <th>IP</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono text-xs">{row.brandId}</td>
                      <td>{row.reason}</td>
                      <td className="mono text-xs">{row.keyPreview}</td>
                      <td className="mono text-xs">{row.fingerprintId ?? "-"}</td>
                      <td className="mono text-xs">{row.ipAddress ?? "-"}</td>
                      <td>{dateText(row.createdAt)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-xs font-bold text-slate-500">
                        No security alerts recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Core Parity Board</h2>
                <p className="text-xs font-bold text-slate-500">
                  Track access UI, package links, and admin flow parity by brand.
                </p>
              </div>
              <ShieldAlert className="h-4 w-4 text-slate-500" />
            </div>
            <div className="space-y-3">
              {brands.map((brandItem) => (
                <div
                  key={`parity-${brandItem.id}`}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-slate-950">{brandItem.displayName}</p>
                    <StatusBadge status={brandItem.status} />
                  </div>
                  <div className="space-y-2">
                    {parityBoard[brandItem.id].map((check) => (
                      <div
                        key={`${brandItem.id}-${check.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
                      >
                        <div>
                          <p className="text-xs font-black text-slate-900">{check.label}</p>
                          <p className="text-xs font-semibold text-slate-500">{check.note}</p>
                        </div>
                        <CheckBadge status={check.status} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </HqShell>
  );
}
