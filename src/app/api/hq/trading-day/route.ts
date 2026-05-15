import { NextResponse } from "next/server";
import { getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";
import {
  getHqTradingDaySettings,
  parseTradingDayBody,
  tradingDaySettingsResponsePayload,
  updateHqTradingDaySettings,
} from "@/lib/hqTradingDaySettings";

export async function GET() {
  const settings = await getHqTradingDaySettings();
  return NextResponse.json({
    ok: true,
    runtime: getWebhookRuntimeMeta(),
    settings: tradingDaySettingsResponsePayload(settings),
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = parseTradingDayBody(body);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "startHourMy/startMinuteMy is required." },
      { status: 400 },
    );
  }

  const updated = await updateHqTradingDaySettings(parsed);
  if (!updated.ok) {
    return NextResponse.json({ ok: false, error: updated.error }, { status: updated.status });
  }

  return NextResponse.json({
    ok: true,
    runtime: getWebhookRuntimeMeta(),
    settings: tradingDaySettingsResponsePayload(updated.settings),
  });
}
