import HqShell from "@/app/hq-shell";
import { brands } from "@/lib/registry";
import { Radio } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SignalsPage() {
  return (
    <HqShell>
      <section className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Signals</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Cross-brand signal feed dan Telegram routing status.
        </p>
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Signal and Telegram Lanes</h2>
            <p className="text-xs font-bold text-slate-500">
              Cross-brand delivery and deployment visibility.
            </p>
          </div>
          <Radio className="h-4 w-4 text-slate-500" />
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Signal Feed</th>
                <th>Telegram</th>
                <th>Last Deploy</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={`signal-${brand.id}`}>
                  <td>{brand.displayName}</td>
                  <td className="text-teal-700">Live</td>
                  <td>{brand.telegramStatus}</td>
                  <td>{brand.lastDeploy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </HqShell>
  );
}
