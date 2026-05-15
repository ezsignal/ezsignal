"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

type TradingDaySettingsPayload = {
  startHourMy: number;
  startMinuteMy: number;
  label: string;
  source: "database" | "env" | "default";
};

type TradingDaySettingsResponse = {
  ok: boolean;
  error?: string;
  settings?: TradingDaySettingsPayload;
};

function toTwoDigit(value: number) {
  return String(value).padStart(2, "0");
}

export default function TradingDaySettingsCard() {
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [source, setSource] = useState<TradingDaySettingsPayload["source"]>("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/hq/trading-day", { cache: "no-store" });
      const json = (await response.json()) as TradingDaySettingsResponse;
      if (!response.ok || !json.ok || !json.settings) {
        setError(json.error ?? "Failed loading trading-day settings.");
        return;
      }
      setHour(json.settings.startHourMy);
      setMinute(json.settings.startMinuteMy);
      setSource(json.settings.source);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed loading trading-day settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/hq/trading-day", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startHourMy: hour,
          startMinuteMy: minute,
        }),
      });
      const json = (await response.json()) as TradingDaySettingsResponse;
      if (!response.ok || !json.ok || !json.settings) {
        setError(json.error ?? "Failed saving trading-day settings.");
        return;
      }
      setHour(json.settings.startHourMy);
      setMinute(json.settings.startMinuteMy);
      setSource(json.settings.source);
      setMessage(`Trading day boundary saved: ${json.settings.label}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed saving trading-day settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-black text-slate-950">Trading Day Boundary</h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-slate-600">
          {source}
        </span>
      </div>
      <p className="mb-3 text-xs font-semibold text-slate-500">
        Trading day starts at this MYT time. All HQ "Today" metrics use this setting.
      </p>

      <div className="mb-3 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
        <select
          value={String(hour)}
          onChange={(event) => setHour(Number(event.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-700"
          disabled={loading || saving}
        >
          {Array.from({ length: 24 }).map((_, value) => (
            <option key={value} value={value}>
              {toTwoDigit(value)}
            </option>
          ))}
        </select>
        <span className="text-sm font-black text-slate-700">:</span>
        <select
          value={String(minute)}
          onChange={(event) => setMinute(Number(event.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-700"
          disabled={loading || saving}
        >
          {Array.from({ length: 60 }).map((_, value) => (
            <option key={value} value={value}>
              {toTwoDigit(value)}
            </option>
          ))}
        </select>
        <span className="text-xs font-black text-slate-500">MYT</span>
      </div>

      <button
        type="button"
        className="text-button"
        onClick={() => void saveSettings()}
        disabled={loading || saving}
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Boundary"}
      </button>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
