"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DATE_RANGES, inDateRange, type DateRange } from "@/lib/dateRange";

type AccessKeyRow = {
  id: string;
  brandId: string;
  clientName: string | null;
  packageName: string | null;
  keyPreview: string;
  isActive: boolean;
  expiredAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

type StatusFilter = "all" | "active" | "inactive" | "expired";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "expired", label: "Expired" },
];

function dateText(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" });
}

export default function AccessKeysTable({ rows }: { rows: AccessKeyRow[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const expired = row.expiredAt ? new Date(row.expiredAt).getTime() <= now : false;
      if (status === "active" && !row.isActive) return false;
      if (status === "inactive" && row.isActive) return false;
      if (status === "expired" && !expired) return false;
      if (!inDateRange(row.createdAt, dateRange)) return false;
      if (q.length > 0) {
        const haystack = `${row.clientName ?? ""} ${row.packageName ?? ""} ${row.keyPreview} ${row.brandId}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, status, dateRange, query]);

  return (
    <section className="panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Recent Access Keys</h2>
          <p className="text-xs font-bold text-slate-500">
            Showing {filtered.length} of {rows.length} key records.
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
              placeholder="Search client, package, key…"
              className="w-56 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-400"
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Client</th>
              <th>Package</th>
              <th>Key</th>
              <th>Status</th>
              <th>Last Login (MYT)</th>
              <th>Expired At (MYT)</th>
              <th>Created (MYT)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="mono text-xs">{row.brandId}</td>
                <td>{row.clientName ?? "-"}</td>
                <td>{row.packageName ?? "-"}</td>
                <td className="mono text-xs">{row.keyPreview}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-black ${
                      row.isActive ? "bg-teal-50 text-teal-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {row.isActive ? "active" : "inactive"}
                  </span>
                </td>
                <td>{dateText(row.lastLoginAt)}</td>
                <td>{dateText(row.expiredAt)}</td>
                <td>{dateText(row.createdAt)}</td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-xs font-bold text-slate-500">
                  {rows.length === 0 ? "No access key data yet." : "No keys match the filter."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
