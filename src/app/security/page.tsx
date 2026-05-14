import HqShell from "@/app/hq-shell";
import { CheckBadge, StatusBadge } from "@/app/hq-ui";
import { brands, parityBoard } from "@/lib/registry";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SecurityPage() {
  return (
    <HqShell>
      <section className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Security</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Track access UI, package links, dan admin flow parity untuk setiap brand.
        </p>
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              Security and Core Parity Board
            </h2>
            <p className="text-xs font-bold text-slate-500">
              Status align dengan core KAFRA.
            </p>
          </div>
          <ShieldAlert className="h-4 w-4 text-slate-500" />
        </div>
        <div className="space-y-3">
          {brands.map((brand) => (
            <div
              key={`parity-${brand.id}`}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-950">{brand.displayName}</p>
                <StatusBadge status={brand.status} />
              </div>
              <div className="space-y-2">
                {parityBoard[brand.id].map((check) => (
                  <div
                    key={`${brand.id}-${check.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
                  >
                    <div>
                      <p className="text-xs font-black text-slate-900">{check.label}</p>
                      <p className="text-xs font-semibold text-slate-500">{check.note}</p>
                    </div>
                    <CheckBadge status={check.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </HqShell>
  );
}
