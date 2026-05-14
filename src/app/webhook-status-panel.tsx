"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

type StatusResponse = {
  ok: boolean;
  flags: {
    enabled: boolean;
    shadowMode: boolean;
    fanoutEnabled: boolean;
    performanceEditorEnabled: boolean;
  };
  backend?: "database" | "memory";
  runtime?: {
    backend: "database" | "memory";
    dbConfigured: boolean;
  };
  counts: {
    ingress: number;
    queued: number;
    sending: number;
    sent: number;
    failed: number;
    skipped: number;
    deadLetter?: number;
  };
  recentIngress: Array<{
    id: string;
    provider: string;
    eventKey: string;
    signatureValid: boolean;
    status: string;
    receivedAt: string;
  }>;
  recentJobs: Array<{
    id: string;
    brandId: string;
    status: string;
    attempts: number;
    updatedAt: string;
    lastError: string | null;
  }>;
  now: string;
};

function FlagBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${
        on ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-200 bg-slate-100 text-slate-600"
      }`}
    >
      <span className="status-dot" />
      {label}: {on ? "ON" : "OFF"}
    </span>
  );
}

function timeShort(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

export default function WebhookStatusPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/hq/dispatch/status", { cache: "no-store" });
      const json = (await response.json()) as StatusResponse;
      if (!response.ok || !json.ok) {
        setError("Failed loading webhook status.");
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed loading webhook status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(() => {
      void loadStatus();
    }, 0);
    const timer = setInterval(() => {
      void loadStatus();
    }, 8000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [loadStatus]);

  const counts = useMemo(
    () =>
      data?.counts ?? {
        ingress: 0,
        queued: 0,
        sending: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        deadLetter: 0,
      },
    [data],
  );

  return (
    <section id="webhook" className="mb-6 panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">HQ Webhook Runtime</h2>
          <p className="text-xs font-bold text-slate-500">Live ingress and dispatch status (shadow-safe).</p>
        </div>
        <button onClick={() => void loadStatus()} type="button" className="text-button" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FlagBadge label="Enabled" on={Boolean(data?.flags.enabled)} />
        <FlagBadge label="Shadow" on={Boolean(data?.flags.shadowMode)} />
        <FlagBadge label="Fanout" on={Boolean(data?.flags.fanoutEnabled)} />
        <FlagBadge label="Perf Edit" on={Boolean(data?.flags.performanceEditorEnabled)} />
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
          <span className="status-dot" />
          Backend: {data?.runtime?.backend ?? data?.backend ?? "memory"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
          <span className="status-dot" />
          DB Config: {data?.runtime?.dbConfigured ? "YES" : "NO"}
        </span>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {[
          ["Ingress", counts.ingress],
          ["Queued", counts.queued],
          ["Sending", counts.sending],
          ["Sent", counts.sent],
          ["Failed", counts.failed],
          ["Skipped", counts.skipped],
          ["Dead", counts.deadLetter ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{String(label)}</p>
            <p className="mono mt-1 text-xl font-black text-slate-900">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Recent Ingress</p>
          <div className="space-y-2">
            {(data?.recentIngress ?? []).slice(0, 5).map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                <p className="mono truncate text-xs font-black text-slate-900">{row.eventKey}</p>
                <p className="text-[11px] font-bold text-slate-500">
                  {row.provider} | {row.status} | {timeShort(row.receivedAt)}
                </p>
              </div>
            ))}
            {(data?.recentIngress ?? []).length === 0 && <p className="text-xs font-semibold text-slate-500">No ingress events yet.</p>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Recent Jobs</p>
          <div className="space-y-2">
            {(data?.recentJobs ?? []).slice(0, 5).map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                <p className="text-xs font-black text-slate-900">
                  {row.brandId.toUpperCase()} | {row.status}
                </p>
                <p className="text-[11px] font-bold text-slate-500">
                  attempts: {row.attempts} | {timeShort(row.updatedAt)}
                </p>
              </div>
            ))}
            {(data?.recentJobs ?? []).length === 0 && <p className="text-xs font-semibold text-slate-500">No dispatch jobs yet.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
