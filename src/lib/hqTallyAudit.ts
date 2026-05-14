import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brands, type BrandId } from "@/lib/registry";
import { getHqSupabaseServiceClient, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";

type FilterValue = string | number | boolean;
type FilterDefinition =
  | { op: "eq"; column: string; value: FilterValue }
  | { op: "gte"; column: string; value: FilterValue }
  | { op: "in"; column: string; values: FilterValue[] };

type BrandTallies = {
  activeUsers: number;
  expiredUsers: number;
  keysIssued: number;
  signalsToday: number;
  performanceLogs: number;
};

type Totals = {
  activeUsers: number;
  expiredUsers: number;
  keysIssued: number;
  signalsToday: number;
  performanceLogs: number;
};

type TableCoverage = {
  table: "subscribers" | "access_keys" | "signals" | "performance_logs";
  totalRows: number;
  knownBrandRows: number;
  unknownBrandRows: number;
};

export type HqTallyAudit = {
  generatedAt: string;
  runtime: {
    backend: "database" | "memory";
    dbConfigured: boolean;
  };
  knownBrandIds: BrandId[];
  brandCount: number;
  brands: Record<BrandId, BrandTallies>;
  totals: Totals;
  global: Totals;
  coverage: TableCoverage[];
  gaps: {
    activeUsers: number;
    expiredUsers: number;
    keysIssued: number;
    signalsToday: number;
    performanceLogs: number;
  };
  healthy: boolean;
  issues: string[];
};

const SUBSCRIBER_TABLE = "subscribers";
const ACCESS_KEY_TABLE = "access_keys";
const SIGNAL_TABLE = "signals";
const PERFORMANCE_LOG_TABLE = "performance_logs";

function utcDayStartIso() {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
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
    query = query.in(filter.column, filter.values);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`[HQ tally] Count query failed for ${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function getCoverageForTable(
  supabase: SupabaseClient,
  table: TableCoverage["table"],
  knownBrandIds: BrandId[],
) {
  const [totalRows, knownBrandRows] = await Promise.all([
    countRows(supabase, table),
    countRows(supabase, table, [{ op: "in", column: "brand_id", values: knownBrandIds }]),
  ]);

  return {
    table,
    totalRows,
    knownBrandRows,
    unknownBrandRows: Math.max(0, totalRows - knownBrandRows),
  };
}

async function getBrandTallies(
  supabase: SupabaseClient,
  brandId: BrandId,
  todayStart: string,
): Promise<BrandTallies> {
  const [activeUsers, expiredUsers, keysIssued, signalsToday, performanceLogs] =
    await Promise.all([
      countRows(supabase, SUBSCRIBER_TABLE, [
        { op: "eq", column: "brand_id", value: brandId },
        { op: "eq", column: "status", value: "active" },
      ]),
      countRows(supabase, SUBSCRIBER_TABLE, [
        { op: "eq", column: "brand_id", value: brandId },
        { op: "eq", column: "status", value: "expired" },
      ]),
      countRows(supabase, ACCESS_KEY_TABLE, [
        { op: "eq", column: "brand_id", value: brandId },
      ]),
      countRows(supabase, SIGNAL_TABLE, [
        { op: "eq", column: "brand_id", value: brandId },
        { op: "gte", column: "created_at", value: todayStart },
      ]),
      countRows(supabase, PERFORMANCE_LOG_TABLE, [
        { op: "eq", column: "brand_id", value: brandId },
      ]),
    ]);

  return {
    activeUsers,
    expiredUsers,
    keysIssued,
    signalsToday,
    performanceLogs,
  };
}

export async function getHqTallyAudit(): Promise<HqTallyAudit | null> {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) return null;

  const knownBrandIds = brands.map((brand) => brand.id);
  const todayStart = utcDayStartIso();

  try {
    const brandEntries = await Promise.all(
      knownBrandIds.map(async (brandId) => [
        brandId,
        await getBrandTallies(supabase, brandId, todayStart),
      ] as const),
    );

    const brandTallies = Object.fromEntries(brandEntries) as Record<
      BrandId,
      BrandTallies
    >;

    const totals = Object.values(brandTallies).reduce<Totals>(
      (acc, tally) => {
        acc.activeUsers += tally.activeUsers;
        acc.expiredUsers += tally.expiredUsers;
        acc.keysIssued += tally.keysIssued;
        acc.signalsToday += tally.signalsToday;
        acc.performanceLogs += tally.performanceLogs;
        return acc;
      },
      {
        activeUsers: 0,
        expiredUsers: 0,
        keysIssued: 0,
        signalsToday: 0,
        performanceLogs: 0,
      },
    );

    const [globalActiveUsers, globalExpiredUsers, globalKeysIssued, globalSignalsToday, globalPerformanceLogs, coverage] = await Promise.all([
      countRows(supabase, SUBSCRIBER_TABLE, [
        { op: "eq", column: "status", value: "active" },
      ]),
      countRows(supabase, SUBSCRIBER_TABLE, [
        { op: "eq", column: "status", value: "expired" },
      ]),
      countRows(supabase, ACCESS_KEY_TABLE),
      countRows(supabase, SIGNAL_TABLE, [
        { op: "gte", column: "created_at", value: todayStart },
      ]),
      countRows(supabase, PERFORMANCE_LOG_TABLE),
      Promise.all([
        getCoverageForTable(supabase, SUBSCRIBER_TABLE, knownBrandIds),
        getCoverageForTable(supabase, ACCESS_KEY_TABLE, knownBrandIds),
        getCoverageForTable(supabase, SIGNAL_TABLE, knownBrandIds),
        getCoverageForTable(supabase, PERFORMANCE_LOG_TABLE, knownBrandIds),
      ]),
    ]);

    const global: Totals = {
      activeUsers: globalActiveUsers,
      expiredUsers: globalExpiredUsers,
      keysIssued: globalKeysIssued,
      signalsToday: globalSignalsToday,
      performanceLogs: globalPerformanceLogs,
    };

    const gaps = {
      activeUsers: global.activeUsers - totals.activeUsers,
      expiredUsers: global.expiredUsers - totals.expiredUsers,
      keysIssued: global.keysIssued - totals.keysIssued,
      signalsToday: global.signalsToday - totals.signalsToday,
      performanceLogs: global.performanceLogs - totals.performanceLogs,
    };

    const issues: string[] = [];
    if (gaps.activeUsers !== 0) {
      issues.push(`Active users mismatch: global=${global.activeUsers}, brand-sum=${totals.activeUsers}`);
    }
    if (gaps.expiredUsers !== 0) {
      issues.push(`Expired users mismatch: global=${global.expiredUsers}, brand-sum=${totals.expiredUsers}`);
    }
    if (gaps.keysIssued !== 0) {
      issues.push(`Access keys mismatch: global=${global.keysIssued}, brand-sum=${totals.keysIssued}`);
    }
    if (gaps.signalsToday !== 0) {
      issues.push(`Signals today mismatch: global=${global.signalsToday}, brand-sum=${totals.signalsToday}`);
    }
    if (gaps.performanceLogs !== 0) {
      issues.push(`Performance logs mismatch: global=${global.performanceLogs}, brand-sum=${totals.performanceLogs}`);
    }

    for (const row of coverage) {
      if (row.unknownBrandRows > 0) {
        issues.push(
          `${row.table} has ${row.unknownBrandRows} row(s) with unknown or missing brand_id.`,
        );
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      runtime: getWebhookRuntimeMeta(),
      knownBrandIds,
      brandCount: knownBrandIds.length,
      brands: brandTallies,
      totals,
      global,
      coverage,
      gaps,
      healthy: issues.length === 0,
      issues,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
