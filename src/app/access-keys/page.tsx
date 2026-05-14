import Link from "next/link";
import { KeyRound, RefreshCw, ShieldAlert, UserCheck } from "lucide-react";
import HqShell from "@/app/hq-shell";
import { MetricCard } from "@/app/hq-ui";
import { brands } from "@/lib/registry";
import { loadAccessKeysPageData } from "@/lib/hqOpsData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateText(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
}

function brandHref(brandId: string | null) {
  if (!brandId) return "/access-keys";
  return `/access-keys?brand=${brandId}`;
}

export default async function AccessKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const data = await loadAccessKeysPageData({
    brandId: brand,
    limit: 120,
  });

  return (
    <HqShell>
      <section className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Access Keys</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Monitor key issuance, active sessions, and expiry across all brands.
          </p>
        </div>
        <Link href={brandHref(data.ok ? data.brandId : null)} className="text-button">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Link>
      </section>

      <section className="mb-4 flex flex-wrap gap-2">
        <Link href="/access-keys" className={`text-button ${data.ok && data.brandId === null ? "primary-button" : ""}`}>
          All brands
        </Link>
        {brands.map((brandItem) => (
          <Link
            key={brandItem.id}
            href={`/access-keys?brand=${brandItem.id}`}
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
            <MetricCard label="Total Keys" value={String(data.stats.totalKeys)} icon={KeyRound} />
            <MetricCard label="Active Keys" value={String(data.stats.activeKeys)} icon={UserCheck} />
            <MetricCard label="Expired Keys" value={String(data.stats.expiredKeys)} icon={ShieldAlert} />
            <MetricCard label="Issued Today" value={String(data.stats.todayIssued)} icon={RefreshCw} />
          </section>

          <section className="panel p-4">
            <div className="mb-4">
              <h2 className="text-lg font-black text-slate-950">Recent Access Keys</h2>
              <p className="text-xs font-bold text-slate-500">
                Showing latest {data.rows.length} key records.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Label</th>
                    <th>Key</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Expired At</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono text-xs">{row.brandId}</td>
                      <td>{row.label ?? "-"}</td>
                      <td className="mono text-xs">{row.keyPreview}</td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-black ${
                            row.isActive
                              ? "bg-teal-50 text-teal-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {row.isActive ? "active" : "inactive"}
                        </span>
                      </td>
                      <td>{dateText(row.lastLoginAt)}</td>
                      <td>{dateText(row.expiredAt)}</td>
                      <td>{dateText(row.createdAt)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-xs font-bold text-slate-500">
                        No access key data yet.
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
