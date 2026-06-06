import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandId } from "@/lib/registry";

const SETTINGS_BRAND_ID = "kafra";

export type HqSignalPerformanceSettings = {
  bePercentage: number;
  scalpingPeakPips: number;
  intradayPeakPips: number;
  source: "default" | "database";
  updatedAt: string | null;
};

const DEFAULT_BE_PERCENTAGE = 80;
const DEFAULT_SCALPING_PEAK_PIPS = 10;
const DEFAULT_INTRADAY_PEAK_PIPS = 50;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readNumberEnv(key: string, fallback: number) {
  const raw = process.env[key];
  if (!raw || raw.trim().length === 0) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultsFromEnv(brandId: BrandId): Omit<HqSignalPerformanceSettings, "source" | "updatedAt"> {
  const prefix = `HQ_BRAND_${brandId.toUpperCase()}_`;
  return {
    bePercentage: readNumberEnv(`${prefix}BE_PERCENTAGE`, readNumberEnv("HQ_BE_PERCENTAGE", DEFAULT_BE_PERCENTAGE)),
    scalpingPeakPips: readNumberEnv(
      `${prefix}SCALPING_PEAK_PIPS`,
      readNumberEnv("HQ_SCALPING_PEAK_PIPS", DEFAULT_SCALPING_PEAK_PIPS),
    ),
    intradayPeakPips: readNumberEnv(
      `${prefix}INTRADAY_PEAK_PIPS`,
      readNumberEnv("HQ_INTRADAY_PEAK_PIPS", DEFAULT_INTRADAY_PEAK_PIPS),
    ),
  };
}

function readSettingsRecord(settings: unknown) {
  const bag = asObject(settings);
  const nested = asObject(bag.signal_performance ?? bag.signalPerformance);
  return Object.keys(nested).length > 0 ? nested : bag;
}

function readStoredPerformance(settings: unknown, fallback: Omit<HqSignalPerformanceSettings, "source" | "updatedAt">) {
  const source = readSettingsRecord(settings);
  const bePercentage = asNumber(source.be_percentage ?? source.bePercentage);
  const scalpingPeakPips = asNumber(source.scalping_peak_pips ?? source.scalpingPeakPips);
  const intradayPeakPips = asNumber(source.intraday_peak_pips ?? source.intradayPeakPips);

  if (bePercentage === null && scalpingPeakPips === null && intradayPeakPips === null) return null;

  return {
    bePercentage: bePercentage ?? fallback.bePercentage,
    scalpingPeakPips: scalpingPeakPips ?? fallback.scalpingPeakPips,
    intradayPeakPips: intradayPeakPips ?? fallback.intradayPeakPips,
  };
}

export async function loadBrandPerformanceSettingsMap(
  supabase: SupabaseClient,
  targetBrands: BrandId[],
) {
  const defaults: Partial<Record<BrandId, HqSignalPerformanceSettings>> = {};
  for (const brandId of targetBrands) {
    const fallback = defaultsFromEnv(brandId);
    defaults[brandId] = {
      ...fallback,
      source: "default",
      updatedAt: null,
    };
  }

  const { data, error } = await supabase
    .from("brand_publish_rules")
    .select("brand_id,settings,updated_at")
    .in("brand_id", targetBrands);

  if (error || !data) return defaults;

  for (const row of data as Array<Record<string, unknown>>) {
    const brandIdRaw = String(row.brand_id ?? "").trim().toLowerCase() as BrandId;
    if (!brandIdRaw || !targetBrands.includes(brandIdRaw)) continue;
    const fallback = defaults[brandIdRaw] ?? {
      ...defaultsFromEnv(brandIdRaw),
      source: "default" as const,
      updatedAt: null,
    };
    const stored = readStoredPerformance(row.settings, fallback);
    if (stored) {
      defaults[brandIdRaw] = {
        ...stored,
        source: "database",
        updatedAt: String(row.updated_at ?? null) || null,
      };
    }
  }

  return defaults;
}

export async function getBrandPerformanceSettings(brandId: BrandId) {
  const supabase = (await import("@/lib/hqWebhookRuntime")).getHqSupabaseServiceClient();
  const fallback = defaultsFromEnv(brandId);
  if (!supabase) {
    return { ...fallback, source: "default" as const, updatedAt: null };
  }

  const { data, error } = await supabase
    .from("brand_publish_rules")
    .select("settings,updated_at")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (error) {
    return { ...fallback, source: "default" as const, updatedAt: null };
  }

  const stored = readStoredPerformance(data?.settings, fallback);
  if (!stored) return { ...fallback, source: "default" as const, updatedAt: data?.updated_at ?? null };
  return { ...stored, source: "database" as const, updatedAt: data?.updated_at ?? null };
}

export async function saveBrandPerformanceSettings(brandId: BrandId, next: Omit<HqSignalPerformanceSettings, "source" | "updatedAt">) {
  const supabase = (await import("@/lib/hqWebhookRuntime")).getHqSupabaseServiceClient();
  if (!supabase) {
    return { ok: false as const, status: 503, error: "HQ Supabase service client is not configured." };
  }

  const { data: existing, error: readError } = await supabase
    .from("brand_publish_rules")
    .select("routing_mode,settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (readError) return { ok: false as const, status: 500, error: readError.message };

  const settings = asObject(existing?.settings);
  const payload = {
    be_percentage: Number(next.bePercentage),
    bePercentage: Number(next.bePercentage),
    scalping_peak_pips: Number(next.scalpingPeakPips),
    scalpingPeakPips: Number(next.scalpingPeakPips),
    intraday_peak_pips: Number(next.intradayPeakPips),
    intradayPeakPips: Number(next.intradayPeakPips),
    updated_at: new Date().toISOString(),
  };

  settings.signal_performance = payload;
  settings.signalPerformance = payload;

  const { error: upsertError } = await supabase
    .from("brand_publish_rules")
    .upsert(
      {
        brand_id: brandId,
        routing_mode: existing?.routing_mode ?? "direct",
        settings,
      },
      { onConflict: "brand_id" },
    );

  if (upsertError) return { ok: false as const, status: 500, error: upsertError.message };
  return { ok: true as const, performance: { ...next, source: "database" as const, updatedAt: new Date().toISOString() } };
}
