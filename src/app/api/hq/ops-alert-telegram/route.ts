import { NextResponse } from "next/server";
import { isHqAdminAuthorized } from "@/lib/hqAdminAuth";
import { getHqOpsTelegramSettings, saveHqOpsTelegramSettings } from "@/lib/hqOpsTelegramSettings";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const json = await response.json().catch(() => null);
  const ok = Boolean(json && typeof json === "object" && asObject(json).ok === true);
  if (!response.ok || !ok) {
    const desc = asObject(json).description;
    throw new Error(typeof desc === "string" && desc.trim().length > 0 ? desc : `Telegram HTTP ${response.status}`);
  }
}

export async function GET() {
  const settings = await getHqOpsTelegramSettings();
  return NextResponse.json({
    ok: true,
    telegram: {
      configured: settings.configured,
      enabled: settings.enabled,
      hasToken: settings.hasToken,
      tokenMasked: settings.tokenMasked,
      chatId: settings.chatId,
      updatedAt: settings.updatedAt,
    },
  });
}

export async function POST(request: Request) {
  if (!isHqAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }
  const payload = asObject(body);
  const action = typeof payload.action === "string" ? payload.action.trim().toLowerCase() : "save";

  if (action === "test") {
    const current = await getHqOpsTelegramSettings();
    const tokenInput = typeof payload.botToken === "string" ? payload.botToken.trim() : "";
    const chatInput = typeof payload.chatId === "string" ? payload.chatId.trim() : "";
    const testToken = tokenInput || (current.raw?.token ?? "");
    const testChatIds = chatInput
      ? chatInput.split(/[\n,;]+/g).map((v) => v.trim()).filter(Boolean)
      : (current.raw?.chatIds ?? []);
    if (!testToken || testChatIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing bot token or chat id for test." }, { status: 400 });
    }

    const text = [
      "*HQ OPS ALERT TEST*",
      "Connection OK.",
      `Time: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour12: false })} MYT`,
    ].join("\n");

    const failures: string[] = [];
    for (const chatId of testChatIds) {
      try {
        await sendTelegramMessage(testToken, chatId, text);
      } catch (error) {
        failures.push(`${chatId}: ${error instanceof Error ? error.message : "send failed"}`);
      }
    }
    if (failures.length > 0) {
      return NextResponse.json({ ok: false, error: failures.join(" | ") }, { status: 502 });
    }
    return NextResponse.json({ ok: true, tested: true, sentTo: testChatIds.length });
  }

  const save = await saveHqOpsTelegramSettings({
    botToken: typeof payload.botToken === "string" ? payload.botToken : "",
    chatId: typeof payload.chatId === "string" ? payload.chatId : "",
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : undefined,
  });
  if (!save.ok) return NextResponse.json({ ok: false, error: save.error }, { status: save.status });

  const latest = await getHqOpsTelegramSettings();
  return NextResponse.json({
    ok: true,
    telegram: {
      configured: latest.configured,
      enabled: latest.enabled,
      hasToken: latest.hasToken,
      tokenMasked: latest.tokenMasked,
      chatId: latest.chatId,
      updatedAt: latest.updatedAt,
    },
  });
}
