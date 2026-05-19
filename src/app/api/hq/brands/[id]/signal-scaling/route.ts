import { NextResponse } from "next/server";
import { brands, type BrandId } from "@/lib/registry";
import { getHqSupabaseServiceClient, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";

type Params = { params: Promise<{ id: string }> };

const DEFAULT_DISTANCE_MULTIPLIER: Partial<Record<BrandId, number>> = {
  richjoker: 0.5,
  shinobi: 0.5,
};

function normalizeBrandId(value: string): BrandId | null {
  const id = value.trim().toLowerCase();
  return brands.some((brand) => brand.id === id) ? (id as BrandId) : null;
}

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

function getDefaultMultiplier(brandId: BrandId) {
  const fallback = DEFAULT_DISTANCE_MULTIPLIER[brandId] ?? 1;
  const envKey = `HQ_BRAND_${brandId.toUpperCase()}_PRICE_DISTANCE_MULTIPLIER`;
  const envRaw = process.env[envKey];
  if (!envRaw || envRaw.trim().length === 0) return fallback;
  const parsed = Number(envRaw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readStoredMultiplier(settings: unknown) {
  const bag = asObject(settings);
  const snake = asNumber(bag.signal_price_distance_multiplier);
  const camel = asNumber(bag.signalPriceDistanceMultiplier);
  const value = snake ?? camel;
  if (value === null || value <= 0) return null;
  return value;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const brandId = normalizeBrandId(id);
  if (!brandId) {
    return NextResponse.json({ ok: false, error: "Invalid brand id." }, { status: 400 });
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "HQ Supabase service client is not configured.", runtime: getWebhookRuntimeMeta() },
      { status: 503 },
    );
  }

  const defaultMultiplier = getDefaultMultiplier(brandId);

  const { data, error } = await supabase
    .from("brand_publish_rules")
    .select("settings,updated_at")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const storedMultiplier = readStoredMultiplier(data?.settings);
  const activeMultiplier = storedMultiplier ?? defaultMultiplier;

  return NextResponse.json({
    ok: true,
    brandId,
    scaling: {
      multiplier: activeMultiplier,
      source: storedMultiplier === null ? "default" : "database",
      defaultMultiplier,
      updatedAt: data?.updated_at ?? null,
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const brandId = normalizeBrandId(id);
  if (!brandId) {
    return NextResponse.json({ ok: false, error: "Invalid brand id." }, { status: 400 });
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "HQ Supabase service client is not configured.", runtime: getWebhookRuntimeMeta() },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const payload = asObject(body);
  const nextMultiplierRaw = asNumber(payload.multiplier);
  if (nextMultiplierRaw === null) {
    return NextResponse.json({ ok: false, error: "Multiplier is required." }, { status: 400 });
  }

  const nextMultiplier = Number(nextMultiplierRaw.toFixed(4));
  if (!Number.isFinite(nextMultiplier) || nextMultiplier <= 0 || nextMultiplier > 3) {
    return NextResponse.json(
      { ok: false, error: "Multiplier must be > 0 and <= 3." },
      { status: 400 },
    );
  }

  const { data: existing, error: readError } = await supabase
    .from("brand_publish_rules")
    .select("webhook_enabled,fanout_enabled,routing_mode,settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }

  const settings = asObject(existing?.settings);
  settings.signal_price_distance_multiplier = nextMultiplier;
  settings.signalPriceDistanceMultiplier = nextMultiplier;

  const { error: upsertError } = await supabase
    .from("brand_publish_rules")
    .upsert(
      {
        brand_id: brandId,
        webhook_enabled: existing?.webhook_enabled ?? true,
        fanout_enabled: existing?.fanout_enabled ?? true,
        routing_mode: existing?.routing_mode ?? "direct",
        settings,
      },
      { onConflict: "brand_id" },
    );

  if (upsertError) {
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    scaling: {
      multiplier: nextMultiplier,
      source: "database",
    },
  });
}
