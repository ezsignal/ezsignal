import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  GitBranch,
  KeyRound,
  RadioTower,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { brands, getBrand, parityBoard } from "@/lib/registry";

export function generateStaticParams() {
  return brands.map((brand) => ({ id: brand.id }));
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brand = getBrand(id);

  if (!brand) {
    notFound();
  }

  const healthRows = [
    ["Canonical brand", brand.canonicalName, CheckCircle2],
    ["Local folder", brand.localFolder, Database],
    ["GitHub repo", brand.github, GitBranch],
    ["Vercel project", brand.vercelProject, CheckCircle2],
    ["Supabase group", brand.supabaseGroup, Database],
    ["Telegram status", brand.telegramStatus, Bot],
  ];

  const flowRows = [
    ["Access key isolation", parityBoard[brand.id][0].note, KeyRound],
    ["Admin CRM scope", parityBoard[brand.id][2].note, ShieldCheck],
    ["Signal publishing", "Server-route migration planned", RadioTower],
    ["User analytics", "Ready from registry", UsersRound],
  ];

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Back to HQ
        </Link>

        <section className="panel mb-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="grid h-14 w-14 place-items-center rounded-lg text-lg font-black text-slate-950"
                style={{ backgroundColor: `${brand.accent}33`, border: `1px solid ${brand.accent}` }}
              >
                {brand.displayName.slice(0, 2)}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{brand.role}</p>
                <h1 className="text-4xl font-black tracking-tight text-slate-950">{brand.displayName}</h1>
                <p className="mt-1 text-sm font-bold text-slate-500">{brand.domain}</p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Core parity</p>
              <p className="mono text-3xl font-black text-slate-950">{brand.parity}%</p>
            </div>
          </div>
        </section>

        <section className="panel mb-4 p-4">
          <h2 className="text-lg font-black text-slate-950">Quick Actions</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <a className="text-button justify-between" href={`https://${brand.domain}`} target="_blank" rel="noreferrer">
              Open Domain
              <ExternalLink className="h-4 w-4" />
            </a>
            <a className="text-button justify-between" href={`https://github.com/${brand.github}`} target="_blank" rel="noreferrer">
              Open GitHub
              <ExternalLink className="h-4 w-4" />
            </a>
            <a className="text-button justify-between" href={`https://${brand.domain}/admin`} target="_blank" rel="noreferrer">
              Open Admin
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="metric-grid mb-4">
          <div className="panel p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Active Users</p>
            <p className="mono mt-3 text-3xl font-black text-slate-950">{brand.activeUsers}</p>
          </div>
          <div className="panel p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Expired Users</p>
            <p className="mono mt-3 text-3xl font-black text-slate-950">{brand.expiredUsers}</p>
          </div>
          <div className="panel p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Keys Issued</p>
            <p className="mono mt-3 text-3xl font-black text-slate-950">{brand.keysIssued}</p>
          </div>
          <div className="panel p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Signals Today</p>
            <p className="mono mt-3 text-3xl font-black text-slate-950">{brand.signalsToday}</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-4">
            <h2 className="text-lg font-black text-slate-950">Infrastructure</h2>
            <div className="mt-4 space-y-2">
              {healthRows.map(([label, value, Icon]) => (
                <div key={label as string} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="icon-button" aria-hidden="true">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-black text-slate-950">{label as string}</p>
                  </div>
                  <p className="text-xs font-extrabold text-slate-500">{value as string}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-4">
            <h2 className="text-lg font-black text-slate-950">Core Flow Readiness</h2>
            <div className="mt-4 space-y-2">
              {flowRows.map(([label, value, Icon]) => (
                <div key={label as string} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="icon-button" aria-hidden="true">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-black text-slate-950">{label as string}</p>
                  </div>
                  <p className="inline-flex items-center gap-2 text-xs font-extrabold text-amber-700">
                    <CircleAlert className="h-4 w-4" />
                    {value as string}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
