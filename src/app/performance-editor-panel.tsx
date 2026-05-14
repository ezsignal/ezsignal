"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { brands } from "@/lib/registry";

type PerformanceRow = {
  id: string;
  brand_id: string;
  pair: string;
  action: string;
  outcome: string;
  points: number | null;
  price: number | null;
  created_at: string;
};

type FetchResponse = {
  ok: boolean;
  flags?: {
    performanceEditorEnabled?: boolean;
  };
  rows: PerformanceRow[];
  error?: string;
};

type DraftRow = {
  outcome: string;
  points: string;
  price: string;
  reason: string;
};

const OUTCOMES = ["tp1", "tp2", "tp3", "be", "sl"] as const;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
}

export default function PerformanceEditorPanel() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editorEnabled, setEditorEnabled] = useState(false);

  const ensureDraft = useCallback((row: PerformanceRow) => {
    setDrafts((prev) => {
      if (prev[row.id]) return prev;
      return {
        ...prev,
        [row.id]: {
          outcome: row.outcome,
          points: row.points === null ? "" : String(row.points),
          price: row.price === null ? "" : String(row.price),
          reason: "",
        },
      };
    });
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const query = new URLSearchParams();
      query.set("limit", "40");
      if (brandFilter !== "all") query.set("brandId", brandFilter);
      const response = await fetch(`/api/hq/performance?${query.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as FetchResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed loading performance logs.");
        return;
      }
      setEditorEnabled(Boolean(json.flags?.performanceEditorEnabled));
      setRows(json.rows ?? []);
      for (const row of json.rows ?? []) {
        ensureDraft(row);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed loading performance logs.");
    } finally {
      setLoading(false);
    }
  }, [brandFilter, ensureDraft]);

  useEffect(() => {
    const kickoff = setTimeout(() => {
      void loadRows();
    }, 0);
    return () => clearTimeout(kickoff);
  }, [loadRows]);

  const brandOptions = useMemo(
    () => [
      { id: "all", label: "All brands" },
      ...brands.map((brand) => ({ id: brand.id, label: brand.displayName })),
    ],
    [],
  );

  function updateDraft(id: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        outcome: prev[id]?.outcome ?? "tp1",
        points: prev[id]?.points ?? "",
        price: prev[id]?.price ?? "",
        reason: prev[id]?.reason ?? "",
        ...patch,
      },
    }));
  }

  async function saveRow(row: PerformanceRow) {
    const draft = drafts[row.id];
    if (!draft) return;
    setSavingId(row.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/hq/performance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          logId: row.id,
          brandId: row.brand_id,
          outcome: draft.outcome,
          points: draft.points.trim() === "" ? null : Number(draft.points),
          price: draft.price.trim() === "" ? null : Number(draft.price),
          reason: draft.reason,
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed updating performance log.");
        return;
      }
      setMessage(`Updated ${row.id.slice(0, 8)} successfully.`);
      await loadRows();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed updating performance log.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section id="performance" className="mb-6 panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Central Performance Editor</h2>
          <p className="text-xs font-bold text-slate-500">Edit performance rows across all brands from HQ.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={brandFilter}
            onChange={(event) => setBrandFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"
          >
            {brandOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="text-button" onClick={() => void loadRows()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {message && <p className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{message}</p>}
      {!editorEnabled && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          Edit mode is disabled. Set <span className="mono">HQ_PERFORMANCE_EDITOR_ENABLED=true</span> then restart dev server.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Pair</th>
              <th>Action</th>
              <th>Outcome</th>
              <th>Points</th>
              <th>Price</th>
              <th>Reason</th>
              <th>Created</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.id] ?? {
                outcome: row.outcome,
                points: row.points === null ? "" : String(row.points),
                price: row.price === null ? "" : String(row.price),
                reason: "",
              };
              return (
                <tr key={row.id}>
                  <td className="mono text-xs">{row.brand_id}</td>
                  <td>{row.pair}</td>
                  <td>{row.action}</td>
                  <td>
                    <select
                      value={draft.outcome}
                      onChange={(event) => updateDraft(row.id, { outcome: event.target.value })}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                    >
                      {OUTCOMES.map((value) => (
                        <option key={value} value={value}>
                          {value.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={draft.points}
                      onChange={(event) => updateDraft(row.id, { points: event.target.value })}
                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                    />
                  </td>
                  <td>
                    <input
                      value={draft.price}
                      onChange={(event) => updateDraft(row.id, { price: event.target.value })}
                      className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                    />
                  </td>
                  <td>
                    <input
                      value={draft.reason}
                      onChange={(event) => updateDraft(row.id, { reason: event.target.value })}
                      className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                      placeholder="Reason"
                    />
                  </td>
                  <td className="text-xs font-bold text-slate-500">{formatDate(row.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void saveRow(row)}
                      disabled={savingId === row.id || !editorEnabled}
                    >
                      <Save className="h-4 w-4" />
                      {savingId === row.id ? "Saving" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-xs font-bold text-slate-500">
                  No performance logs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
