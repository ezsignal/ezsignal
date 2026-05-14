import "server-only";
import { brands, type BrandId } from "@/lib/registry";
import { getHqSupabaseServiceClient } from "@/lib/hqWebhookRuntime";

type FilterValue = string | number | boolean;
type FilterDefinition =
  | { op: "eq"; column: string; value: FilterValue }
  | { op: "gte"; column: string; value: FilterValue }
  | { op: "lte"; column: string; value: FilterValue };

export type AccessKeyRow = {
  id: string;
  brandId: BrandId;
  label: string | null;
  keyPreview: string;
  isActive: boolean;
  expiredAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type SignalRow = {
  id: string;
  brandId: BrandId;
  pair: string;
  action: "buy" | "sell";
  entry: number;
  stopLoss: number | null;
  takeProfit1: number | null;
  status: string;
  createdAt: string;
};

export type SecurityAlertRow = {
  id: string;
  brandId: BrandId;
  reason: string;
  keyPreview: string;
  fingerprintId: string | null;
  ipAddress: string | null;
  createdAt: string;
};

function utcDayStartIso() {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
}

async function countRows(table: string, filters: FilterDefinition[] = []) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) return 0;

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
  const { count } = await query;
  return count ?? 0;
}

function sanitizeBrandId(brandId: string | undefined): BrandId | null {
  if (!brandId) return null;
  const normalized = brandId.trim().toLowerCase();
  const all = brands.map((brand) => brand.id);
  return all.includes(normalized as BrandId) ? (normalized as BrandId) : null;
}

function maskSecret(value: string | null | undefined) {
  if (!value || value.length === 0) return "-";
  const clean = value.trim();
  if (clean.length <= 4) return "*".repeat(clean.length);
  return `${clean.slice(0, 4)}...${clean.slice(-2)}`;
}

export async function loadAccessKeysPageData(input: {
  brandId?: string;
  limit?: number;
}) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return {
      ok: false as const,
      error: "HQ Supabase service client is not configured.",
    };
  }

  const targetBrandId = sanitizeBrandId(input.brandId);
  const limit = Math.max(10, Math.min(200, input.limit ?? 80));
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("access_keys")
    .select("id, brand_id, key, key_hash, label, is_active, expired_at, last_login_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (targetBrandId) {
    query = query.eq("brand_id", targetBrandId);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false as const, error: error.message };
  }

  const rows: AccessKeyRow[] = (data ?? []).map((row) => {
    const keyRaw = typeof row.key === "string" ? row.key : null;
    const hashRaw = typeof row.key_hash === "string" ? row.key_hash : null;
    return {
      id: String(row.id),
      brandId: String(row.brand_id) as BrandId,
      label: typeof row.label === "string" ? row.label : null,
      keyPreview: maskSecret(keyRaw ?? hashRaw),
      isActive: Boolean(row.is_active),
      expiredAt: row.expired_at ? String(row.expired_at) : null,
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      createdAt: String(row.created_at),
    };
  });

  const [activeKeys, expiredKeys, totalKeys, todayIssued] = await Promise.all([
    countRows("access_keys", [
      ...(targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId } as const] : []),
      { op: "eq", column: "is_active", value: true },
    ]),
    countRows("access_keys", [
      ...(targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId } as const] : []),
      { op: "lte", column: "expired_at", value: nowIso },
    ]),
    countRows("access_keys", targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId }] : []),
    countRows("access_keys", [
      ...(targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId } as const] : []),
      { op: "gte", column: "created_at", value: utcDayStartIso() },
    ]),
  ]);

  return {
    ok: true as const,
    brandId: targetBrandId,
    rows,
    stats: {
      totalKeys,
      activeKeys,
      expiredKeys,
      todayIssued,
    },
  };
}

export async function loadSignalsPageData(input: {
  brandId?: string;
  limit?: number;
}) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return {
      ok: false as const,
      error: "HQ Supabase service client is not configured.",
    };
  }

  const targetBrandId = sanitizeBrandId(input.brandId);
  const limit = Math.max(10, Math.min(200, input.limit ?? 80));

  let query = supabase
    .from("signals")
    .select("id, brand_id, pair, action, entry, stop_loss, take_profit_1, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (targetBrandId) {
    query = query.eq("brand_id", targetBrandId);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false as const, error: error.message };
  }

  const rows: SignalRow[] = (data ?? []).map((row) => ({
    id: String(row.id),
    brandId: String(row.brand_id) as BrandId,
    pair: String(row.pair ?? "XAUUSD"),
    action: String(row.action ?? "buy") as "buy" | "sell",
    entry: Number(row.entry ?? 0),
    stopLoss: row.stop_loss === null ? null : Number(row.stop_loss),
    takeProfit1: row.take_profit_1 === null ? null : Number(row.take_profit_1),
    status: String(row.status ?? "active"),
    createdAt: String(row.created_at),
  }));

  const [signalsToday, totalSignals] = await Promise.all([
    countRows("signals", [
      ...(targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId } as const] : []),
      { op: "gte", column: "created_at", value: utcDayStartIso() },
    ]),
    countRows("signals", targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId }] : []),
  ]);

  return {
    ok: true as const,
    brandId: targetBrandId,
    rows,
    stats: {
      totalSignals,
      signalsToday,
    },
  };
}

export async function loadSecurityPageData(input: {
  brandId?: string;
  limit?: number;
}) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return {
      ok: false as const,
      error: "HQ Supabase service client is not configured.",
    };
  }

  const targetBrandId = sanitizeBrandId(input.brandId);
  const limit = Math.max(10, Math.min(200, input.limit ?? 80));

  let query = supabase
    .from("security_alerts")
    .select("id, brand_id, key, reason, fingerprint_id, ip_address, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (targetBrandId) {
    query = query.eq("brand_id", targetBrandId);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false as const, error: error.message };
  }

  const rows: SecurityAlertRow[] = (data ?? []).map((row) => ({
    id: String(row.id),
    brandId: String(row.brand_id) as BrandId,
    reason: String(row.reason ?? "unknown"),
    keyPreview: maskSecret(typeof row.key === "string" ? row.key : null),
    fingerprintId: row.fingerprint_id ? String(row.fingerprint_id) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    createdAt: String(row.created_at),
  }));

  const [alerts24h, alerts7d, totalAlerts] = await Promise.all([
    countRows("security_alerts", [
      ...(targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId } as const] : []),
      {
        op: "gte",
        column: "created_at",
        value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
    ]),
    countRows("security_alerts", [
      ...(targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId } as const] : []),
      {
        op: "gte",
        column: "created_at",
        value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]),
    countRows(
      "security_alerts",
      targetBrandId ? [{ op: "eq", column: "brand_id", value: targetBrandId }] : [],
    ),
  ]);

  return {
    ok: true as const,
    brandId: targetBrandId,
    rows,
    stats: {
      totalAlerts,
      alerts24h,
      alerts7d,
    },
  };
}
