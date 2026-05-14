import Link from "next/link";
import { CheckCircle2, ExternalLink, FileText, Wrench } from "lucide-react";
import HqShell from "@/app/hq-shell";
import TallyAuditPanel from "@/app/tally-audit-panel";
import { PhaseBadge } from "@/app/hq-ui";
import { brands, migrationPhases } from "@/lib/registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SupabasePage() {
  return (
    <HqShell>
      <section className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Supabase</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Migration status, tally integrity, dan runbook untuk operasi shared database.
        </p>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-2">
        <Link href="/api/hq/audit/tally" className="panel p-4 hover:bg-slate-50">
          <div className="mb-2 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-slate-600" />
            <p className="text-sm font-black text-slate-950">Tally API</p>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Live payload audit untuk semak mismatch data per brand.
          </p>
        </Link>
        <a
          href="https://github.com/ezsignal/ezsignal/blob/main/docs/SHARED_DATA_MIGRATION_RUNBOOK.md"
          target="_blank"
          rel="noreferrer"
          className="panel p-4 hover:bg-slate-50"
        >
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600" />
            <p className="text-sm font-black text-slate-950">Migration Runbook</p>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Langkah copy-paste untuk import CSV lama ke shared Supabase.
          </p>
        </a>
      </section>

      <TallyAuditPanel />

      <section className="table-shell">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
          <h2 className="text-sm font-black text-slate-950">
            Shared Supabase Migration Phases
          </h2>
          <p className="text-xs font-semibold text-slate-500">
            Execution status for one-database rollout.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {migrationPhases.map((phase) => (
              <div
                key={phase.id}
                className="rounded-lg border border-slate-200 bg-white p-2.5"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="mono text-xs font-black text-slate-900">Phase {phase.id}</p>
                  <PhaseBadge status={phase.status} />
                </div>
                <p className="text-xs font-bold text-slate-700">{phase.title}</p>
                <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                  {phase.owner}
                </p>
              </div>
            ))}
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>GitHub</th>
              <th>Vercel</th>
              <th>Supabase</th>
              <th>Domain</th>
              <th>Telegram</th>
              <th>Deploy</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="status-dot" style={{ color: brand.accent }} />
                    {brand.displayName}
                  </div>
                </td>
                <td className="mono text-xs">{brand.github}</td>
                <td>{brand.vercelProject}</td>
                <td>{brand.supabaseGroup}</td>
                <td>
                  <a
                    className="inline-flex items-center gap-2 text-blue-700"
                    href={`https://${brand.domain}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {brand.domain}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </td>
                <td>{brand.telegramStatus}</td>
                <td>
                  <span className="inline-flex items-center gap-2 text-teal-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {brand.lastDeploy}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </HqShell>
  );
}
