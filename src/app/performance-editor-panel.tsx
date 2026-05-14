"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, Save, Search, Trash2, Upload } from "lucide-react";
import { brands } from "@/lib/registry";

type PerformanceRow = {
  id: string;
  brand_id: string;
  mode: "scalping" | "intraday";
  type: "buy" | "sell";
  outcome: "tp1" | "tp2" | "tp3" | "be" | "sl";
  pair: string;
  net_pips: number | null;
  peak_pips: number | null;
  price: number | null;
  note: string | null;
  created_at: string;
};

type FetchResponse = {
  ok: boolean;
  flags?: { performanceEditorEnabled?: boolean };
  rows: PerformanceRow[];
  total?: number;
  count?: number;
  error?: string;
};

type AuditRow = {
  id: string;
  brand_id: string;
  log_id: string;
  previous_outcome: string | null;
  next_outcome: string | null;
  reason: string | null;
  edited_by: string | null;
  created_at: string;
};

type AuditResponse = {
  ok: boolean;
  rows: AuditRow[];
  count?: number;
  error?: string;
};

type DraftRow = {
  mode: "scalping" | "intraday";
  outcome: "tp1" | "tp2" | "tp3" | "be" | "sl";
  netPips: string;
  peakPips: string;
  note: string;
};

type RangePreset = "day" | "week" | "month" | "custom" | "all";

const OUTCOMES = ["tp1", "tp2", "tp3", "be", "sl"] as const;
const MODES = ["scalping", "intraday"] as const;
const TYPES = ["buy", "sell"] as const;
const ALL_FETCH_BATCH = 1000;
const MAX_ALL_FETCH_ROWS = 50000;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
}

function toIntervalBucketKey(createdAtIso: string, mode: "scalping" | "intraday") {
  const date = new Date(createdAtIso);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return createdAtIso;
  const intervalMs = mode === "intraday"
    ? 4 * 60 * 60 * 1000
    : 30 * 60 * 1000;
  const bucketStartMs = Math.floor(ms / intervalMs) * intervalMs;
  return new Date(bucketStartMs).toISOString();
}

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function toCsv(rows: PerformanceRow[]) {
  const header = ["id", "brand_id", "time", "pair", "mode", "type", "outcome", "net_pips", "peak_pips", "note"];
  const lines = rows.map((row) => [
    row.id,
    row.brand_id,
    row.created_at,
    row.pair,
    row.mode,
    row.type,
    row.outcome,
    row.net_pips ?? "",
    row.peak_pips ?? "",
    row.note ?? "",
  ]);
  return [header, ...lines]
    .map((line) => line.map((value) => csvEscape(value)).join(","))
    .join("\n");
}

export default function PerformanceEditorPanel() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [rangePreset, setRangePreset] = useState<RangePreset>("week");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(20);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkMode, setBulkMode] = useState<string>("keep");
  const [bulkOutcome, setBulkOutcome] = useState<string>("keep");
  const [bulkNote, setBulkNote] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [importSyncAllBrands, setImportSyncAllBrands] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorEnabled, setEditorEnabled] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const unifiedAllBrands = brandFilter === "all";

  const rangeStartIso = useMemo(() => {
    const now = new Date();
    if (rangePreset === "all") return "";
    if (rangePreset === "day") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    if (rangePreset === "week") {
      const start = new Date(now);
      const jsDay = start.getDay();
      const daysFromMonday = (jsDay + 6) % 7;
      start.setDate(start.getDate() - daysFromMonday);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    if (rangePreset === "month") {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return start.toISOString();
    }
    if (!fromDate) return "";
    const start = new Date(`${fromDate}T00:00:00`);
    return Number.isNaN(start.getTime()) ? "" : start.toISOString();
  }, [fromDate, rangePreset]);

  const rangeEndIso = useMemo(() => {
    if (rangePreset !== "custom") return "";
    if (!toDate) return "";
    const end = new Date(`${toDate}T23:59:59`);
    return Number.isNaN(end.getTime()) ? "" : end.toISOString();
  }, [toDate, rangePreset]);

  const ensureDraft = useCallback((row: PerformanceRow) => {
    setDrafts((prev) => {
      if (prev[row.id]) return prev;
      return {
        ...prev,
        [row.id]: {
          mode: row.mode,
          outcome: row.outcome,
          netPips: row.net_pips === null ? "" : Number(row.net_pips).toFixed(1),
          peakPips: row.peak_pips === null ? "" : Number(row.peak_pips).toFixed(1),
          note: row.note ?? "",
        },
      };
    });
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const buildBaseQuery = () => {
        const q = new URLSearchParams();
        if (brandFilter !== "all") q.set("brandId", brandFilter);
        if (modeFilter !== "all") q.set("mode", modeFilter);
        if (typeFilter !== "all") q.set("type", typeFilter);
        if (outcomeFilter !== "all") q.set("outcome", outcomeFilter);
        if (rangeStartIso) q.set("from", rangeStartIso);
        if (rangeEndIso) q.set("to", rangeEndIso);
        if (searchQuery.trim()) q.set("q", searchQuery.trim());
        return q;
      };

      const shouldFetchAllForClientPagination = unifiedAllBrands || rowsPerPage === "all";

      if (shouldFetchAllForClientPagination) {
        const allRows: PerformanceRow[] = [];
        let offset = 0;
        let total = 0;
        let editorFlag = false;

        while (offset < MAX_ALL_FETCH_ROWS) {
          const query = buildBaseQuery();
          query.set("limit", String(ALL_FETCH_BATCH));
          query.set("offset", String(offset));

          const response = await fetch(`/api/hq/performance?${query.toString()}`, { cache: "no-store" });
          const json = (await response.json()) as FetchResponse;
          if (!response.ok || !json.ok) {
            setError(json.error ?? "Failed loading performance logs.");
            return;
          }

          const batchRows = json.rows ?? [];
          total = json.total ?? json.count ?? batchRows.length;
          editorFlag = Boolean(json.flags?.performanceEditorEnabled);
          allRows.push(...batchRows);

          if (batchRows.length < ALL_FETCH_BATCH || allRows.length >= total) break;
          offset += ALL_FETCH_BATCH;
        }

        if (allRows.length >= MAX_ALL_FETCH_ROWS) {
          setMessage(`Loaded first ${MAX_ALL_FETCH_ROWS} rows in All mode (safety cap).`);
        }

        setRows(allRows.slice(0, MAX_ALL_FETCH_ROWS));
        setTotalRows(total || allRows.length);
        setEditorEnabled(editorFlag);
        for (const row of allRows) ensureDraft(row);
        return;
      }

      const query = buildBaseQuery();
      const serverLimit = rowsPerPage;
      const serverOffset = (page - 1) * rowsPerPage;
      query.set("limit", String(serverLimit));
      query.set("offset", String(serverOffset));

      const response = await fetch(`/api/hq/performance?${query.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as FetchResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed loading performance logs.");
        return;
      }
      const nextRows = json.rows ?? [];
      setRows(nextRows);
      setTotalRows(json.total ?? json.count ?? nextRows.length);
      setEditorEnabled(Boolean(json.flags?.performanceEditorEnabled));
      for (const row of nextRows) ensureDraft(row);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed loading performance logs.");
    } finally {
      setLoading(false);
    }
  }, [brandFilter, modeFilter, typeFilter, outcomeFilter, rangeStartIso, rangeEndIso, searchQuery, rowsPerPage, page, ensureDraft, unifiedAllBrands]);

  const loadAuditRows = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const query = new URLSearchParams();
      query.set("limit", "60");
      if (brandFilter !== "all") query.set("brandId", brandFilter);
      const response = await fetch(`/api/hq/performance/audit?${query.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as AuditResponse;
      if (!response.ok || !json.ok) return;
      setAuditRows(json.rows ?? []);
    } catch {
      // keep existing audit rows on transient failure
    } finally {
      setLoadingAudit(false);
    }
  }, [brandFilter]);

  useEffect(() => {
    const kickoff = setTimeout(() => {
      void loadRows();
      void loadAuditRows();
    }, 0);
    return () => clearTimeout(kickoff);
  }, [loadRows, loadAuditRows]);

  const baseRows = useMemo(() => {
    if (!unifiedAllBrands) return rows;
    const sorted = [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const deduped = new Map<string, PerformanceRow>();

    for (const row of sorted) {
      const key = [
        row.pair,
        row.mode,
        row.type,
        row.outcome,
        toIntervalBucketKey(row.created_at, row.mode),
      ].join("|");
      if (!deduped.has(key)) {
        deduped.set(key, row);
      }
    }

    return Array.from(deduped.values());
  }, [rows, unifiedAllBrands]);

  const filteredRows = useMemo(() => baseRows, [baseRows]);

  const effectiveTotalRows = useMemo(() => {
    if (unifiedAllBrands) return filteredRows.length;
    return totalRows;
  }, [filteredRows.length, totalRows, unifiedAllBrands]);

  const totalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(effectiveTotalRows / rowsPerPage));
  }, [effectiveTotalRows, rowsPerPage]);

  const visibleRows = useMemo(() => {
    if (rowsPerPage === "all") return filteredRows;
    if (unifiedAllBrands) {
      const start = (page - 1) * rowsPerPage;
      return filteredRows.slice(start, start + rowsPerPage);
    }
    return filteredRows;
  }, [filteredRows, page, rowsPerPage, unifiedAllBrands]);

  useEffect(() => {
    setPage(1);
  }, [rowsPerPage, searchQuery, brandFilter, modeFilter, typeFilter, outcomeFilter, rangePreset, fromDate, toDate]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => filteredRows.some((row) => row.id === id)));
  }, [filteredRows]);

  function updateDraft(id: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        mode: prev[id]?.mode ?? "scalping",
        outcome: prev[id]?.outcome ?? "be",
        netPips: prev[id]?.netPips ?? "",
        peakPips: prev[id]?.peakPips ?? "",
        note: prev[id]?.note ?? "",
        ...patch,
      },
    }));
  }

  async function saveRow(row: PerformanceRow, propagateAllBrands = false) {
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
          mode: draft.mode,
          outcome: draft.outcome,
          netPips: draft.netPips.trim() === "" ? null : Number(draft.netPips),
          peakPips: draft.peakPips.trim() === "" ? null : Number(draft.peakPips),
          note: draft.note,
          propagateAllBrands,
        }),
      });
      const json = (await response.json()) as {
        ok: boolean;
        error?: string;
        updatedRows?: number;
        updatedBrands?: string[];
      };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed updating performance log.");
        return;
      }
      if (propagateAllBrands) {
        setMessage(
          `Saved ${row.id.slice(0, 8)} to ${json.updatedRows ?? 0} rows (${(json.updatedBrands ?? []).join(", ") || "multi-brand"}).`,
        );
      } else {
        setMessage(`Saved ${row.id.slice(0, 8)}.`);
      }
      await Promise.all([loadRows(), loadAuditRows()]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed updating performance log.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(row: PerformanceRow, propagateAllBrands = false) {
    if (!window.confirm(`Delete performance tick ${row.id.slice(0, 8)}?`)) return;
    const draft = drafts[row.id];
    setDeletingId(row.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/hq/performance", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          logId: row.id,
          brandId: row.brand_id,
          note: draft?.note ?? "",
          propagateAllBrands,
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string; deleted?: number };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed deleting performance log.");
        return;
      }
      setMessage(
        propagateAllBrands
          ? `Deleted ${json.deleted ?? 0} rows across brands.`
          : `Deleted ${row.id.slice(0, 8)}.`,
      );
      await Promise.all([loadRows(), loadAuditRows()]);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed deleting performance log.");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelectedRows() {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected performance rows?`)) return;
    setBulkDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/hq/performance", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          brandId: brandFilter !== "all" ? brandFilter : undefined,
          propagateAllBrands: unifiedAllBrands,
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string; deleted?: number };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed deleting selected rows.");
        return;
      }
      setMessage(
        unifiedAllBrands
          ? `Deleted ${json.deleted ?? selectedIds.length} rows across brands.`
          : `Deleted ${json.deleted ?? selectedIds.length} rows.`,
      );
      setSelectedIds([]);
      await Promise.all([loadRows(), loadAuditRows()]);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed deleting selected rows.");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function applyBulkUpdate() {
    if (!selectedIds.length) return;
    const payload: {
      ids: string[];
      brandId?: string;
      mode?: string;
      outcome?: string;
      note?: string;
    } = {
      ids: selectedIds,
      brandId: brandFilter !== "all" ? brandFilter : undefined,
    };
    if (bulkMode !== "keep") payload.mode = bulkMode;
    if (bulkOutcome !== "keep") payload.outcome = bulkOutcome;
    if (bulkNote.trim()) payload.note = bulkNote.trim();

    if (!payload.mode && !payload.outcome && !payload.note) {
      setError("Set at least one bulk field (mode, outcome, or note).");
      return;
    }

    setBulkApplying(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/hq/performance", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { ok: boolean; error?: string; updated?: number; auditLogged?: number };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed bulk update.");
        return;
      }
      setMessage(`Bulk updated ${json.updated ?? selectedIds.length} rows. Audit: ${json.auditLogged ?? 0}.`);
      await Promise.all([loadRows(), loadAuditRows()]);
      setBulkMode("keep");
      setBulkOutcome("keep");
      setBulkNote("");
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Failed bulk update.");
    } finally {
      setBulkApplying(false);
    }
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((value) => value !== id);
    });
  }

  function selectVisibleRows() {
    const ids = visibleRows.map((row) => row.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function clearSelectedRows() {
    setSelectedIds([]);
  }

  async function exportFilteredCsv() {
    setExportingCsv(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set("format", "csv");
      query.set("limit", "5000");
      if (brandFilter !== "all") query.set("brandId", brandFilter);
      if (modeFilter !== "all") query.set("mode", modeFilter);
      if (typeFilter !== "all") query.set("type", typeFilter);
      if (outcomeFilter !== "all") query.set("outcome", outcomeFilter);
      if (rangeStartIso) query.set("from", rangeStartIso);
      if (rangeEndIso) query.set("to", rangeEndIso);
      if (searchQuery.trim()) query.set("q", searchQuery.trim());

      const response = await fetch(`/api/hq/performance?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to export CSV.");
      const content = await response.text();
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const scope = brandFilter === "all" ? "all-brands" : brandFilter;
      a.href = url;
      a.download = `HQ-performance-${scope}-${rangePreset}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("CSV exported.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export CSV.");
    } finally {
      setExportingCsv(false);
    }
  }

  async function importCsvFile(file: File) {
    if (!file) return;
    setImportingCsv(true);
    setError(null);
    setMessage(null);
    try {
      const csv = await file.text();
      const response = await fetch("/api/hq/performance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csv,
          brandId: brandFilter !== "all" ? brandFilter : undefined,
          propagateAllBrands: importSyncAllBrands,
        }),
      });
      const json = (await response.json()) as {
        ok: boolean;
        error?: string;
        sourceRows?: number;
        imported?: number;
        propagatedAllBrands?: boolean;
        csvDuplicatesCollapsed?: number;
        dbDuplicatesPruned?: number;
        updated?: number;
        inserted?: number;
        skipped?: number;
        auditErrors?: number;
      };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed importing CSV.");
        return;
      }
      setMessage(
        `Import done${json.propagatedAllBrands ? " (sync all brands)" : ""}. SourceRows: ${json.sourceRows ?? 0}, Imported: ${json.imported ?? 0}, CSV dedupe: ${json.csvDuplicatesCollapsed ?? 0}, DB pruned: ${json.dbDuplicatesPruned ?? 0}, Updated: ${json.updated ?? 0}, Inserted: ${json.inserted ?? 0}, Skipped: ${json.skipped ?? 0}, AuditErrors: ${json.auditErrors ?? 0}.`,
      );
      await Promise.all([loadRows(), loadAuditRows()]);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Failed importing CSV.");
    } finally {
      setImportingCsv(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  const brandOptions = useMemo(
    () => [
      { id: "all", label: "All brands" },
      ...brands.map((brand) => ({ id: brand.id, label: brand.displayName })),
    ],
    [],
  );

  return (
    <section id="performance" className="mb-6 panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Central Performance Editor</h2>
          <p className="text-xs font-bold text-slate-500">Edit, filter, import, dan export performance logs untuk semua brand.</p>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void loadRows();
            void loadAuditRows();
          }}
          disabled={loading || loadingAudit}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
      {message ? <p className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{message}</p> : null}
      {!editorEnabled ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          Edit mode disabled. Set <span className="mono">HQ_PERFORMANCE_EDITOR_ENABLED=true</span>.
        </p>
      ) : null}

      <div className="mb-3 grid gap-2 lg:grid-cols-6">
        <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
          {brandOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
          <option value="all">All modes</option>
          {MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode.toUpperCase()}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
          <option value="all">All types</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {type.toUpperCase()}
            </option>
          ))}
        </select>
        <select value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
          <option value="all">All outcomes</option>
          {OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcome.toUpperCase()}
            </option>
          ))}
        </select>
        <select value={rangePreset} onChange={(event) => setRangePreset(event.target.value as RangePreset)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
          <option value="all">All time</option>
          <option value="day">Today</option>
          <option value="week">This week</option>
          <option value="month">Last 30 days</option>
          <option value="custom">Custom</option>
        </select>
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search id/brand/note"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-bold text-slate-700"
          />
        </label>
      </div>

      {rangePreset === "custom" ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700" />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700" />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className="text-button" onClick={selectVisibleRows} disabled={!visibleRows.length}>
          Select page
        </button>
        <button type="button" className="text-button" onClick={clearSelectedRows} disabled={!selectedIds.length}>
          Clear selected
        </button>
        <button type="button" className="text-button" onClick={() => void deleteSelectedRows()} disabled={!selectedIds.length || bulkDeleting || !editorEnabled}>
          <Trash2 className="h-4 w-4" />
          {bulkDeleting ? "Deleting..." : `Delete selected (${selectedIds.length})`}
        </button>
        <button type="button" className="text-button" onClick={() => void exportFilteredCsv()} disabled={exportingCsv || loading}>
          <Download className="h-4 w-4" />
          {exportingCsv ? "Exporting..." : "Export CSV"}
        </button>
        <button type="button" className="text-button" onClick={() => csvInputRef.current?.click()} disabled={importingCsv || !editorEnabled}>
          <Upload className="h-4 w-4" />
          {importingCsv ? "Importing..." : "Import CSV"}
        </button>
        <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-900"
            checked={importSyncAllBrands}
            onChange={(event) => setImportSyncAllBrands(event.target.checked)}
          />
          Sync all brands on import
        </label>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importCsvFile(file);
          }}
        />
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">Bulk Update Selected</p>
        <div className="grid gap-2 lg:grid-cols-[180px_180px_minmax(0,1fr)_auto]">
          <select value={bulkMode} onChange={(event) => setBulkMode(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
            <option value="keep">Keep mode</option>
            <option value="scalping">Set mode SCALPING</option>
            <option value="intraday">Set mode INTRADAY</option>
          </select>
          <select value={bulkOutcome} onChange={(event) => setBulkOutcome(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
            <option value="keep">Keep outcome</option>
            {OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                Set outcome {outcome.toUpperCase()}
              </option>
            ))}
          </select>
          <input
            value={bulkNote}
            onChange={(event) => setBulkNote(event.target.value)}
            placeholder="Reason note for audit log (optional)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          />
          <button
            type="button"
            className="text-button"
            onClick={() => void applyBulkUpdate()}
            disabled={!selectedIds.length || bulkApplying || !editorEnabled}
          >
            <Save className="h-4 w-4" />
            {bulkApplying ? "Applying..." : `Apply (${selectedIds.length})`}
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-600">
        <p>
          Showing {visibleRows.length} of {effectiveTotalRows} rows
        </p>
        <div className="flex items-center gap-2">
          <span>Rows:</span>
          <select
            value={rowsPerPage === "all" ? "all" : String(rowsPerPage)}
            onChange={(event) => {
              const value = event.target.value;
              setRowsPerPage(value === "all" ? "all" : Number(value));
            }}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {unifiedAllBrands ? (
        <p className="mb-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">
          All brands view is consolidated (1 row per signal/performance event). Save from this view propagates across brands.
        </p>
      ) : null}

      <div className="table-shell overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th>Tick</th>
              <th>Time</th>
              <th>Mode</th>
              <th>Type</th>
              <th>Outcome</th>
              <th>Net Pips</th>
              <th>Peak Pips</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const draft = drafts[row.id] ?? {
                mode: row.mode,
                outcome: row.outcome,
                netPips: row.net_pips === null ? "" : String(row.net_pips),
                peakPips: row.peak_pips === null ? "" : String(row.peak_pips),
                note: row.note ?? "",
              };
              const checked = selectedIds.includes(row.id);
              return (
                <tr key={row.id}>
                  <td>
                    <label className="inline-flex cursor-pointer items-center justify-center p-1">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-slate-900"
                        checked={checked}
                        onChange={() => toggleSelected(row.id, !checked)}
                      />
                    </label>
                  </td>
                  <td className="mono text-xs">
                    <div>{row.id.slice(0, 8)}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {unifiedAllBrands ? "ALL BRANDS" : row.brand_id}
                    </div>
                  </td>
                  <td className="text-xs font-bold text-slate-500">{formatDate(row.created_at)}</td>
                  <td>
                    <select
                      value={draft.mode}
                      onChange={(event) => updateDraft(row.id, { mode: event.target.value === "intraday" ? "intraday" : "scalping" })}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                    >
                      {MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-xs font-black uppercase tracking-wide">{row.type}</td>
                  <td>
                    <select
                      value={draft.outcome}
                      onChange={(event) => updateDraft(row.id, { outcome: event.target.value as DraftRow["outcome"] })}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                    >
                      {OUTCOMES.map((outcome) => (
                        <option key={outcome} value={outcome}>
                          {outcome.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={draft.netPips}
                      onChange={(event) => updateDraft(row.id, { netPips: event.target.value })}
                      className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                    />
                  </td>
                  <td>
                    <input
                      value={draft.peakPips}
                      onChange={(event) => updateDraft(row.id, { peakPips: event.target.value })}
                      className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                    />
                  </td>
                  <td>
                    <input
                      value={draft.note}
                      onChange={(event) => updateDraft(row.id, { note: event.target.value })}
                      placeholder="Reason / note"
                      className="w-56 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {unifiedAllBrands ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => void saveRow(row, true)}
                          disabled={savingId === row.id || deletingId === row.id || !editorEnabled}
                          title="Save and propagate this edit to all brands"
                        >
                          <Save className="h-4 w-4" />
                          {savingId === row.id ? "Saving..." : "Save All"}
                        </button>
                      ) : (
                        <>
                          <button type="button" className="text-button" onClick={() => void saveRow(row)} disabled={savingId === row.id || deletingId === row.id || !editorEnabled}>
                            <Save className="h-4 w-4" />
                            {savingId === row.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => void saveRow(row, true)}
                            disabled={savingId === row.id || deletingId === row.id || !editorEnabled}
                            title="Save this edit and propagate to all brands"
                          >
                            <Save className="h-4 w-4" />
                            Save All
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void deleteRow(row, unifiedAllBrands)}
                        disabled={deletingId === row.id || savingId === row.id || !editorEnabled}
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === row.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-xs font-bold text-slate-500">
                  No performance logs found for current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {rowsPerPage !== "all" ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="text-button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
            Prev
          </button>
          <span className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-black text-slate-700">
            Page {page} / {totalPages}
          </span>
          <button type="button" className="text-button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
            Next
          </button>
        </div>
      ) : null}

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Recent Audit Timeline</p>
          <p className="text-xs font-bold text-slate-500">{loadingAudit ? "Loading..." : `${auditRows.length} edits`}</p>
        </div>
        <div className="max-h-64 overflow-auto rounded border border-slate-200">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Brand</th>
                <th>Tick</th>
                <th>Change</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.slice(0, 100).map((row) => (
                <tr key={row.id}>
                  <td className="text-xs font-bold text-slate-600">{formatDate(row.created_at)}</td>
                  <td className="text-xs font-black uppercase tracking-wide text-slate-700">{row.brand_id}</td>
                  <td className="mono text-xs">{row.log_id.slice(0, 8)}</td>
                  <td className="text-xs font-bold text-slate-700">
                    {(row.previous_outcome ?? "-").toUpperCase()} {" -> "} {(row.next_outcome ?? "-").toUpperCase()}
                  </td>
                  <td className="text-xs font-semibold text-slate-600">{row.reason?.trim() || "-"}</td>
                </tr>
              ))}
              {auditRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-xs font-bold text-slate-500">
                    No audit rows found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
