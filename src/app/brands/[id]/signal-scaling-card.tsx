"use client";

import { useEffect, useState } from "react";
import { Gauge, RefreshCw, Save } from "lucide-react";

type ScalingApiResponse = {
  ok: boolean;
  error?: string;
  brandId?: string;
  scaling?: {
    multiplier: number;
    source: "default" | "database";
    defaultMultiplier?: number;
    updatedAt?: string | null;
  };
  saved?: boolean;
};

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
}

export default function SignalScalingCard({ brandId }: { brandId: string }) {
  const [multiplier, setMultiplier] = useState("1");
  const [defaultMultiplier, setDefaultMultiplier] = useState<number>(1);
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
      const response = await fetch(`/api/hq/brands/${brandId}/signal-scaling`, { cache: "no-store" });
      const json = (await response.json()) as ScalingApiResponse;
      if (!response.ok || !json.ok || !json.scaling) {
        setError(json.error ?? "Failed loading signal scaling settings.");
        return;
      }

      const nextMultiplier = Number(json.scaling.multiplier ?? 1);
      setMultiplier(Number.isFinite(nextMultiplier) ? String(nextMultiplier) : "1");
      setDefaultMultiplier(Number(json.scaling.defaultMultiplier ?? 1));
      setSource(json.scaling.source ?? "default");
      setUpdatedAt(json.scaling.updatedAt ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed loading signal scaling settings.");
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

    const parsed = Number(multiplier);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 3) {
      setSaving(false);
      setError("Multiplier must be > 0 and <= 3.");
      return;
    }

    try {
      const response = await fetch(`/api/hq/brands/${brandId}/signal-scaling`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ multiplier: parsed }),
      });
      const json = (await response.json()) as ScalingApiResponse;
      if (!response.ok || !json.ok || !json.scaling) {
        setError(json.error ?? "Failed saving signal scaling settings.");
        return;
      }

      setMultiplier(String(json.scaling.multiplier));
      setSource(json.scaling.source);
      setMessage("Signal scaling saved.");
      await loadConfig();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed saving signal scaling settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-slate-600" />
          <h2 className="text-lg font-black text-slate-950">Signal Price Scaling</h2>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => void loadConfig()}
          disabled={loading || saving}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="mb-3 text-xs font-semibold text-slate-500">
        Control TP/SL distance scale for this brand only. <span className="font-black">1.0 = asal</span>,{" "}
        <span className="font-black">0.5 = separuh jarak</span>.
      </p>
      <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
        Nota: Perubahan scaling apply untuk signal baru sahaja. Signal yang sedang aktif tidak berubah retroaktif.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
          Multiplier
          <input
            value={multiplier}
            onChange={(event) => setMultiplier(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            placeholder="1.0"
            inputMode="decimal"
          />
        </label>

        <button
          type="button"
          className="text-button primary-button"
          onClick={() => void saveConfig()}
          disabled={saving || loading}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Scaling"}
        </button>
      </div>

      <div className="mt-3 grid gap-1 text-xs font-bold text-slate-600">
        <p>
          Current source: <span className="font-black uppercase">{source}</span>
        </p>
        <p>
          Default multiplier: <span className="font-black">{defaultMultiplier}</span>
        </p>
        <p>
          Last update: <span className="font-black">{formatTime(updatedAt)}</span>
        </p>
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
