import "server-only";
import { getHqSupabaseServiceClient } from "@/lib/hqWebhookRuntime";

// Global package pricing (USD) used for the revenue estimate. Stored — like the
// trading-day boundary — inside the shared HQ settings row
// (brand_settings.metadata under the "kafra" sentinel brand). One set of prices
// applies to every brand's revenue calculation.

const SETTINGS_BRAND_ID = "kafra";

export type RevenuePricing = { usd7: number; usd15: number; usd30: number };

export const DEFAULT_REVENUE_PRICING: RevenuePricing = { usd7: 99, usd15: 199, usd30: 249 };

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readPrice(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function pricingFromMetadata(metadata: unknown): RevenuePricing {
  const meta = asObject(metadata);
  const p = asObject(meta.revenue_pricing);
  return {
    usd7: readPrice(p.usd7 ?? p.usd_7, DEFAULT_REVENUE_PRICING.usd7),
    usd15: readPrice(p.usd15 ?? p.usd_15, DEFAULT_REVENUE_PRICING.usd15),
    usd30: readPrice(p.usd30 ?? p.usd_30, DEFAULT_REVENUE_PRICING.usd30),
  };
}

export async function getHqRevenuePricing(
  supabase = getHqSupabaseServiceClient(),
): Promise<RevenuePricing> {
  if (!supabase) return { ...DEFAULT_REVENUE_PRICING };

  const { data, error } = await supabase
    .from("brand_settings")
    .select("metadata")
    .eq("brand_id", SETTINGS_BRAND_ID)
    .maybeSingle();

  if (error) return { ...DEFAULT_REVENUE_PRICING };
  return pricingFromMetadata(data?.metadata);
}

export async function updateHqRevenuePricing(
  input: Partial<RevenuePricing>,
  supabase = getHqSupabaseServiceClient(),
) {
  if (!supabase) {
    return { ok: false as const, status: 503, error: "HQ Supabase service client is not configured." };
  }

  const { data: existing, error: readError } = await supabase
    .from("brand_settings")
    .select("metadata")
    .eq("brand_id", SETTINGS_BRAND_ID)
    .maybeSingle();

  if (readError) {
    return { ok: false as const, status: 500, error: readError.message };
  }

  const meta = asObject(existing?.metadata);
  const prev = pricingFromMetadata(meta);
  const next: RevenuePricing = {
    usd7: readPrice(input.usd7, prev.usd7),
    usd15: readPrice(input.usd15, prev.usd15),
    usd30: readPrice(input.usd30, prev.usd30),
  };

  meta.revenue_pricing = { ...next, updated_at: new Date().toISOString() };

  const { error: writeError } = await supabase
    .from("brand_settings")
    .upsert(
      { brand_id: SETTINGS_BRAND_ID, metadata: meta, updated_at: new Date().toISOString() },
      { onConflict: "brand_id" },
    );

  if (writeError) {
    return { ok: false as const, status: 500, error: writeError.message };
  }

  return { ok: true as const, pricing: next };
}
