import { NextResponse } from "next/server";
import { brands, type BrandId } from "@/lib/registry";
import { getHqSupabaseServiceClient } from "@/lib/hqWebhookRuntime";

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

function readScaling(settings: unknown) {
  const bag = asObject(settings);
  return asNumber(bag.signal_price_distance_multiplier) ?? asNumber(bag.signalPriceDistanceMultiplier) ?? 1;
}

export async function GET() {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "HQ Supabase service client is not configured." }, { status: 503 });
  }

  const targetBrandIds = brands.map((b) => b.id) as BrandId[];
  const [rulesRes, promoRes] = await Promise.all([
    supabase
      .from("brand_publish_rules")
      .select("brand_id,routing_mode,settings,updated_at")
      .in("brand_id", targetBrandIds),
    supabase
      .from("promo_settings")
      .select("brand_id,promo_code,is_active,updated_at")
      .in("brand_id", targetBrandIds),
  ]);

  if (rulesRes.error) {
    return NextResponse.json({ ok: false, error: rulesRes.error.message }, { status: 500 });
  }

  const rulesMap = new Map<string, Record<string, unknown>>();
  for (const row of (rulesRes.data ?? []) as Array<Record<string, unknown>>) {
    rulesMap.set(String(row.brand_id ?? ""), row);
  }

  const promoMap = new Map<string, Record<string, unknown>>();
  if (!promoRes.error) {
    for (const row of (promoRes.data ?? []) as Array<Record<string, unknown>>) {
      promoMap.set(String(row.brand_id ?? ""), row);
    }
  }

  const data = targetBrandIds.map((brandId) => {
    const rule = rulesMap.get(brandId);
    const promo = promoMap.get(brandId);
    return {
      brandId,
      routingMode: String(rule?.routing_mode ?? "direct"),
      scalingMultiplier: readScaling(rule?.settings),
      promoCode: String(promo?.promo_code ?? "").trim() || null,
      promoActive: promo ? Boolean(promo.is_active ?? true) : null,
      updatedAt: String(rule?.updated_at ?? promo?.updated_at ?? ""),
    };
  });

  return NextResponse.json({ ok: true, data });
}
