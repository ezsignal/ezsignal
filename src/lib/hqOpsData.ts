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
  clientName: string | null;
  packageName: string | null;
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

function normalizePackageName(packageName: unknown) {
  const clean = typeof packageName === "string" ? packageName.trim() : "";
  if (!clean) return "";
  if (/trial/i.test(clean)) return "Trial 3D";
  const packageMatch = clean.match(/^package\s*(\d+)\s*d$/i);
  if (packageMatch) return `Package ${Number(packageMatch[1])}D`;
  return clean;
}

function normalizeLabelFromAccessKey(label: unknown) {
  const clean = typeof label === "string" ? label.trim() : "";
  if (!clean) return null;
  const pipeIndex = clean.indexOf("|");
  if (pipeIndex < 0) return clean;
  const left = clean.slice(0, pipeIndex).trim();
  const right = clean.slice(pipeIndex + 1).trim();
  const normalizedRight = normalizePackageName(right);
  if (!left) return normalizedRight || clean;
  if (!normalizedRight) return left;
  return `${left} | ${normalizedRight}`;
}

function composeLabelFromSubscriber(nameRaw: unknown, packageRaw: unknown) {
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const packageName = normalizePackageName(packageRaw);
  if (!name && !packageName) return null;
  if (!name) return packageName || null;
  if (!packageName) return name;
  return `${name} | ${packageName}`;
}

function splitClientAndPackage(label: string | null) {
  const clean = label?.trim() ?? "";
  if (!clean) return { clientName: null as string | null, packageName: null as string | null };
  const pipeIndex = clean.indexOf("|");
  if (pipeIndex < 0) return { clientName: clean, packageName: null as string | null };

  const left = clean.slice(0, pipeIndex).trim();
  const right = normalizePackageName(clean.slice(pipeIndex + 1).trim());
  return {
    clientName: left || null,
    packageName: right || null,
  };
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
    .select("id, brand_id, subscriber_id, key, key_hash, label, is_active, expired_at, last_login_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (targetBrandId) {
    query = query.eq("brand_id", targetBrandId);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false as const, error: error.message };
  }

  const subscriberIds = [...new Set((data ?? [])
    .map((row) => (typeof row.subscriber_id === "string" ? row.subscriber_id : ""))
    .filter((id) => id.length > 0))];

  const subscriberLookup = new Map<string, { name: string | null; packageName: string | null }>();
  if (subscriberIds.length > 0) {
    const { data: subscriberRows } = await supabase
      .from("subscribers")
      .select("id,brand_id,name,package_name")
      .in("id", subscriberIds);

    for (const row of subscriberRows ?? []) {
      const key = `${String(row.brand_id)}:${String(row.id)}`;
      subscriberLookup.set(key, {
        name: typeof row.name === "string" ? row.name : null,
        packageName: typeof row.package_name === "string" ? row.package_name : null,
      });
    }
  }

  const rows: AccessKeyRow[] = (data ?? []).map((row) => {
    const keyRaw = typeof row.key === "string" ? row.key : null;
    const hashRaw = typeof row.key_hash === "string" ? row.key_hash : null;
    const subscriberId = typeof row.subscriber_id === "string" ? row.subscriber_id : null;
    const subscriberKey = subscriberId ? `${String(row.brand_id)}:${subscriberId}` : "";
    const subscriber = subscriberLookup.get(subscriberKey);
    const resolvedLabel =
      composeLabelFromSubscriber(subscriber?.name, subscriber?.packageName) ??
      normalizeLabelFromAccessKey(row.label);
    const { clientName, packageName } = splitClientAndPackage(resolvedLabel);

    return {
      id: String(row.id),
      brandId: String(row.brand_id) as BrandId,
      label: resolvedLabel,
      clientName,
      packageName,
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
