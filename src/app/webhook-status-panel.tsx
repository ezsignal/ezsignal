"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, Repeat2, RotateCcw } from "lucide-react";

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
    payload?: Record<string, unknown>;
    errorMessage?: string | null;
    receivedAt: string;
  }>;
  recentJobs: Array<{
    id: string;
    ingressId?: string;
    brandId: string;
    status: string;
    attempts: number;
    updatedAt: string;
    lastError: string | null;
    payload?: Record<string, unknown>;
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
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAdminKey(window.localStorage.getItem("HQ_ADMIN_KEY") ?? "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const trimmed = adminKey.trim();
    if (!trimmed) {
      window.localStorage.removeItem("HQ_ADMIN_KEY");
      return;
    }
    window.localStorage.setItem("HQ_ADMIN_KEY", trimmed);
  }, [adminKey]);

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

  const failedJobs = useMemo(
    () => (data?.recentJobs ?? []).filter((row) => row.status === "failed" || row.status === "dead_letter"),
    [data],
  );

  const runOperation = useCallback(
    async (path: string, successMessage: string) => {
      const key = adminKey.trim();
      if (!key) {
        setActionMessage("Isi admin key dulu untuk operasi dispatch.");
        return;
      }
      setActionLoading(true);
      setActionMessage(null);
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": key,
          },
        });
        const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!response.ok || !json.ok) {
          setActionMessage(json.error ?? "Operation failed.");
          return;
        }
        setActionMessage(successMessage);
        await loadStatus();
      } catch (err) {
        setActionMessage(err instanceof Error ? err.message : "Operation failed.");
      } finally {
        setActionLoading(false);
      }
    },
    [adminKey, loadStatus],
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
      {actionMessage && (
        <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">{actionMessage}</p>
      )}

      <div className="mb-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">HQ Admin Key</span>
          <input
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            type="password"
            placeholder="Enter admin key"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
          />
        </label>
        <button
          type="button"
          className="text-button"
          disabled={actionLoading}
          onClick={() => void runOperation("/api/hq/dispatch/run", "Queue dispatch executed.")}
        >
          <Play className={`h-4 w-4 ${actionLoading ? "animate-spin" : ""}`} />
          Run Dispatch
        </button>
        <button
          type="button"
          className="text-button"
          disabled={actionLoading}
          onClick={() => void runOperation("/api/hq/dispatch/retry-failed", "Failed jobs moved to queue and retried.")}
        >
          <RotateCcw className={`h-4 w-4 ${actionLoading ? "animate-spin" : ""}`} />
          Retry Failed
        </button>
        <button
          type="button"
          className="text-button"
          disabled={actionLoading}
          onClick={() => void runOperation("/api/hq/dispatch/replay-latest-signal", "Latest signal replayed to all target brands.")}
        >
          <Repeat2 className={`h-4 w-4 ${actionLoading ? "animate-spin" : ""}`} />
          Replay Latest Signal
        </button>
      </div>

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
                {row.errorMessage ? <p className="mt-1 text-[11px] font-bold text-rose-600">{row.errorMessage}</p> : null}
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
                {row.lastError ? <p className="mt-1 text-[11px] font-bold text-rose-600">{row.lastError}</p> : null}
              </div>
            ))}
            {(data?.recentJobs ?? []).length === 0 && <p className="text-xs font-semibold text-slate-500">No dispatch jobs yet.</p>}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Failed Jobs Snapshot</p>
        {failedJobs.length === 0 ? (
          <p className="text-xs font-semibold text-emerald-700">No failed/dead-letter jobs in recent window.</p>
        ) : (
          <div className="space-y-2">
            {failedJobs.slice(0, 8).map((row) => (
              <div key={row.id} className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                <p className="text-xs font-black text-rose-900">{row.brandId.toUpperCase()} | {row.status}</p>
                <p className="text-[11px] font-bold text-rose-700">
                  attempts: {row.attempts} | updated: {timeShort(row.updatedAt)}
                </p>
                {row.lastError ? <p className="mt-1 text-[11px] font-semibold text-rose-700">{row.lastError}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
