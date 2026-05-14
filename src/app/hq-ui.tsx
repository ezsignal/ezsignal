import type { LucideIcon } from "lucide-react";
import type {
  BrandStatus,
  CheckStatus,
  PhaseStatus,
} from "@/lib/registry";

const statusStyles: Record<BrandStatus, string> = {
  core: "text-teal-700 bg-teal-50 border-teal-200",
  synced: "text-blue-700 bg-blue-50 border-blue-200",
  watch: "text-amber-700 bg-amber-50 border-amber-200",
  draft: "text-rose-700 bg-rose-50 border-rose-200",
};

const phaseStyles: Record<PhaseStatus, string> = {
  done: "text-teal-700 bg-teal-50 border-teal-200",
  active: "text-blue-700 bg-blue-50 border-blue-200",
  pending: "text-slate-700 bg-slate-100 border-slate-200",
};

const checkStyles: Record<CheckStatus, string> = {
  pass: "text-teal-700 bg-teal-50 border-teal-200",
  watch: "text-amber-700 bg-amber-50 border-amber-200",
  todo: "text-rose-700 bg-rose-50 border-rose-200",
};

export function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          {label}
        </p>
        <div className="icon-button" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mono text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: BrandStatus }) {
  const label =
    status === "core"
      ? "Core"
      : status === "synced"
        ? "Synced"
        : status === "watch"
          ? "Watch"
          : "Draft";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${statusStyles[status]}`}
    >
      <span className="status-dot" />
      {label}
    </span>
  );
}

export function PhaseBadge({ status }: { status: PhaseStatus }) {
  const label = status === "done" ? "Done" : status === "active" ? "Active" : "Pending";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${phaseStyles[status]}`}
    >
      <span className="status-dot" />
      {label}
    </span>
  );
}

export function CheckBadge({ status }: { status: CheckStatus }) {
  const label = status === "pass" ? "Pass" : status === "watch" ? "Watch" : "To Do";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${checkStyles[status]}`}
    >
      <span className="status-dot" />
      {label}
    </span>
  );
}
