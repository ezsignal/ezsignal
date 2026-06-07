"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, Save } from "lucide-react";

type Pricing = { usd7: number; usd15: number; usd30: number };

const FIELDS: { key: keyof Pricing; label: string }[] = [
  { key: "usd7", label: "7-day (USD)" },
  { key: "usd15", label: "15-day (USD)" },
  { key: "usd30", label: "30-day (USD)" },
];

export default function RevenuePricingCard() {
  const router = useRouter();
  const [pricing, setPricing] = useState<Pricing>({ usd7: 99, usd15: 199, usd30: 249 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/hq/revenue-pricing", { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; pricing?: Pricing };
        if (alive && res.ok && json.ok && json.pricing) setPricing(json.pricing);
      } catch {
        // keep defaults on transient failure
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  function update(field: keyof Pricing, value: string) {
    const next = Number(value);
    setPricing((prev) => ({ ...prev, [field]: Number.isFinite(next) && next >= 0 ? next : 0 }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/hq/revenue-pricing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pricing),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; pricing?: Pricing };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to save pricing.");
        return;
      }
      if (json.pricing) setPricing(json.pricing);
      setMessage("Saved. Revenue recalculated.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save pricing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="mb-1 flex items-center gap-2">
        <BadgeDollarSign className="h-4 w-4 text-slate-600" />
        <h2 className="text-lg font-black text-slate-950">Package Pricing</h2>
      </div>
      <p className="mb-3 text-xs font-bold text-slate-500">
        USD price per tier — drives the Revenue estimate for all brands.
      </p>

      {error ? (
        <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{message}</p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
              {field.label}
            </span>
            <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5">
              <span className="text-xs font-black text-slate-400">$</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={pricing[field.key]}
                onChange={(event) => update(field.key, event.target.value)}
                disabled={loading || saving}
                className="w-full bg-transparent text-sm font-bold text-slate-900 outline-none"
              />
            </div>
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={loading || saving}
        className="mt-3 text-button primary-button"
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save pricing"}
      </button>
    </div>
  );
}
