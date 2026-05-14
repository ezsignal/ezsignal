import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Database,
  ExternalLink,
  KeyRound,
  Layers3,
  LockKeyhole,
  Radio,
  RadioTower,
  RefreshCw,
  Settings2,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import WebhookStatusPanel from "@/app/webhook-status-panel";
import PerformanceEditorPanel from "@/app/performance-editor-panel";
import {
  brands,
  hqModules,
  migrationPhases,
  migrationProgress,
  nextTasks,
  parityBoard,
  systemLanes,
  totals,
} from "@/lib/registry";
import { getHqOverviewSnapshot } from "@/lib/hqOverview";

const fallbackTotals = totals();
const phasePercent = migrationProgress();

const statusStyles = {
  core: "text-teal-700 bg-teal-50 border-teal-200",
  synced: "text-blue-700 bg-blue-50 border-blue-200",
  watch: "text-amber-700 bg-amber-50 border-amber-200",
  draft: "text-rose-700 bg-rose-50 border-rose-200",
};

const phaseStyles = {
  done: "text-teal-700 bg-teal-50 border-teal-200",
  active: "text-blue-700 bg-blue-50 border-blue-200",
  pending: "text-slate-700 bg-slate-100 border-slate-200",
};

const checkStyles = {
  pass: "text-teal-700 bg-teal-50 border-teal-200",
  watch: "text-amber-700 bg-amber-50 border-amber-200",
  todo: "text-rose-700 bg-rose-50 border-rose-200",
};

function Sidebar({
  modeLabel,
  modeNote,
  modeSyncedAt,
}: {
  modeLabel: string;
  modeNote: string;
  modeSyncedAt: string | null;
}) {
  return (
    <aside className="sidebar">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-sm font-black text-white">
          EZ
        </div>
        <div>
          <p className="text-sm font-black tracking-[0.18em] text-slate-950">SIGNAL HQ</p>
          <p className="text-xs font-bold text-slate-500">Control Center</p>
        </div>
      </Link>

      <nav className="space-y-1">
        {[
          ["Overview", Layers3],
          ["Brands", Settings2],
          ["Access Keys", KeyRound],
          ["Signals", RadioTower],
          ["Performance", CircleAlert],
          ["Webhook", Radio],
          ["Supabase", Database],
          ["Security", LockKeyhole],
        ].map(([label, Icon]) => (
          <a
            key={label as string}
            href={`#${String(label).toLowerCase().replace(" ", "-")}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-100"
          >
            <Icon className="h-4 w-4" />
            {label as string}
          </a>
        ))}
      </nav>

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Mode</p>
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
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof UsersRound;
}) {
  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <div className="icon-button" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mono text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: keyof typeof statusStyles }) {
  const label = status === "core" ? "Core" : status === "synced" ? "Synced" : status === "watch" ? "Watch" : "Draft";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${statusStyles[status]}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function PhaseBadge({ status }: { status: keyof typeof phaseStyles }) {
  const label = status === "done" ? "Done" : status === "active" ? "Active" : "Pending";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${phaseStyles[status]}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function CheckBadge({ status }: { status: keyof typeof checkStyles }) {
  const label = status === "pass" ? "Pass" : status === "watch" ? "Watch" : "To Do";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black ${checkStyles[status]}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

export default async function Home() {
  const liveSnapshot = await getHqOverviewSnapshot();
  const total = liveSnapshot?.totals ?? fallbackTotals;
  const modeLabel = liveSnapshot ? "Live database" : "Demo registry";
  const modeNote = liveSnapshot
    ? "Metrics now read from shared Supabase in real time."
    : "Supabase metrics are unavailable, showing fallback registry data.";
  const modeSyncedAt = liveSnapshot
    ? new Date(liveSnapshot.generatedAt).toLocaleString("en-GB", { hour12: false })
    : null;
  const lanes = systemLanes.map((lane) =>
    lane.label === "Users"
      ? { ...lane, value: `${total.activeUsers} active` }
      : lane,
  );

  return (
    <div className="shell">
      <Sidebar modeLabel={modeLabel} modeNote={modeNote} modeSyncedAt={modeSyncedAt} />

      <main className="main">
        <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-teal-700">EZ SIGNAL operations</p>
            <h1 className="text-4xl font-black tracking-tight text-slate-950">HQ Overview</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              One operating console for core parity, brand health, access keys, signal control, Telegram routing, and multi-brand analytics.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="icon-button" title="Refresh registry" type="button">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="text-button primary-button" type="button">
              <Settings2 className="h-4 w-4" />
              Configure
            </button>
          </div>
        </section>

        <section id="overview" className="metric-grid mb-6">
          <MetricCard label="Active Users" value={String(total.activeUsers)} icon={UsersRound} />
          <MetricCard label="Expired Users" value={String(total.expiredUsers)} icon={CircleAlert} />
          <MetricCard label="Keys Issued" value={String(total.keysIssued)} icon={KeyRound} />
          <MetricCard label="Signals Today" value={String(total.signalsToday)} icon={RadioTower} />
        </section>

        <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_360px]">
          <div className="panel p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-slate-950">Execution Queue</h2>
                <p className="text-xs font-bold text-slate-500">Shared Supabase readiness tasks from HQ plan.</p>
              </div>
              <Link href="#supabase" className="text-button">
                SQL Plan
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-2">
              {nextTasks.map((task) => (
                <div key={task} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <CircleDashed className="mt-0.5 h-4 w-4 text-slate-400" />
                  <p className="text-sm font-bold text-slate-700">{task}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-4">
            <h2 className="text-lg font-black text-slate-950">Migration Progress</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">Shared Supabase rollout completion</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${phasePercent}%` }} />
            </div>
            <p className="mono mt-3 text-2xl font-black text-slate-950">{phasePercent}%</p>
            <p className="text-xs font-bold text-slate-500">Based on completed migration phases.</p>
          </div>
        </section>

        <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_360px]">
          <div id="brands" className="panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Brand Registry</h2>
                <p className="text-xs font-bold text-slate-500">Core and white label operating map.</p>
              </div>
              <Link href="#supabase" className="text-button">
                Schema Map
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="brand-grid">
              {brands.map((brand) => (
                <Link key={brand.id} href={`/brands/${brand.id}`} className="soft-panel block p-4 transition hover:border-slate-400 hover:bg-white">
                  {(() => {
                    const liveBrand = liveSnapshot?.brands[brand.id];
                    const activeUsers = liveBrand?.activeUsers ?? brand.activeUsers;
                    const keysIssued = liveBrand?.keysIssued ?? brand.keysIssued;
                    const signalsToday = liveBrand?.signalsToday ?? brand.signalsToday;
                    return (
                      <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-10 w-10 place-items-center rounded-lg text-sm font-black text-slate-950"
                        style={{ backgroundColor: `${brand.accent}33`, border: `1px solid ${brand.accent}` }}
                      >
                        {brand.displayName.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-950">{brand.displayName}</p>
                        <p className="text-xs font-bold text-slate-500">{brand.role}</p>
                      </div>
                    </div>
                    <StatusBadge status={brand.status} />
                  </div>
                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full" style={{ width: `${brand.parity}%`, backgroundColor: brand.accent }} />
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>Core parity</span>
                    <span className="mono text-slate-950">{brand.parity}%</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="mono text-lg font-black text-slate-950">{activeUsers}</p>
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Active</p>
                    </div>
                    <div>
                      <p className="mono text-lg font-black text-slate-950">{keysIssued}</p>
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Keys</p>
                    </div>
                    <div>
                      <p className="mono text-lg font-black text-slate-950">{signalsToday}</p>
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Signals</p>
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </Link>
              ))}
            </div>
          </div>

          <div className="panel p-4">
            <h2 className="text-lg font-black text-slate-950">System Lanes</h2>
            <div className="mt-4 space-y-2">
              {lanes.map((lane) => (
                <div key={lane.label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="icon-button" aria-hidden="true">
                      <lane.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-black text-slate-950">{lane.label}</p>
                  </div>
                  <p className="text-xs font-extrabold text-slate-500">{lane.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="access-keys" className="mb-6 module-grid">
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
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{module.description}</p>
            </div>
          ))}
        </section>

        <section id="signals" className="mb-6 panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Signal and Telegram Lanes</h2>
              <p className="text-xs font-bold text-slate-500">Cross-brand delivery and deployment visibility.</p>
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

        <PerformanceEditorPanel />

        <WebhookStatusPanel />

        <section id="security" className="mb-6 panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Security and Core Parity Board</h2>
              <p className="text-xs font-bold text-slate-500">Track access UI, package links, and admin flow parity by brand.</p>
            </div>
            <ShieldAlert className="h-4 w-4 text-slate-500" />
          </div>
          <div className="space-y-3">
            {brands.map((brand) => (
              <div key={`parity-${brand.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-950">{brand.displayName}</p>
                  <StatusBadge status={brand.status} />
                </div>
                <div className="space-y-2">
                  {parityBoard[brand.id].map((check) => (
                    <div key={`${brand.id}-${check.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
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

        <section id="supabase" className="table-shell">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
            <h2 className="text-sm font-black text-slate-950">Shared Supabase Migration Phases</h2>
            <p className="text-xs font-semibold text-slate-500">Execution status for one-database rollout.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {migrationPhases.map((phase) => (
                <div key={phase.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="mono text-xs font-black text-slate-900">Phase {phase.id}</p>
                    <PhaseBadge status={phase.status} />
                  </div>
                  <p className="text-xs font-bold text-slate-700">{phase.title}</p>
                  <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{phase.owner}</p>
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
                    <a className="inline-flex items-center gap-2 text-blue-700" href={`https://${brand.domain}`} target="_blank" rel="noreferrer">
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
      </main>
    </div>
  );
}
