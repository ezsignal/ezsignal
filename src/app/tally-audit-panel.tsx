"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { brands, type BrandId } from "@/lib/registry";

type AuditBrandMetrics = {
  activeUsers: number;
  expiredUsers: number;
  keysIssued: number;
  signalsToday: number;
  performanceLogs: number;
};

type AuditResponse = {
  ok: boolean;
  generatedAt: string;
  runtime: {
    backend: "database" | "memory";
    dbConfigured: boolean;
  };
  brands: Record<BrandId, AuditBrandMetrics>;
  totals: AuditBrandMetrics;
  global: AuditBrandMetrics;
  coverage: Array<{
    table: "subscribers" | "access_keys" | "signals" | "performance_logs";
    totalRows: number;
    knownBrandRows: number;
    unknownBrandRows: number;
  }>;
  gaps: AuditBrandMetrics;
  healthy: boolean;
  issues: string[];
  error?: string;
};

function formatSync(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
}

function toneByGap(value: number) {
  return value === 0 ? "text-teal-700" : "text-rose-700";
}

export default function TallyAuditPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AuditResponse | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/hq/audit/tally", { cache: "no-store" });
      const json = (await response.json()) as AuditResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed loading tally audit.");
        setPayload(null);
        return;
      }
      setPayload(json);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Failed loading tally audit.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(() => {
      void loadAudit();
    }, 0);
    const timer = setInterval(() => {
      void loadAudit();
    }, 15000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [loadAudit]);

  const rows = useMemo(
    () =>
      brands.map((brand) => ({
        id: brand.id,
        label: brand.displayName,
        metrics: payload?.brands?.[brand.id] ?? null,
      })),
    [payload],
  );

  return (
    <section id="tally-audit" className="mb-6 panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Live Tally Audit</h2>
          <p className="text-xs font-bold text-slate-500">Verify per-brand counts against global shared-database totals.</p>
        </div>
        <button onClick={() => void loadAudit()} type="button" className="text-button" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>
      )}

      {!error && payload ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${
                payload.healthy
                  ? "border-teal-200 bg-teal-50 text-teal-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              <span className="status-dot" />
              {payload.healthy ? "Tally healthy" : "Tally mismatch"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
              <span className="status-dot" />
              Backend: {payload.runtime.backend}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
              <span className="status-dot" />
              DB Config: {payload.runtime.dbConfigured ? "YES" : "NO"}
            </span>
            <span className="text-[11px] font-bold text-slate-500">Synced: {formatSync(payload.generatedAt)}</span>
          </div>

          <div className="mb-4 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Active</th>
                  <th>Expired</th>
                  <th>Keys</th>
                  <th>Signals Today</th>
                  <th>Performance Logs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td>{row.metrics?.activeUsers ?? "-"}</td>
                    <td>{row.metrics?.expiredUsers ?? "-"}</td>
                    <td>{row.metrics?.keysIssued ?? "-"}</td>
                    <td>{row.metrics?.signalsToday ?? "-"}</td>
                    <td>{row.metrics?.performanceLogs ?? "-"}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-black text-slate-900">Brand Sum</td>
                  <td className="font-black text-slate-900">{payload.totals.activeUsers}</td>
                  <td className="font-black text-slate-900">{payload.totals.expiredUsers}</td>
                  <td className="font-black text-slate-900">{payload.totals.keysIssued}</td>
                  <td className="font-black text-slate-900">{payload.totals.signalsToday}</td>
                  <td className="font-black text-slate-900">{payload.totals.performanceLogs}</td>
                </tr>
                <tr>
                  <td className="font-black text-slate-900">Global Total</td>
                  <td>{payload.global.activeUsers}</td>
                  <td>{payload.global.expiredUsers}</td>
                  <td>{payload.global.keysIssued}</td>
                  <td>{payload.global.signalsToday}</td>
                  <td>{payload.global.performanceLogs}</td>
                </tr>
                <tr>
                  <td className="font-black text-slate-900">Gap</td>
                  <td className={toneByGap(payload.gaps.activeUsers)}>{payload.gaps.activeUsers}</td>
                  <td className={toneByGap(payload.gaps.expiredUsers)}>{payload.gaps.expiredUsers}</td>
                  <td className={toneByGap(payload.gaps.keysIssued)}>{payload.gaps.keysIssued}</td>
                  <td className={toneByGap(payload.gaps.signalsToday)}>{payload.gaps.signalsToday}</td>
                  <td className={toneByGap(payload.gaps.performanceLogs)}>{payload.gaps.performanceLogs}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Brand Coverage</p>
              <div className="space-y-2">
                {payload.coverage.map((row) => (
                  <div key={row.table} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                    <p className="mono text-xs font-black text-slate-900">{row.table}</p>
                    <p className="text-[11px] font-bold text-slate-500">
                      total: {row.totalRows} | known brand rows: {row.knownBrandRows} | unknown:{" "}
                      <span className={toneByGap(row.unknownBrandRows)}>{row.unknownBrandRows}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Issues</p>
              {payload.issues.length === 0 ? (
                <p className="text-xs font-bold text-teal-700">No mismatch detected.</p>
              ) : (
                <div className="space-y-2">
                  {payload.issues.map((issue) => (
                    <p key={issue} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-700">
                      {issue}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
