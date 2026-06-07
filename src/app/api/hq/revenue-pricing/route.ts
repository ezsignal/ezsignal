import { NextResponse } from "next/server";
import { getHqRevenuePricing, updateHqRevenuePricing } from "@/lib/hqRevenuePricing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const pricing = await getHqRevenuePricing();
  return NextResponse.json({ ok: true, pricing });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const result = await updateHqRevenuePricing({
    usd7: payload.usd7 !== undefined ? Number(payload.usd7) : undefined,
    usd15: payload.usd15 !== undefined ? Number(payload.usd15) : undefined,
    usd30: payload.usd30 !== undefined ? Number(payload.usd30) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, pricing: result.pricing });
}
