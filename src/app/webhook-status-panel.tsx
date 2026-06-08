"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, Repeat2, RotateCcw } from "lucide-react";

type StatusResponse = {
  ok: boolean;
  flags: {
    enabled: boolean;
    shadowMode: boolean;
    fanoutEnabled: boolean;
    dbFanoutEnabled: boolean;
    allowHttpFanoutWithDb: boolean;
    eagerDispatchEnabled: boolean;
    performanceEditorEnabled: boolean;
    source?: "database" | "env";
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
  failedBreakdown?: {
    signal: number;
    price_update: number;
    signal_closed: number;
    other: number;
  };
  recentIngress: Array<{
    id: string;
    provider: string;
    eventKey: string;
    signatureValid: boolean;
    status: string;
    payload?: Record<string, unknown>;
    errorMessage?: string | null;
    dbFanout?: {
      ok?: boolean;
      processed?: number;
      skipped?: number;
      duplicates?: number;
      failed?: number;
      totalBrands?: number;
      results?: Array<{
        brandId?: string;
        status?: string;
        reason?: string;
        event?: string;
      }>;
    } | null;
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

type OpsTelegramResponse = {
  ok: boolean;
  telegram?: {
    configured: boolean;
    enabled: boolean;
    hasToken: boolean;
    tokenMasked: string | null;
    chatId: string;
    updatedAt: string | null;
  };
  error?: string;
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
  return date.toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" });
}

// Terjemah gabungan flag → satu ayat keadaan sebenar enjin (apa yang BETUL-BETUL berlaku).
function describeWebhookState(flags?: {
  enabled?: boolean;
  shadowMode?: boolean;
  fanoutEnabled?: boolean;
  dbFanoutEnabled?: boolean;
  allowHttpFanoutWithDb?: boolean;
}): { tone: "ok" | "warn" | "danger"; title: string; detail: string } {
  if (!flags?.enabled) {
    return {
      tone: "danger",
      title: "⛔ HQ DIMATIKAN",
      detail: "Tiada signal diterima. SEMUA brand (termasuk LIZA) tidak menerima signal baru.",
    };
  }
  if (flags.shadowMode) {
    return {
      tone: "warn",
      title: "🌙 MOD SENYAP (Ujian)",
      detail: "HQ terima signal tapi TIDAK menghantar ke mana-mana. Tiada brand menerima apa-apa.",
    };
  }
  const dbActive = Boolean(flags.dbFanoutEnabled);
  // Padan dengan logik sebenar route: HTTP hanya jalan jika DB off, atau dibenarkan serentak.
  const httpActive = Boolean(flags.fanoutEnabled) && (!dbActive || Boolean(flags.allowHttpFanoutWithDb));

  if (dbActive && httpActive) {
    return {
      tone: "ok",
      title: "✅ HQ AKTIF — Kedua-dua cara",
      detail: "Signal masuk → ditulis ke DB DAN dihantar ke pautan brand serentak (mod hybrid).",
    };
  }
  if (dbActive) {
    return {
      tone: "ok",
      title: "✅ HQ AKTIF — Cara Baru (DB)",
      detail: "Signal masuk → ditulis terus ke pangkalan data setiap brand. Ini mod harian biasa.",
    };
  }
  if (httpActive) {
    return {
      tone: "ok",
      title: "✅ HQ AKTIF — Cara Lama (HTTP)",
      detail: "Signal masuk → dihantar ke pautan web setiap brand (sistem lama).",
    };
  }
  return {
    tone: "danger",
    title: "⚠️ HQ TERIMA, TAPI TAK HANTAR",
    detail: "Signal disimpan tapi TIADA cara penghantaran aktif — brand tidak menerima signal. Pilih preset.",
  };
}

// Preset mod webhook — satu klik tetapkan semua suis kepada gabungan selamat.
type WebhookPreset = {
  id: string;
  label: string;
  hint: string;
  recommended?: boolean;
  flags: Record<string, boolean>;
};

const WEBHOOK_PRESETS: WebhookPreset[] = [
  {
    id: "default",
    label: "✅ Tetapan Asal (Disyorkan)",
    hint: "Mod biasa harian: signal ditulis terus ke DB setiap brand. Paling selamat.",
    recommended: true,
    flags: {
      enabled: true,
      shadowMode: false,
      dbFanoutEnabled: true,
      allowHttpFanoutWithDb: false,
      fanoutEnabled: false,
      eagerDispatchEnabled: true,
    },
  },
  {
    id: "hybrid",
    label: "Preset 1 — Hybrid (DB + HTTP)",
    hint: "Hantar guna cara baru (DB) DAN cara lama (HTTP) serentak. Untuk peralihan sahaja.",
    flags: {
      enabled: true,
      shadowMode: false,
      dbFanoutEnabled: true,
      allowHttpFanoutWithDb: true,
      fanoutEnabled: true,
      eagerDispatchEnabled: true,
    },
  },
  {
    id: "legacy",
    label: "Preset 2 — Cara Lama (HTTP sahaja)",
    hint: "Hantar ke pautan web setiap brand sahaja. Untuk sistem lama.",
    flags: {
      enabled: true,
      shadowMode: false,
      dbFanoutEnabled: false,
      allowHttpFanoutWithDb: false,
      fanoutEnabled: true,
      eagerDispatchEnabled: true,
    },
  },
  {
    id: "test",
    label: "Preset 3 — Ujian (Mod Senyap)",
    hint: "HQ terima signal tapi TAK hantar ke mana-mana. Untuk uji tanpa kesan sebenar.",
    flags: {
      enabled: true,
      shadowMode: true,
      dbFanoutEnabled: false,
      allowHttpFanoutWithDb: false,
      fanoutEnabled: false,
      eagerDispatchEnabled: false,
    },
  },
];

export default function WebhookStatusPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [savingFlags, setSavingFlags] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [opsTgToken, setOpsTgToken] = useState("");
  const [opsTgChatId, setOpsTgChatId] = useState("");
  const [opsTgEnabled, setOpsTgEnabled] = useState(true);
  const [opsTgMasked, setOpsTgMasked] = useState<string | null>(null);
  const [opsTgUpdatedAt, setOpsTgUpdatedAt] = useState<string | null>(null);
  const [opsTgLoading, setOpsTgLoading] = useState(false);

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

  const loadOpsTelegram = useCallback(async () => {
    setOpsTgLoading(true);
    try {
      const response = await fetch("/api/hq/ops-alert-telegram", { cache: "no-store" });
      const json = (await response.json()) as OpsTelegramResponse;
      if (!response.ok || !json.ok || !json.telegram) return;
      setOpsTgEnabled(Boolean(json.telegram.enabled));
      setOpsTgChatId(json.telegram.chatId ?? "");
      setOpsTgMasked(json.telegram.tokenMasked ?? null);
      setOpsTgUpdatedAt(json.telegram.updatedAt ?? null);
    } finally {
      setOpsTgLoading(false);
    }
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(() => {
      void loadStatus();
      void loadOpsTelegram();
    }, 0);
    const timer = setInterval(() => {
      void loadStatus();
    }, 8000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [loadOpsTelegram, loadStatus]);

  const saveOpsTelegram = useCallback(
    async (action: "save" | "test") => {
      const key = adminKey.trim();
      if (!key) {
        setActionMessage("Isi admin key dulu untuk setup Telegram HQ.");
        return;
      }
      setOpsTgLoading(true);
      try {
        const response = await fetch("/api/hq/ops-alert-telegram", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-key": key,
          },
          body: JSON.stringify({
            action,
            botToken: opsTgToken,
            chatId: opsTgChatId,
            enabled: opsTgEnabled,
          }),
        });
        const json = (await response.json().catch(() => ({}))) as OpsTelegramResponse;
        if (!response.ok || !json.ok) {
          setActionMessage(json.error ?? "Failed saving HQ Telegram settings.");
          return;
        }
        if (json.telegram) {
          setOpsTgEnabled(Boolean(json.telegram.enabled));
          setOpsTgChatId(json.telegram.chatId ?? "");
          setOpsTgMasked(json.telegram.tokenMasked ?? null);
          setOpsTgUpdatedAt(json.telegram.updatedAt ?? null);
        }
        if (action === "test") {
          setActionMessage("Test Telegram berjaya dihantar.");
        } else {
          setOpsTgToken("");
          setActionMessage("HQ Telegram settings saved.");
        }
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : "Failed saving HQ Telegram settings.");
      } finally {
        setOpsTgLoading(false);
      }
    },
    [adminKey, opsTgChatId, opsTgEnabled, opsTgToken],
  );

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

  const ingressJobCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of data?.recentJobs ?? []) {
      if (!job.ingressId) continue;
      counts.set(job.ingressId, (counts.get(job.ingressId) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const getIngressPayloadMeta = useCallback((payload?: Record<string, unknown>) => {
    if (!payload || typeof payload !== "object") return null;
    const event = typeof payload.event === "string" ? payload.event : null;
    const mode = typeof payload.mode === "string" ? payload.mode : null;
    const brands = Array.isArray(payload.brands)
      ? payload.brands.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    return { event, mode, brands };
  }, []);

  const formatDbFanoutSummary = (row: NonNullable<StatusResponse["recentIngress"]>[number]) => {
    const fanout = row.dbFanout;
    if (!fanout) return null;
    const parts = [
      fanout.ok ? "ok" : "failed",
      `processed:${fanout.processed ?? 0}`,
      `skipped:${fanout.skipped ?? 0}`,
      `dup:${fanout.duplicates ?? 0}`,
      `failed:${fanout.failed ?? 0}`,
      `brands:${fanout.totalBrands ?? 0}`,
    ];
    return parts.join(" | ");
  };

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

  const saveFlag = useCallback(
    async (key: string, value: boolean) => {
      const token = adminKey.trim();
      if (!token) {
        setActionMessage("Isi admin key dulu untuk ubah webhook controls.");
        return;
      }
      // Amaran untuk suis bahaya yang menghentikan signal ke semua brand.
      if (typeof window !== "undefined") {
        if (key === "enabled" && value === false) {
          if (!window.confirm("Matikan 'Terima Signal'? Ini akan HENTIKAN semua signal ke SEMUA brand (termasuk LIZA). Teruskan?")) {
            return;
          }
        }
        if (key === "shadowMode" && value === true) {
          if (!window.confirm("Hidupkan 'Mod Senyap'? HQ akan terima signal tapi TIDAK menghantar ke mana-mana brand. Teruskan?")) {
            return;
          }
        }
      }
      setSavingFlags(true);
      try {
        const response = await fetch("/api/hq/webhook-flags", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-admin-key": token,
          },
          body: JSON.stringify({ [key]: value }),
        });
        const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!response.ok || !json.ok) {
          setActionMessage(json.error ?? "Failed updating webhook controls.");
          return;
        }
        setActionMessage("✓ Tersimpan automatik.");
        setLastSavedAt(new Date().toLocaleTimeString());
        await loadStatus();
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : "Failed updating webhook controls.");
      } finally {
        setSavingFlags(false);
      }
    },
    [adminKey, loadStatus],
  );

  const saveAllFlags = useCallback(async () => {
    const token = adminKey.trim();
    if (!token) {
      setActionMessage("Isi admin key dulu untuk simpan tetapan.");
      return;
    }
    const flags = data?.flags as Record<string, unknown> | undefined;
    if (!flags) return;
    setSavingFlags(true);
    try {
      const body = {
        enabled: Boolean(flags.enabled),
        shadowMode: Boolean(flags.shadowMode),
        dbFanoutEnabled: Boolean(flags.dbFanoutEnabled),
        fanoutEnabled: Boolean(flags.fanoutEnabled),
        allowHttpFanoutWithDb: Boolean(flags.allowHttpFanoutWithDb),
        eagerDispatchEnabled: Boolean(flags.eagerDispatchEnabled),
        performanceEditorEnabled: Boolean(flags.performanceEditorEnabled),
      };
      const response = await fetch("/api/hq/webhook-flags", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-key": token },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setActionMessage(json.error ?? "Gagal simpan tetapan.");
        return;
      }
      setActionMessage("✓ Semua tetapan webhook disimpan & disahkan.");
      setLastSavedAt(new Date().toLocaleTimeString());
      await loadStatus();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Gagal simpan tetapan.");
    } finally {
      setSavingFlags(false);
    }
  }, [adminKey, data, loadStatus]);

  const applyPreset = useCallback(
    async (preset: WebhookPreset) => {
      const token = adminKey.trim();
      if (!token) {
        setActionMessage("Isi admin key dulu untuk guna preset.");
        return;
      }
      setSavingFlags(true);
      try {
        const response = await fetch("/api/hq/webhook-flags", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-admin-key": token,
          },
          body: JSON.stringify(preset.flags),
        });
        const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!response.ok || !json.ok) {
          setActionMessage(json.error ?? "Gagal guna preset.");
          return;
        }
        setActionMessage(`Preset digunakan: ${preset.label}`);
        await loadStatus();
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : "Gagal guna preset.");
      } finally {
        setSavingFlags(false);
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
      {!adminKey.trim() && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          🔑 Masukkan <span className="font-black">HQ Admin Key</span> di medan bawah dulu — semua butang kawalan (Preset, Padam, Retry, suis) tidak akan berfungsi tanpa key.
        </p>
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

      <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-300">HQ Telegram Ops Alert</p>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">Bot Token</span>
            <input
              value={opsTgToken}
              onChange={(event) => setOpsTgToken(event.target.value)}
              type="password"
              placeholder={opsTgMasked ? `Current: ${opsTgMasked}` : "Paste Telegram Bot Token"}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 focus:border-sky-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">Chat ID(s)</span>
            <input
              value={opsTgChatId}
              onChange={(event) => setOpsTgChatId(event.target.value)}
              type="text"
              placeholder="Contoh: -10012345, -10067890"
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 focus:border-sky-400 focus:outline-none"
            />
          </label>
          <button type="button" className="text-button" disabled={opsTgLoading} onClick={() => void saveOpsTelegram("save")}>
            Save Telegram
          </button>
          <button type="button" className="text-button" disabled={opsTgLoading} onClick={() => void saveOpsTelegram("test")}>
            Send Test
          </button>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-slate-200">
          <input type="checkbox" checked={opsTgEnabled} onChange={(e) => setOpsTgEnabled(e.target.checked)} />
          Enable HQ Telegram Ops Alert
        </label>
        <p className="mt-1 text-[11px] font-semibold text-slate-300">
          Last update (MYT): {opsTgUpdatedAt ? new Date(opsTgUpdatedAt).toLocaleString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" }) : "-"} | {opsTgLoading ? "syncing..." : "ready"}
        </p>
      </div>

      {(() => {
        const state = describeWebhookState(data?.flags);
        const toneClass =
          state.tone === "ok"
            ? "border-teal-400 bg-teal-500/10 text-teal-100"
            : state.tone === "warn"
              ? "border-amber-400 bg-amber-500/10 text-amber-100"
              : "border-rose-500 bg-rose-500/10 text-rose-100";
        return (
          <div className={`mb-4 rounded-xl border-2 p-4 ${toneClass}`}>
            <p className="text-base font-black">{state.title}</p>
            <p className="mt-1 text-xs font-semibold opacity-90">{state.detail}</p>
          </div>
        );
      })()}

      <details className="mb-4">
        <summary className="cursor-pointer text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">
          Butiran teknikal (status flag)
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
        <FlagBadge label="Enabled" on={Boolean(data?.flags.enabled)} />
        <FlagBadge label="Shadow" on={Boolean(data?.flags.shadowMode)} />
        <FlagBadge label="Fanout" on={Boolean(data?.flags.fanoutEnabled)} />
        <FlagBadge label="DB Fanout" on={Boolean(data?.flags.dbFanoutEnabled)} />
        <FlagBadge label="HTTP+DB" on={Boolean(data?.flags.allowHttpFanoutWithDb)} />
        <FlagBadge label="Eager" on={Boolean(data?.flags.eagerDispatchEnabled)} />
        <FlagBadge label="Perf Edit" on={Boolean(data?.flags.performanceEditorEnabled)} />
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
          <span className="status-dot" />
          Controls: {data?.flags.source ?? "env"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
          <span className="status-dot" />
          Backend: {data?.runtime?.backend ?? data?.backend ?? "memory"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
          <span className="status-dot" />
          DB Config: {data?.runtime?.dbConfigured ? "YES" : "NO"}
        </span>
        </div>
      </details>

      <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <p className="mb-1 text-xs font-black uppercase tracking-[0.08em] text-slate-300">Tetapan Pantas (Preset)</p>
        <p className="mb-2 text-[11px] font-semibold text-slate-400">
          Tak pasti nak set apa? Pilih satu preset di bawah — semua suis akan ditetapkan secara automatik.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {WEBHOOK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={savingFlags}
              onClick={() => void applyPreset(preset)}
              className={`rounded-lg border p-2 text-left transition disabled:opacity-50 ${
                preset.recommended
                  ? "border-teal-400 bg-teal-500/10 hover:bg-teal-500/20"
                  : "border-slate-600 bg-slate-900/40 hover:bg-slate-800/60"
              }`}
            >
              <span className="block text-xs font-black text-slate-100">{preset.label}</span>
              <span className="mt-1 block text-[11px] font-semibold text-slate-400">{preset.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <p className="mb-1 text-xs font-black uppercase tracking-[0.08em] text-slate-300">Tetapan Manual (Lanjutan)</p>
        <p className="mb-2 text-[11px] font-semibold text-slate-400">
          Untuk admin berpengalaman. Biasanya tak perlu sentuh kalau dah guna preset di atas.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {[
            { key: "enabled", label: "Terima Signal (Suis Utama)", desc: "Hidupkan supaya HQ boleh terima signal. Kalau OFF, SEMUA brand berhenti terima.", rec: "on" },
            { key: "shadowMode", label: "Mod Senyap (Ujian sahaja)", desc: "HQ terima signal tapi TAK hantar ke brand. Untuk uji tanpa kesan sebenar.", rec: "off" },
            { key: "dbFanoutEnabled", label: "Hantar ke Brand — Cara DB (UTAMA)", desc: "Tulis signal terus ke pangkalan data tiap brand. Ini cara utama harian.", rec: "on" },
            { key: "fanoutEnabled", label: "Hantar ke Brand — Cara HTTP (LAMA)", desc: "Hantar ke webhook tiap brand. Cara lama — jarang guna sekarang.", rec: "off" },
            { key: "allowHttpFanoutWithDb", label: "Guna DB + HTTP Serentak", desc: "Hantar guna DUA cara sekaligus. ⚠️ Boleh buat signal BERGANDA.", rec: "off" },
            { key: "eagerDispatchEnabled", label: "Hantar Serta-merta", desc: "Hantar terus sebaik signal masuk, tanpa beratur. Lebih laju.", rec: "on" },
            { key: "performanceEditorEnabled", label: "Benarkan Edit Performance", desc: "Boleh edit rekod performance terus dari dashboard.", rec: "any" },
          ].map((row) => {
            const current = Boolean((data?.flags as Record<string, unknown> | undefined)?.[row.key]);
            const mismatch = (row.rec === "on" && !current) || (row.rec === "off" && current);
            return (
              <label key={row.key} className={`rounded-lg border p-2 ${mismatch ? "border-amber-400/60 bg-amber-500/10" : "border-slate-700 bg-slate-900/40"}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={current}
                    disabled={savingFlags}
                    onChange={(event) => void saveFlag(row.key, event.target.checked)}
                  />
                  <span className="text-sm font-black text-slate-100">{row.label}</span>
                  {row.rec === "on" && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-300">Biasa: ON</span>}
                  {row.rec === "off" && <span className="rounded-full bg-slate-600/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-200">Biasa: OFF</span>}
                  {mismatch && <span className="text-[9px] font-black uppercase tracking-wide text-amber-300">⚠ tak ikut biasa</span>}
                </span>
                <span className="mt-1 block text-[11px] font-semibold text-slate-300">{row.desc}</span>
              </label>
            );
          })}
        </div>
        {Boolean((data?.flags as Record<string, unknown> | undefined)?.dbFanoutEnabled) &&
          Boolean((data?.flags as Record<string, unknown> | undefined)?.fanoutEnabled) && (
            <p className="mt-2 rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-200">
              ⚠️ DB dan HTTP dua-dua ON — signal mungkin BERGANDA. Matikan salah satu (biasanya HTTP = OFF).
            </p>
          )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveAllFlags()}
            disabled={savingFlags}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-black text-slate-900 transition hover:bg-teal-400 disabled:opacity-50"
          >
            {savingFlags ? "Menyimpan…" : "💾 Simpan & Sahkan Tetapan"}
          </button>
          <span className="text-[11px] font-semibold text-emerald-300">
            ✓ Tetapan disimpan AUTOMATIK setiap kali toggle{lastSavedAt ? ` · terakhir: ${lastSavedAt}` : ""}.
          </span>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-slate-300">
          💡 Untuk kegunaan harian biasa, cukup tekan butang <span className="font-black text-teal-300">Tetapan Asal (Disyorkan)</span> di atas — ia set semua suis betul automatik.
        </p>
      </div>

      <div className="mb-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {[
          { label: "Ingress", note: "Signal masuk", value: counts.ingress, danger: false },
          { label: "Queued", note: "Beratur", value: counts.queued, danger: false },
          { label: "Sending", note: "Sedang hantar", value: counts.sending, danger: false },
          { label: "Sent", note: "Berjaya", value: counts.sent, danger: false },
          { label: "Failed", note: "Gagal", value: counts.failed, danger: counts.failed > 0 },
          { label: "Skipped", note: "Dilangkau", value: counts.skipped, danger: false },
          { label: "Dead", note: "Gagal teruk", value: counts.deadLetter ?? 0, danger: (counts.deadLetter ?? 0) > 0 },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`rounded-lg border p-3 ${stat.danger ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"}`}
          >
            <p className={`text-[11px] font-black uppercase tracking-[0.08em] ${stat.danger ? "text-rose-600" : "text-slate-500"}`}>
              {stat.label}
            </p>
            <p className={`mono mt-1 text-xl font-black ${stat.danger ? "text-rose-700" : "text-slate-900"}`}>{stat.value}</p>
            <p className={`text-[10px] font-bold ${stat.danger ? "text-rose-500" : "text-slate-400"}`}>{stat.note}</p>
          </div>
        ))}
      </div>

      {(counts.failed > 0 || (counts.deadLetter ?? 0) > 0) ? (
        (() => {
          const totalBad = counts.failed + (counts.deadLetter ?? 0);
          const bd = data?.failedBreakdown;
          const parts: string[] = [];
          if (bd) {
            if (bd.signal > 0) parts.push(`${bd.signal} signal masuk`);
            if (bd.price_update > 0) parts.push(`${bd.price_update} kemaskini harga (heartbeat)`);
            if (bd.signal_closed > 0) parts.push(`${bd.signal_closed} tutup signal`);
            if (bd.other > 0) parts.push(`${bd.other} lain-lain`);
          }
          const hasRealSignal = (bd?.signal ?? 0) > 0 || (bd?.signal_closed ?? 0) > 0;
          return (
            <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-rose-700">
                  ⚠️ {totalBad} rekod penghantaran HTTP gagal (sampah lama — brand tetap terima melalui DB).
                </p>
                <button
                  type="button"
                  className="text-button border-rose-400 text-rose-700"
                  disabled={actionLoading || !adminKey.trim()}
                  title={!adminKey.trim() ? "Masukkan HQ Admin Key dulu" : undefined}
                  onClick={() => {
                    if (typeof window !== "undefined" &&
                      !window.confirm(`Padam ${totalBad} rekod gagal/dead ini? Ia TIDAK menghantar apa-apa semula — cuma kemaskan dashboard. Teruskan?`)) {
                      return;
                    }
                    void runOperation("/api/hq/dispatch/clear-failed", "Rekod gagal/dead telah dipadam.");
                  }}
                >
                  <RotateCcw className={`h-4 w-4 ${actionLoading ? "animate-spin" : ""}`} />
                  Padam Rekod Lama
                </button>
              </div>
              {parts.length > 0 ? (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">
                  Jenis: {parts.join(" · ")}.
                  {hasRealSignal
                    ? " ⚠️ Ada signal sebenar gagal — semak jika brand betul-betul terima via DB."
                    : " Semua jenis heartbeat/harga — boleh diabaikan dengan selamat."}
                </p>
              ) : null}
            </div>
          );
        })()
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">Recent Ingress</p>
          <div className="space-y-2">
            {(data?.recentIngress ?? []).slice(0, 5).map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                <p className="mono truncate text-xs font-black text-slate-900">{row.eventKey}</p>
                <p className="text-[11px] font-bold text-slate-500">
                  {row.provider} | {row.status} | {timeShort(row.receivedAt)}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  ingress: <span className="mono">{row.id.slice(0, 12)}...</span> | jobs: {ingressJobCounts.get(row.id) ?? 0}
                </p>
                {getIngressPayloadMeta(row.payload) ? (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    meta:{" "}
                    <span className="mono">
                      {getIngressPayloadMeta(row.payload)?.event ?? "-"} | {getIngressPayloadMeta(row.payload)?.mode ?? "-"} | targets:
                      {getIngressPayloadMeta(row.payload)?.brands.length ?? 0}
                    </span>
                  </p>
                ) : null}
                {row.dbFanout ? (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    db fanout: <span className="mono">{formatDbFanoutSummary(row)}</span>
                  </p>
                ) : null}
                {row.errorMessage ? <p className="mt-1 text-[11px] font-bold text-rose-600">{row.errorMessage}</p> : null}
              </div>
            ))}
            {(data?.recentIngress ?? []).length === 0 && <p className="text-xs font-semibold text-slate-500">No ingress events yet.</p>}
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
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
