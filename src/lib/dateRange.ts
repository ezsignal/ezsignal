// Client-safe date-range presets for HQ ops tables.
// Boundaries use the browser's local time (MYT for the team), matching the
// MYT timestamps shown in the tables. Filtering runs on already-loaded rows.

export type DateRange = "all" | "today" | "yesterday" | "week" | "month";

export const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function inDateRange(iso: string | null, range: DateRange): boolean {
  if (range === "all") return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  switch (range) {
    case "today":
      return t >= startOfToday;
    case "yesterday":
      return t >= startOfToday - DAY_MS && t < startOfToday;
    case "week":
      // current day + the 6 days before it (rolling 7-day window)
      return t >= startOfToday - 6 * DAY_MS;
    case "month":
      return t >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    default:
      return true;
  }
}
