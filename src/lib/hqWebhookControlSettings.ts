import "server-only";
import { getHqSupabaseServiceClient } from "@/lib/hqWebhookRuntime";

const SETTINGS_BRAND_ID = "kafra";

export type HqWebhookControlFlags = {
  enabled: boolean;
  shadowMode: boolean;
  fanoutEnabled: boolean;
  dbFanoutEnabled: boolean;
  allowHttpFanoutWithDb: boolean;
  eagerDispatchEnabled: boolean;
  performanceEditorEnabled: boolean;
  source: "database" | "env";
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readBooleanEnv(key: string, fallback: boolean) {
  const value = process.env[key];
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function readBoolean(record: Record<string, unknown>, keys: string[], fallback: boolean) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalized)) return true;
      if (["0", "false", "no", "off"].includes(normalized)) return false;
    }
  }
  return fallback;
}

function defaultsFromEnv(): Omit<HqWebhookControlFlags, "source"> {
  return {
    enabled: readBooleanEnv("HQ_WEBHOOK_ENABLED", false),
    shadowMode: readBooleanEnv("HQ_WEBHOOK_SHADOW_MODE", true),
    fanoutEnabled: readBooleanEnv("HQ_WEBHOOK_FANOUT_ENABLED", false),
    dbFanoutEnabled: readBooleanEnv("HQ_WEBHOOK_DB_FANOUT_ENABLED", true),
    allowHttpFanoutWithDb: readBooleanEnv("HQ_WEBHOOK_ALLOW_HTTP_FANOUT_WITH_DB", false),
    eagerDispatchEnabled: readBooleanEnv("HQ_WEBHOOK_EAGER_DISPATCH_ENABLED", true),
    performanceEditorEnabled: readBooleanEnv("HQ_PERFORMANCE_EDITOR_ENABLED", false),
  };
}

function parseFlagsFromMetadata(metadata: unknown, fallback: Omit<HqWebhookControlFlags, "source">) {
  const meta = asObject(metadata);
  const nested = asObject(meta.hq_webhook_flags);
  if (Object.keys(nested).length === 0) return null;
  return {
    enabled: readBoolean(nested, ["enabled"], fallback.enabled),
    shadowMode: readBoolean(nested, ["shadowMode", "shadow_mode"], fallback.shadowMode),
    fanoutEnabled: readBoolean(nested, ["fanoutEnabled", "fanout_enabled"], fallback.fanoutEnabled),
    dbFanoutEnabled: readBoolean(nested, ["dbFanoutEnabled", "db_fanout_enabled"], fallback.dbFanoutEnabled),
    allowHttpFanoutWithDb: readBoolean(
      nested,
      ["allowHttpFanoutWithDb", "allow_http_fanout_with_db"],
      fallback.allowHttpFanoutWithDb,
    ),
    eagerDispatchEnabled: readBoolean(
      nested,
      ["eagerDispatchEnabled", "eager_dispatch_enabled"],
      fallback.eagerDispatchEnabled,
    ),
    performanceEditorEnabled: readBoolean(
      nested,
      ["performanceEditorEnabled", "performance_editor_enabled"],
      fallback.performanceEditorEnabled,
    ),
  };
}

export async function getHqWebhookControlFlags() {
  const envDefaults = defaultsFromEnv();
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return { ...envDefaults, source: "env" as const };
  }

  const { data, error } = await supabase
    .from("brand_settings")
    .select("metadata")
    .eq("brand_id", SETTINGS_BRAND_ID)
    .maybeSingle();

  if (error) {
    return { ...envDefaults, source: "env" as const };
  }

  const fromDb = parseFlagsFromMetadata(data?.metadata, envDefaults);
  if (!fromDb) return { ...envDefaults, source: "env" as const };
  return { ...fromDb, source: "database" as const };
}

export async function updateHqWebhookControlFlags(
  payload: Partial<Omit<HqWebhookControlFlags, "source">>,
) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return { ok: false as const, status: 503, error: "HQ Supabase service client is not configured." };
  }

  const envDefaults = defaultsFromEnv();
  const current = await getHqWebhookControlFlags();
  const next = {
    enabled: payload.enabled ?? current.enabled ?? envDefaults.enabled,
    shadowMode: payload.shadowMode ?? current.shadowMode ?? envDefaults.shadowMode,
    fanoutEnabled: payload.fanoutEnabled ?? current.fanoutEnabled ?? envDefaults.fanoutEnabled,
    dbFanoutEnabled: payload.dbFanoutEnabled ?? current.dbFanoutEnabled ?? envDefaults.dbFanoutEnabled,
    allowHttpFanoutWithDb:
      payload.allowHttpFanoutWithDb ?? current.allowHttpFanoutWithDb ?? envDefaults.allowHttpFanoutWithDb,
    eagerDispatchEnabled: payload.eagerDispatchEnabled ?? current.eagerDispatchEnabled ?? envDefaults.eagerDispatchEnabled,
    performanceEditorEnabled:
      payload.performanceEditorEnabled ?? current.performanceEditorEnabled ?? envDefaults.performanceEditorEnabled,
  };

  const { data: existing, error: readError } = await supabase
    .from("brand_settings")
    .select("metadata")
    .eq("brand_id", SETTINGS_BRAND_ID)
    .maybeSingle();

  if (readError) return { ok: false as const, status: 500, error: readError.message };

  const metadata = asObject(existing?.metadata);
  metadata.hq_webhook_flags = {
    enabled: next.enabled,
    shadowMode: next.shadowMode,
    fanoutEnabled: next.fanoutEnabled,
    dbFanoutEnabled: next.dbFanoutEnabled,
    allowHttpFanoutWithDb: next.allowHttpFanoutWithDb,
    eagerDispatchEnabled: next.eagerDispatchEnabled,
    performanceEditorEnabled: next.performanceEditorEnabled,
    updated_at: new Date().toISOString(),
  };

  const { error: writeError } = await supabase
    .from("brand_settings")
    .upsert(
      {
        brand_id: SETTINGS_BRAND_ID,
        metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id" },
    );

  if (writeError) return { ok: false as const, status: 500, error: writeError.message };
  return { ok: true as const, flags: { ...next, source: "database" as const } };
}
