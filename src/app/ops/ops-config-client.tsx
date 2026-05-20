"use client";

import { useEffect, useMemo, useState } from "react";

type Flags = {
  enabled: boolean;
  shadowMode: boolean;
  fanoutEnabled: boolean;
  dbFanoutEnabled: boolean;
  allowHttpFanoutWithDb: boolean;
  eagerDispatchEnabled: boolean;
  performanceEditorEnabled: boolean;
  source?: "database" | "env";
};

type DiffRow = {
  brandId: string;
  webhookEnabled: boolean;
  fanoutEnabled: boolean;
  routingMode: string;
  scalingMultiplier: number;
  promoCode: string | null;
  promoActive: boolean | null;
  updatedAt: string;
};

export default function OpsConfigClient() {
  const [adminKey, setAdminKey] = useState("");
  const [flags, setFlags] = useState<Flags | null>(null);
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setLoading(true);
    setStatus("");
    try {
      const [flagsRes, diffRes] = await Promise.all([
        fetch("/api/hq/webhook-flags", { cache: "no-store" }),
        fetch("/api/hq/brands/config-diff", { cache: "no-store" }),
      ]);
      const flagsJson = await flagsRes.json();
      const diffJson = await diffRes.json();
      if (!flagsRes.ok || !flagsJson.ok) throw new Error(flagsJson.error ?? "Failed loading webhook flags.");
      if (!diffRes.ok || !diffJson.ok) throw new Error(diffJson.error ?? "Failed loading brand diff.");
      setFlags(flagsJson.flags as Flags);
      setRows((diffJson.data ?? []) as DiffRow[]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed loading ops config.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAdminKey(window.localStorage.getItem("HQ_ADMIN_KEY") ?? "");
    }
    void loadAll();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = adminKey.trim();
    if (!key) window.localStorage.removeItem("HQ_ADMIN_KEY");
    else window.localStorage.setItem("HQ_ADMIN_KEY", key);
  }, [adminKey]);

  async function patchFlags(payload: Partial<Flags>, successLabel: string) {
    const key = adminKey.trim();
    if (!key) {
      setStatus("Isi HQ admin key dulu.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/hq/webhook-flags", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-key": key },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed updating flags.");
      setStatus(successLabel);
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed updating flags.");
    } finally {
      setLoading(false);
    }
  }

  const scaleByBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.brandId, row.scalingMultiplier);
    return map;
  }, [rows]);

  return (
    <>
      <section className="mb-6 panel p-4">
        <h1 className="text-2xl font-black text-slate-950">Ops Config</h1>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Manage webhook runtime and compare brand config without touching Vercel/Supabase manually.
        </p>
        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="HQ admin key"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
          />
          <button className="text-button" disabled={loading} onClick={() => void patchFlags({
            enabled: true,
            shadowMode: false,
            dbFanoutEnabled: true,
            allowHttpFanoutWithDb: false,
            fanoutEnabled: true,
            eagerDispatchEnabled: true,
          }, "Applied preset: Production Safe.")}>
            Production Safe
          </button>
          <button className="text-button" disabled={loading} onClick={() => void patchFlags({
            enabled: true,
            shadowMode: true,
            dbFanoutEnabled: false,
            allowHttpFanoutWithDb: false,
            fanoutEnabled: false,
          }, "Applied preset: Debug Shadow.")}>
            Debug Shadow
          </button>
          <button className="text-button" disabled={loading} onClick={() => void patchFlags({
            enabled: true,
            shadowMode: false,
            dbFanoutEnabled: true,
            allowHttpFanoutWithDb: true,
            fanoutEnabled: true,
            eagerDispatchEnabled: true,
          }, "Applied preset: Hybrid (DB+HTTP).")}>
            Hybrid DB+HTTP
          </button>
        </div>

        {flags ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
            Source: <span className="font-black">{flags.source ?? "env"}</span> | Enabled: {String(flags.enabled)} |
            Shadow: {String(flags.shadowMode)} | DB Fanout: {String(flags.dbFanoutEnabled)} | HTTP Fanout: {String(flags.fanoutEnabled)} |
            Allow HTTP+DB: {String(flags.allowHttpFanoutWithDb)}
          </div>
        ) : null}
        {status ? <p className="mt-2 text-xs font-bold text-sky-700">{status}</p> : null}
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-black text-slate-950">Brand Diff Checker</h2>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Compare scaling, routing, fanout and promo state across brands.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="data-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Scaling</th>
                <th>Webhook</th>
                <th>Fanout</th>
                <th>Routing</th>
                <th>Promo</th>
                <th>Updated (MYT)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const baseline = scaleByBrand.get("kafra") ?? 1;
                const mismatch = Math.abs(row.scalingMultiplier - baseline) > 0.000001;
                return (
                  <tr key={row.brandId}>
                    <td className="mono">{row.brandId}</td>
                    <td className={mismatch ? "text-amber-700" : ""}>{row.scalingMultiplier}</td>
                    <td>{row.webhookEnabled ? "ON" : "OFF"}</td>
                    <td>{row.fanoutEnabled ? "ON" : "OFF"}</td>
                    <td>{row.routingMode}</td>
                    <td>{row.promoCode ? `${row.promoCode} (${row.promoActive ? "active" : "inactive"})` : "-"}</td>
                    <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString("en-GB", { hour12: false, timeZone: "Asia/Kuala_Lumpur" }) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
