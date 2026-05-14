import HqShell from "@/app/hq-shell";
import PerformanceEditorPanel from "@/app/performance-editor-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PerformancePage() {
  return (
    <HqShell>
      <section className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Performance</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Edit dan audit performance logs semua brand dari HQ.
        </p>
      </section>

      <PerformanceEditorPanel />
    </HqShell>
  );
}
