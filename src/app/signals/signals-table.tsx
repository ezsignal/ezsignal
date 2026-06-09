"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DATE_RANGES, inDateRange, type DateRange } from "@/lib/dateRange";

type SignalRow = {
  id: string;
  brandId: string;
  pair: string;
  mode: string;
  action: "buy" | "sell";
  entry: number;
  stopLoss: number | null;
  takeProfit1: number | null;
  status: string;
  createdAt: string;
};

type StatusFilter = "all" | "active" | "closed" | "cancelled";
type ActionFilter = "all" | "buy" | "sell";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
  { key: "cancelled", label: "Cancelled" },
];

const ACTION_FILTERS: { key: ActionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "buy", label: "Buy" },
  { key: "sell", label: "Sell" },
];

function dateText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" });
}

export default function SignalsTable({ rows }: { rows: SignalRow[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [action, setAction] = useState<ActionFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (action !== "all" && row.action !== action) return false;
      if (!inDateRange(row.createdAt, dateRange)) return false;
      if (q.length > 0) {
        const haystack = `${row.brandId} ${row.pair} ${row.status} ${row.action}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, status, action, dateRange, query]);

  return (
    <section className="panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Recent Signals</h2>
          <p className="text-xs font-bold text-slate-500">
            Showing {filtered.length} of {rows.length} rows.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="hq-filter-select"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.key === "all" ? "All status" : item.label}
              </option>
            ))}
          </select>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as ActionFilter)}
            className="hq-filter-select"
            aria-label="Filter by action"
          >
            {ACTION_FILTERS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.key === "all" ? "All actions" : item.label}
              </option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value as DateRange)}
            className="hq-filter-select"
            aria-label="Filter by date"
          >
            {DATE_RANGES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.key === "all" ? "All dates" : item.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search brand, pair…"
              className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-400"
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Pair</th>
              <th>Action</th>
              <th>Type</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP1</th>
              <th>Status</th>
              <th>Created (MYT)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="mono text-xs">{row.brandId}</td>
                <td>{row.pair}</td>
                <td className={row.action === "buy" ? "text-teal-700" : "text-rose-700"}>
                  {row.action.toUpperCase()}
                </td>
                <td className="mono text-xs uppercase text-slate-500">{row.mode}</td>
                <td>{row.entry}</td>
                <td>{row.stopLoss ?? "-"}</td>
                <td>{row.takeProfit1 ?? "-"}</td>
                <td>{row.status}</td>
                <td>{dateText(row.createdAt)}</td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-xs font-bold text-slate-500">
                  {rows.length === 0 ? "No signal data yet." : "No signals match the filter."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
