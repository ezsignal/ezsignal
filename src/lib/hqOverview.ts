import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { brands, type BrandId } from "@/lib/registry";

type BrandLiveMetrics = {
  activeUsers: number;
  expiredUsers: number;
  keysIssued: number;
  signalsToday: number;
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
  brands: Record<BrandId, BrandLiveMetrics>;
};

type FilterDefinition =
  | { op: "eq"; column: string; value: string | number | boolean }
  | { op: "gte"; column: string; value: string | number };

const SIGNAL_TABLE = "signals";
const SUBSCRIBER_TABLE = "subscribers";
const ACCESS_KEY_TABLE = "access_keys";

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
    query = query.gte(filter.column, filter.value);
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

  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const todayStartIso = now.toISOString();

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

    return {
      source: "database",
      generatedAt: new Date().toISOString(),
      totals,
      brands: brandMetrics,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
