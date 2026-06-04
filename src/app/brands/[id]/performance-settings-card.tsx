"use client";

import { useEffect, useState } from "react";
import { Clock3, RefreshCw, Save, Timer } from "lucide-react";

type PerformanceApiResponse = {
  ok: boolean;
  error?: string;
  brandId?: string;
  performance?: {
    bePercentage: number;
    scalpingPeakPips: number;
    intradayPeakPips: number;
    source: "default" | "database";
    updatedAt?: string | null;
  };
  saved?: boolean;
};

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" });
}

export default function PerformanceSettingsCard({ brandId }: { brandId: string }) {
  const [bePercentage, setBePercentage] = useState("80");
  const [scalpingPeakPips, setScalpingPeakPips] = useState("10");
  const [intradayPeakPips, setIntradayPeakPips] = useState("50");
  const [source, setSource] = useState<"default" | "database">("default");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadConfig() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hq/brands/${brandId}/performance-settings`, { cache: "no-store" });
      const json = (await response.json()) as PerformanceApiResponse;
      if (!response.ok || !json.ok || !json.performance) {
        setError(json.error ?? "Failed loading performance settings.");
        return;
      }

      const config = json.performance;
      setBePercentage(String(config.bePercentage ?? 80));
      setScalpingPeakPips(String(config.scalpingPeakPips ?? 10));
      setIntradayPeakPips(String(config.intradayPeakPips ?? 50));
      setSource(config.source ?? "default");
      setUpdatedAt(config.updatedAt ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed loading performance settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, [brandId]);

  async function saveConfig() {
    setSaving(true);
    setMessage(null);
    setError(null);

    const parsedBe = Number(bePercentage);
    const parsedScalp = Number(scalpingPeakPips);
    const parsedIntra = Number(intradayPeakPips);
    if (!Number.isFinite(parsedBe) || parsedBe <= 0 || parsedBe > 100) {
      setSaving(false);
      setError("BE percentage must be > 0 and <= 100.");
      return;
    }
    if (!Number.isFinite(parsedScalp) || parsedScalp <= 0 || !Number.isFinite(parsedIntra) || parsedIntra <= 0) {
      setSaving(false);
      setError("Peak pips must be > 0.");
      return;
    }

    try {
      const response = await fetch(`/api/hq/brands/${brandId}/performance-settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bePercentage: parsedBe,
          scalpingPeakPips: parsedScalp,
          intradayPeakPips: parsedIntra,
        }),
      });
      const json = (await response.json()) as PerformanceApiResponse;
      if (!response.ok || !json.ok || !json.performance) {
        setError(json.error ?? "Failed saving performance settings.");
        return;
      }

      setBePercentage(String(json.performance.bePercentage));
      setScalpingPeakPips(String(json.performance.scalpingPeakPips));
      setIntradayPeakPips(String(json.performance.intradayPeakPips));
      setSource(json.performance.source);
      setMessage("Performance settings saved.");
      await loadConfig();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed saving performance settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-slate-600" />
          <h2 className="text-lg font-black text-slate-950">Signal Performance Rules</h2>
        </div>
        <button type="button" className="text-button" onClick={() => void loadConfig()} disabled={loading || saving}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="mb-3 text-xs font-semibold text-slate-500">
        Set BE percentage and peak threshold for SL-to-BE classification. Apply untuk signal baru.
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
          BE %
          <input
            value={bePercentage}
            onChange={(event) => setBePercentage(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            placeholder="80"
            inputMode="decimal"
          />
        </label>
        <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
          Scalping peak pips
          <input
            value={scalpingPeakPips}
            onChange={(event) => setScalpingPeakPips(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            placeholder="10"
            inputMode="decimal"
          />
        </label>
        <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
          Intraday peak pips
          <input
            value={intradayPeakPips}
            onChange={(event) => setIntradayPeakPips(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            placeholder="50"
            inputMode="decimal"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Current source: {source}</span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Last update (MYT): {formatTime(updatedAt)}</span>
      </div>

      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
        Tip: Scalping dan intraday boleh guna threshold berbeza. BE % pula menentukan berapa peratus dari peak yang disimpan sebagai net pips.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="text-button primary-button" onClick={() => void saveConfig()} disabled={saving || loading}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Performance"}
        </button>
      </div>

      {message ? (
        <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
