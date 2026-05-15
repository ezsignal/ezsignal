import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { brands, type BrandId } from "@/lib/registry";
import { getTradingDayRangeIso } from "@/lib/hqTradingDay";
import { getHqTradingDaySettings } from "@/lib/hqTradingDaySettings";

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
  brands: Record<BrandId, BrandLiveMetrics>;
};

type FilterDefinition =
  | { op: "eq"; column: string; value: string | number | boolean }
  | { op: "gte"; column: string; value: string | number }
  | { op: "lte"; column: string; value: string | number };

const SIGNAL_TABLE = "signals";
const SUBSCRIBER_TABLE = "subscribers";
const ACCESS_KEY_TABLE = "access_keys";
const HQ_MASTER_BRAND_ID: BrandId = "kafra";

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

export async function getHqOverviewSnapshot(): Promise<HqOverviewSnapshot | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const boundary = await getHqTradingDaySettings(supabase);
  const { startIso: todayStartIso, endIso: todayEndIso } = getTradingDayRangeIso(boundary);

  try {
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
      brands: brandMetrics,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
