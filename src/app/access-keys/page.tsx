import HqShell from "@/app/hq-shell";
import { hqModules } from "@/lib/registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AccessKeysPage() {
  return (
    <HqShell>
      <section className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Access Keys</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Modul berkaitan authorization key, CRM, dan lane operasi user access.
        </p>
      </section>

      <section className="module-grid">
        {hqModules.map((module) => (
          <div key={module.title} className="panel p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="icon-button" aria-hidden="true">
                <module.icon className="h-4 w-4" />
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
                {module.status}
              </span>
            </div>
            <h3 className="text-base font-black text-slate-950">{module.title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {module.description}
            </p>
          </div>
        ))}
      </section>
    </HqShell>
  );
}
