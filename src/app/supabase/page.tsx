import HqShell from "@/app/hq-shell";
import { PhaseBadge } from "@/app/hq-ui";
import { brands, migrationPhases } from "@/lib/registry";
import { CheckCircle2, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SupabasePage() {
  return (
    <HqShell>
      <section className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Supabase</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Shared database migration, brand mapping, dan execution status.
        </p>
      </section>

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
