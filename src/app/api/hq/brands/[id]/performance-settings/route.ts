import { NextResponse } from "next/server";
import { brands, type BrandId } from "@/lib/registry";
import { getBrandPerformanceSettings, saveBrandPerformanceSettings } from "@/lib/hqBrandPerformanceSettings";

type Params = { params: Promise<{ id: string }> };

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

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const brandId = normalizeBrandId(id);
  if (!brandId) return NextResponse.json({ ok: false, error: "Invalid brand id." }, { status: 400 });

  const performance = await getBrandPerformanceSettings(brandId);
  return NextResponse.json({ ok: true, brandId, performance });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const brandId = normalizeBrandId(id);
  if (!brandId) return NextResponse.json({ ok: false, error: "Invalid brand id." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const payload = asObject(body);
  const bePercentage = asNumber(payload.bePercentage ?? payload.be_percentage);
  const scalpingPeakPips = asNumber(payload.scalpingPeakPips ?? payload.scalping_peak_pips);
  const intradayPeakPips = asNumber(payload.intradayPeakPips ?? payload.intraday_peak_pips);

  if (bePercentage === null || scalpingPeakPips === null || intradayPeakPips === null) {
    return NextResponse.json(
      { ok: false, error: "bePercentage, scalpingPeakPips, and intradayPeakPips are required." },
      { status: 400 },
    );
  }

  if (bePercentage <= 0 || bePercentage > 100) {
    return NextResponse.json({ ok: false, error: "BE percentage must be > 0 and <= 100." }, { status: 400 });
  }
  if (scalpingPeakPips <= 0 || intradayPeakPips <= 0) {
    return NextResponse.json({ ok: false, error: "Peak pips must be > 0." }, { status: 400 });
  }

  const saved = await saveBrandPerformanceSettings(brandId, {
    bePercentage: Number(bePercentage.toFixed(2)),
    scalpingPeakPips: Number(scalpingPeakPips.toFixed(1)),
    intradayPeakPips: Number(intradayPeakPips.toFixed(1)),
  });

  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: saved.status });
  return NextResponse.json({ ok: true, saved: true, performance: saved.performance });
}
