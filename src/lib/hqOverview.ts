import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { brands, type BrandId } from "@/lib/registry";
import { getTradingDayRangeIso } from "@/lib/hqTradingDay";
import { getHqTradingDaySettings } from "@/lib/hqTradingDaySettings";
import { resolveHqOpsTelegramForDispatch } from "@/lib/hqOpsTelegramSettings";

type BrandLiveMetrics = {
  activeUsers: number;
  expiredUsers: number;
  keysIssued: number;
  signalsToday: number;
};

export type HqTopAgent = {
  name: string;
  totalUsers: number;
  activeUsers: number;
  brands: string[];
};

export type HqPackageMix = {
  packageName: string;
  totalUsers: number;
  activeUsers: number;
};

export type HqOverviewSnapshot = {
  source: "database";
  generatedAt: string;
  totals: {
    activeUsers: number;
    expiredUsers: number;
    keysIssued: number;
    signalsToday: number;
  };
  overview: {
    newUsersToday: number;
    signalsTodayHqMaster: number;
    activePackageTypes: number;
    expiringToday: number;
    activeBrandsToday: number;
  };
  topAgents: HqTopAgent[];
  packageMix: HqPackageMix[];
  opsAlerts: HqOpsAlert[];
  brands: Record<BrandId, BrandLiveMetrics>;
};

export type HqOpsAlert = {
  key: string;
  brandId: BrandId | null;
  mode: "scalping" | "intraday" | null;
  severity: "critical" | "warning";
  title: string;
  message: string;
};

type FilterDefinition =
  | { op: "eq"; column: string; value: string | number | boolean }
  | { op: "gte"; column: string; value: string | number }
  | { op: "lte"; column: string; value: string | number };

const SIGNAL_TABLE = "signals";
const SUBSCRIBER_TABLE = "subscribers";
const ACCESS_KEY_TABLE = "access_keys";
const TELEGRAM_BOT_TABLE = "telegram_bots";
const OPS_ALERT_STATE_TABLE = "hq_ops_alert_state";
const HQ_MASTER_BRAND_ID: BrandId = "kafra";
const TELEGRAM_REGISTRATION_BOT_NAME = "registration_alert";
const OPS_ALERT_COOLDOWN_MINUTES = Math.max(5, Number(process.env.HQ_OPS_ALERT_COOLDOWN_MINUTES ?? "20"));
const SCALPING_STALE_MINUTES = Math.max(10, Number(process.env.HQ_OPS_SCALPING_STALE_MINUTES ?? "45"));
const INTRADAY_STALE_MINUTES = Math.max(60, Number(process.env.HQ_OPS_INTRADAY_STALE_MINUTES ?? "300"));

type SignalMode = "scalping" | "intraday";

type ActiveSignalRow = {
  id: string;
  brandId: BrandId;
  mode: SignalMode;
  livePrice: number | null;
  pair: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type OpsAlertStateRow = {
  alert_key: string;
  status: string;
  last_sent_at: string | null;
};

function normalizePackageName(raw: unknown) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "Unknown";
  const normalized = text.toLowerCase();

  // Standardize all trial variants into one bucket (3 days).
  if (normalized.includes("trial")) {
    return "Trial 3D";
  }

  return text.toUpperCase();
}

function normalizeAgentName(raw: unknown) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "Direct";
  const lowered = text.toLowerCase();
  if (lowered === "null" || lowered === "n/a" || lowered === "-") return "Direct";
  return text;
}

function parseChatIds(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseNumber(raw: unknown) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseIsoDate(raw: string | null | undefined) {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function minutesSince(value: string | null | undefined) {
  const date = parseIsoDate(value);
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60));
}

function alertTitleForMode(mode: SignalMode) {
  return mode === "scalping" ? "Scalping feed issue" : "Intraday feed issue";
}

function buildActiveSignalMap(rows: ActiveSignalRow[]) {
  const map = new Map<string, ActiveSignalRow>();
  for (const row of rows) {
    const key = `${row.brandId}:${row.mode}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const currentStamp = parseIsoDate(row.updatedAt ?? row.createdAt)?.getTime() ?? 0;
    const existingStamp = parseIsoDate(existing.updatedAt ?? existing.createdAt)?.getTime() ?? 0;
    if (currentStamp >= existingStamp) {
      map.set(key, row);
    }
  }
  return map;
}

async function loadOpsAlerts(supabase: SupabaseClient): Promise<HqOpsAlert[]> {
  const brandIds = brands.map((brand) => brand.id);
  const { data, error } = await supabase
    .from(SIGNAL_TABLE)
    .select("id,brand_id,mode,live_price,pair,created_at,updated_at")
    .in("brand_id", brandIds)
    .eq("status", "active")
    .in("mode", ["scalping", "intraday"]);

  if (error) {
    throw new Error(`[HQ overview] Failed loading active signal state: ${error.message}`);
  }

  const activeRows: ActiveSignalRow[] = (data ?? []).map((row) => ({
    id: String(row.id),
    brandId: String(row.brand_id) as BrandId,
    mode: row.mode === "intraday" ? "intraday" : "scalping",
    livePrice: parseNumber(row.live_price),
    pair: typeof row.pair === "string" && row.pair.trim().length > 0 ? row.pair.trim().toUpperCase() : "XAUUSD",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  }));

  const latestByMode = buildActiveSignalMap(activeRows);
  const alerts: HqOpsAlert[] = [];

  for (const brand of brands) {
    for (const mode of ["scalping", "intraday"] as const) {
      const key = `${brand.id}:${mode}`;
      const row = latestByMode.get(key);
      if (!row) {
        alerts.push({
          key: `missing-active:${brand.id}:${mode}`,
          brandId: brand.id,
          mode,
          severity: "critical",
          title: `${brand.displayName} ${mode.toUpperCase()} missing active signal`,
          message: `${alertTitleForMode(mode)}. No active signal found for ${brand.displayName}.`,
        });
        continue;
      }

      const staleMinutes = minutesSince(row.updatedAt ?? row.createdAt);
      const staleThreshold = mode === "intraday" ? INTRADAY_STALE_MINUTES : SCALPING_STALE_MINUTES;

      if (row.livePrice === null || row.livePrice <= 0) {
        alerts.push({
          key: `live-price-zero:${brand.id}:${mode}`,
          brandId: brand.id,
          mode,
          severity: "warning",
          title: `${brand.displayName} ${mode.toUpperCase()} live price not updated`,
          message: `Active signal exists but live price is empty/0 for ${brand.displayName}.`,
        });
      }

      if (staleMinutes !== null && staleMinutes > staleThreshold) {
        alerts.push({
          key: `stale-feed:${brand.id}:${mode}`,
          brandId: brand.id,
          mode,
          severity: "warning",
          title: `${brand.displayName} ${mode.toUpperCase()} feed looks stale`,
          message: `No update for about ${staleMinutes} minutes (threshold ${staleThreshold}m).`,
        });
      }
    }
  }

  return alerts;
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Telegram HTTP ${response.status}`);
  }
}

function buildAlertMessage(alert: HqOpsAlert) {
  const time = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour12: false });
  const severity = alert.severity === "critical" ? "CRITICAL" : "WARNING";
  return [
    "*HQ OPS ALERT*",
    `Severity: *${severity}*`,
    `Brand: *${alert.brandId?.toUpperCase() ?? "ALL"}*`,
    `Mode: *${alert.mode?.toUpperCase() ?? "-"}*`,
    `Issue: ${alert.title}`,
    `Detail: ${alert.message}`,
    `Time: ${time} MYT`,
  ].join("\n");
}

async function dispatchOpsAlertsToTelegram(supabase: SupabaseClient, alerts: HqOpsAlert[]) {
  const nowIso = new Date().toISOString();
  const alertMap = new Map(alerts.map((alert) => [alert.key, alert]));
  const alertKeys = Array.from(alertMap.keys());

  const existingStateRes = await supabase
    .from(OPS_ALERT_STATE_TABLE)
    .select("alert_key,status,last_sent_at");

  if (existingStateRes.error) {
    const code = (existingStateRes.error as { code?: string }).code;
    if (code === "42P01") {
      console.warn("[HQ ops] Missing table hq_ops_alert_state. Run SQL migration first.");
      return;
    }
    console.warn("[HQ ops] Failed reading alert state:", existingStateRes.error.message);
    return;
  }

  const stateRows = (existingStateRes.data ?? []) as OpsAlertStateRow[];
  const stateMap = new Map(stateRows.map((row) => [row.alert_key, row]));
  const activeStateKeys = stateRows.filter((row) => row.status === "active").map((row) => row.alert_key);
  const resolvedKeys = activeStateKeys.filter((key) => !alertMap.has(key));

  if (alertKeys.length > 0) {
    const upsertRows = alerts.map((alert) => ({
      alert_key: alert.key,
      brand_id: alert.brandId,
      mode: alert.mode,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      status: "active",
      last_seen_at: nowIso,
      updated_at: nowIso,
    }));
    const upsertRes = await supabase.from(OPS_ALERT_STATE_TABLE).upsert(upsertRows, { onConflict: "alert_key" });
    if (upsertRes.error) {
      console.warn("[HQ ops] Failed upserting active alerts:", upsertRes.error.message);
    }
  }

  if (resolvedKeys.length > 0) {
    const resolveRes = await supabase
      .from(OPS_ALERT_STATE_TABLE)
      .update({
        status: "resolved",
        resolved_at: nowIso,
        updated_at: nowIso,
      })
      .in("alert_key", resolvedKeys);
    if (resolveRes.error) {
      console.warn("[HQ ops] Failed marking resolved alerts:", resolveRes.error.message);
    }
  }

  const coolDownMs = OPS_ALERT_COOLDOWN_MINUTES * 60 * 1000;
  const needsSend = alerts.filter((alert) => {
    const state = stateMap.get(alert.key);
    if (!state?.last_sent_at) return true;
    const sentAt = parseIsoDate(state.last_sent_at);
    if (!sentAt) return true;
    return Date.now() - sentAt.getTime() >= coolDownMs;
  });

  if (needsSend.length === 0) {
    return;
  }

  const hqTelegram = await resolveHqOpsTelegramForDispatch();
  if (hqTelegram) {
    const sentKeys = new Set<string>();
    for (const alert of needsSend) {
      let ok = true;
      for (const chatId of hqTelegram.chatIds) {
        try {
          await sendTelegramMessage(hqTelegram.token, chatId, buildAlertMessage(alert));
        } catch (error) {
          ok = false;
          console.warn("[HQ ops] HQ Telegram send failed:", error);
        }
      }
      if (ok) sentKeys.add(alert.key);
    }
    if (sentKeys.size > 0) {
      const updateRes = await supabase
        .from(OPS_ALERT_STATE_TABLE)
        .update({ last_sent_at: nowIso, updated_at: nowIso })
        .in("alert_key", Array.from(sentKeys));
      if (updateRes.error) {
        console.warn("[HQ ops] Failed updating last_sent_at:", updateRes.error.message);
      }
    }
    return;
  }

  const botsRes = await supabase
    .from(TELEGRAM_BOT_TABLE)
    .select("brand_id,bot_name,bot_token_secret_ref,channel_id,is_active")
    .eq("bot_name", TELEGRAM_REGISTRATION_BOT_NAME)
    .eq("is_active", true)
    .in("brand_id", brands.map((brand) => brand.id));

  if (botsRes.error) {
    console.warn("[HQ ops] Failed loading telegram bots:", botsRes.error.message);
    return;
  }

  const botByBrand = new Map<BrandId, { token: string; chatIds: string[] }>();
  for (const row of botsRes.data ?? []) {
    const brandId = typeof row.brand_id === "string" ? row.brand_id as BrandId : null;
    const token = typeof row.bot_token_secret_ref === "string" ? row.bot_token_secret_ref.trim() : "";
    const chatIds = parseChatIds(typeof row.channel_id === "string" ? row.channel_id : "");
    if (!brandId || !token || chatIds.length === 0) continue;
    botByBrand.set(brandId, { token, chatIds });
  }

  const sentKeys = new Set<string>();
  for (const alert of needsSend) {
    if (!alert.brandId) continue;
    const bot = botByBrand.get(alert.brandId);
    if (!bot) continue;

    let ok = true;
    for (const chatId of bot.chatIds) {
      try {
        await sendTelegramMessage(bot.token, chatId, buildAlertMessage(alert));
      } catch (error) {
        ok = false;
        console.warn("[HQ ops] Telegram send failed:", error);
      }
    }

    if (ok) sentKeys.add(alert.key);
  }

  if (sentKeys.size > 0) {
    const updateRes = await supabase
      .from(OPS_ALERT_STATE_TABLE)
      .update({ last_sent_at: nowIso, updated_at: nowIso })
      .in("alert_key", Array.from(sentKeys));
    if (updateRes.error) {
      console.warn("[HQ ops] Failed updating last_sent_at:", updateRes.error.message);
    }
  }
}

function labelForBrandId(brandId: string) {
  const found = brands.find((brand) => brand.id === brandId);
  return found ? found.displayName : brandId.toUpperCase();
}

function resolveSupabaseConfig() {
  const url = process.env.HQ_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.HQ_SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  return { url, serviceRoleKey };
}

function getSupabaseClient() {
  const { url, serviceRoleKey } = resolveSupabaseConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  filters: FilterDefinition[] = [],
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const filter of filters) {
    if (filter.op === "eq") {
      query = query.eq(filter.column, filter.value);
      continue;
    }
    if (filter.op === "gte") {
      query = query.gte(filter.column, filter.value);
      continue;
    }
    query = query.lte(filter.column, filter.value);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`[HQ overview] Count query failed for ${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function loadBrandMetrics(
  supabase: SupabaseClient,
  brandId: BrandId,
  todayStartIso: string,
): Promise<BrandLiveMetrics> {
  const [activeUsers, expiredUsers, keysIssued, signalsToday] = await Promise.all([
    countRows(supabase, SUBSCRIBER_TABLE, [
      { op: "eq", column: "brand_id", value: brandId },
      { op: "eq", column: "status", value: "active" },
    ]),
    countRows(supabase, SUBSCRIBER_TABLE, [
      { op: "eq", column: "brand_id", value: brandId },
      { op: "eq", column: "status", value: "expired" },
    ]),
    countRows(supabase, ACCESS_KEY_TABLE, [{ op: "eq", column: "brand_id", value: brandId }]),
    countRows(supabase, SIGNAL_TABLE, [
      { op: "eq", column: "brand_id", value: brandId },
      { op: "gte", column: "created_at", value: todayStartIso },
    ]),
  ]);

  return {
    activeUsers,
    expiredUsers,
    keysIssued,
    signalsToday,
  };
}

export async function getHqOverviewSnapshot(options?: { dispatchOpsAlerts?: boolean }): Promise<HqOverviewSnapshot | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const boundary = await getHqTradingDaySettings(supabase);
  const { startIso: todayStartIso, endIso: todayEndIso } = getTradingDayRangeIso(boundary);

  try {
    const opsAlerts = await loadOpsAlerts(supabase);
    if (options?.dispatchOpsAlerts) {
      await dispatchOpsAlertsToTelegram(supabase, opsAlerts);
    }

    const metricsEntries = await Promise.all(
      brands.map(async (brand) => [brand.id, await loadBrandMetrics(supabase, brand.id, todayStartIso)] as const),
    );

    const brandMetrics = Object.fromEntries(metricsEntries) as Record<BrandId, BrandLiveMetrics>;
    const totals = Object.values(brandMetrics).reduce(
      (acc, metric) => {
        acc.activeUsers += metric.activeUsers;
        acc.expiredUsers += metric.expiredUsers;
        acc.keysIssued += metric.keysIssued;
        acc.signalsToday += metric.signalsToday;
        return acc;
      },
      {
        activeUsers: 0,
        expiredUsers: 0,
        keysIssued: 0,
        signalsToday: 0,
      },
    );

    const [newUsersToday, signalsTodayHqMaster, expiringToday, subscribersLite] = await Promise.all([
      countRows(supabase, SUBSCRIBER_TABLE, [{ op: "gte", column: "created_at", value: todayStartIso }]),
      countRows(supabase, SIGNAL_TABLE, [
        { op: "eq", column: "brand_id", value: HQ_MASTER_BRAND_ID },
        { op: "gte", column: "created_at", value: todayStartIso },
      ]),
      countRows(supabase, ACCESS_KEY_TABLE, [
        { op: "gte", column: "expired_at", value: todayStartIso },
        { op: "lte", column: "expired_at", value: todayEndIso },
      ]),
      supabase
        .from(SUBSCRIBER_TABLE)
        .select("brand_id,package_name,introducer,status")
        .in("brand_id", brands.map((brand) => brand.id)),
    ]);

    if (subscribersLite.error) {
      throw new Error(`[HQ overview] Failed to load subscriber aggregates: ${subscribersLite.error.message}`);
    }

    const packageMap = new Map<string, { totalUsers: number; activeUsers: number }>();
    const agentMap = new Map<string, { totalUsers: number; activeUsers: number; brands: Set<string> }>();
    let activePackageTypes = 0;

    for (const row of subscribersLite.data ?? []) {
      const packageName = normalizePackageName(row.package_name);
      const agentName = normalizeAgentName(row.introducer);
      const isActive = String(row.status ?? "").toLowerCase() === "active";
      const brandLabel = labelForBrandId(typeof row.brand_id === "string" ? row.brand_id : "");

      const packageEntry = packageMap.get(packageName) ?? { totalUsers: 0, activeUsers: 0 };
      packageEntry.totalUsers += 1;
      if (isActive) packageEntry.activeUsers += 1;
      packageMap.set(packageName, packageEntry);

      const agentEntry = agentMap.get(agentName) ?? { totalUsers: 0, activeUsers: 0, brands: new Set<string>() };
      agentEntry.totalUsers += 1;
      if (isActive) agentEntry.activeUsers += 1;
      if (brandLabel) agentEntry.brands.add(brandLabel);
      agentMap.set(agentName, agentEntry);
    }

    activePackageTypes = [...packageMap.values()].filter((item) => item.activeUsers > 0).length;

    const topAgents = [...agentMap.entries()]
      .map(([name, values]) => ({
        name,
        totalUsers: values.totalUsers,
        activeUsers: values.activeUsers,
        brands: Array.from(values.brands).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => (b.activeUsers - a.activeUsers) || (b.totalUsers - a.totalUsers) || a.name.localeCompare(b.name))
      .slice(0, 5);

    const packageMix = [...packageMap.entries()]
      .map(([packageName, values]) => ({
        packageName,
        totalUsers: values.totalUsers,
        activeUsers: values.activeUsers,
      }))
      .sort((a, b) => (b.activeUsers - a.activeUsers) || (b.totalUsers - a.totalUsers) || a.packageName.localeCompare(b.packageName))
      .slice(0, 8);

    const activeBrandsToday = Object.values(brandMetrics).filter((item) => item.signalsToday > 0).length;

    return {
      source: "database",
      generatedAt: new Date().toISOString(),
      totals,
      overview: {
        newUsersToday,
        signalsTodayHqMaster,
        activePackageTypes,
        expiringToday,
        activeBrandsToday,
      },
      topAgents,
      packageMix,
      opsAlerts,
      brands: brandMetrics,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
