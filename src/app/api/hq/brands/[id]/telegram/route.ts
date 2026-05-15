import { NextResponse } from "next/server";
import { brands, type BrandId } from "@/lib/registry";
import { getHqSupabaseServiceClient, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";

const BOT_NAME = "registration_alert";

type Params = { params: Promise<{ id: string }> };

function normalizeBrandId(value: string): BrandId | null {
  const id = value.trim().toLowerCase();
  return brands.some((brand) => brand.id === id) ? (id as BrandId) : null;
}

function maskTokenTail(token: string | null) {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  return trimmed.length <= 4 ? `****${trimmed}` : `****${trimmed.slice(-4)}`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function buildTelegramMessage(brandId: BrandId) {
  const now = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour12: false });
  return [
    "*HQ Telegram Test*",
    `Brand: *${brandId.toUpperCase()}*`,
    `Time: ${now} MYT`,
    "Status: connection ok",
  ].join("\n");
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  const json = await response.json().catch(() => null);
  const ok = Boolean(json && typeof json === "object" && asObject(json).ok === true);
  if (!response.ok || !ok) {
    const desc = asObject(json).description;
    const errorMessage = typeof desc === "string" && desc.trim().length > 0
      ? desc
      : `Telegram API request failed (HTTP ${response.status}).`;
    throw new Error(errorMessage);
  }
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

  const { data, error } = await supabase
    .from("telegram_bots")
    .select("id, bot_name, bot_token_secret_ref, channel_id, is_active, updated_at")
    .eq("brand_id", brandId)
    .eq("bot_name", BOT_NAME)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const token = typeof data?.bot_token_secret_ref === "string" ? data.bot_token_secret_ref : null;
  const chatId = typeof data?.channel_id === "string" ? data.channel_id : "";
  const enabled = data?.is_active !== false;

  return NextResponse.json({
    ok: true,
    brandId,
    telegram: {
      configured: Boolean(token && chatId),
      enabled,
      chatId,
      tokenMasked: maskTokenTail(token),
      hasToken: Boolean(token),
      updatedAt: data?.updated_at ?? null,
    },
    runtime: getWebhookRuntimeMeta(),
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
  const action = typeof payload.action === "string" ? payload.action.trim().toLowerCase() : "save";

  const { data: existing, error: existingError } = await supabase
    .from("telegram_bots")
    .select("id, bot_token_secret_ref, channel_id, is_active")
    .eq("brand_id", brandId)
    .eq("bot_name", BOT_NAME)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  const existingToken = typeof existing?.bot_token_secret_ref === "string" ? existing.bot_token_secret_ref.trim() : "";
  const existingChatId = typeof existing?.channel_id === "string" ? existing.channel_id.trim() : "";
  const existingEnabled = existing?.is_active !== false;

  if (action === "test") {
    const inputToken = typeof payload.botToken === "string" ? payload.botToken.trim() : "";
    const inputChatId = typeof payload.chatId === "string" ? payload.chatId.trim() : "";
    const testToken = inputToken || existingToken;
    const testChatId = inputChatId || existingChatId;
    if (!testToken || !testChatId) {
      return NextResponse.json(
        { ok: false, error: "Missing bot token or chat id for test." },
        { status: 400 },
      );
    }

    try {
      await sendTelegramMessage(testToken, testChatId, buildTelegramMessage(brandId));
      return NextResponse.json({ ok: true, tested: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send Telegram test message.";
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
  }

  const inputToken = typeof payload.botToken === "string" ? payload.botToken.trim() : "";
  const inputChatId = typeof payload.chatId === "string" ? payload.chatId.trim() : "";
  const inputEnabled = typeof payload.enabled === "boolean" ? payload.enabled : existingEnabled;

  const tokenToSave = inputToken || existingToken;
  const chatIdToSave = inputChatId || existingChatId;

  if (!tokenToSave || !chatIdToSave) {
    return NextResponse.json(
      { ok: false, error: "Bot token and chat id are required." },
      { status: 400 },
    );
  }

  const { error: upsertError } = await supabase
    .from("telegram_bots")
    .upsert(
      {
        brand_id: brandId,
        bot_name: BOT_NAME,
        bot_token_secret_ref: tokenToSave,
        channel_id: chatIdToSave,
        is_active: inputEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id,bot_name" },
    );

  if (upsertError) {
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    telegram: {
      configured: true,
      enabled: inputEnabled,
      chatId: chatIdToSave,
      tokenMasked: maskTokenTail(tokenToSave),
      hasToken: true,
    },
  });
}
