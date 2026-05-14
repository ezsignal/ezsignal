import Link from "next/link";
import type { ReactNode } from "react";
import HqNav from "@/app/hq-nav";
import { getHqOverviewSnapshot } from "@/lib/hqOverview";

export default async function HqShell({
  children,
}: {
  children: ReactNode;
}) {
  const liveSnapshot = await getHqOverviewSnapshot();
  const modeLabel = liveSnapshot ? "Live database" : "Demo registry";
  const modeNote = liveSnapshot
    ? "Metrics now read from shared Supabase in real time."
    : "Supabase metrics are unavailable, showing fallback registry data.";
  const modeSyncedAt = liveSnapshot
    ? new Date(liveSnapshot.generatedAt).toLocaleString("en-GB", {
        hour12: false,
      })
    : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-sm font-black text-white">
            EZ
          </div>
          <div>
            <p className="text-sm font-black tracking-[0.18em] text-slate-950">
              SIGNAL HQ
            </p>
            <p className="text-xs font-bold text-slate-500">Control Center</p>
          </div>
        </Link>

        <HqNav />

        <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            Mode
          </p>
          <p className="mt-2 text-sm font-black text-slate-950">{modeLabel}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {modeNote}
          </p>
          {modeSyncedAt ? (
            <p className="mt-2 text-[11px] font-bold text-slate-500">
              Synced: {modeSyncedAt}
            </p>
          ) : null}
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
