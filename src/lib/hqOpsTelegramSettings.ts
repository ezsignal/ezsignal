import "server-only";
import { getHqSupabaseServiceClient } from "@/lib/hqWebhookRuntime";

const SETTINGS_BRAND_ID = "kafra";

type StoredOpsTelegram = {
  enabled: boolean;
  token: string;
  chatIds: string[];
  updatedAt: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseChatIds(raw: unknown) {
  if (typeof raw !== "string") return [] as string[];
  return raw
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function maskTokenTail(token: string | null) {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  return trimmed.length <= 4 ? `****${trimmed}` : `****${trimmed.slice(-4)}`;
}

function parseStored(metadata: unknown): StoredOpsTelegram | null {
  const meta = asObject(metadata);
  const bag = asObject(meta.hq_ops_telegram);
  if (Object.keys(bag).length === 0) return null;

  const token = typeof bag.botToken === "string" ? bag.botToken.trim() : "";
  const chatIds =
    Array.isArray(bag.chatIds)
      ? bag.chatIds.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
      : parseChatIds(bag.chatId);
  const enabled = typeof bag.enabled === "boolean" ? bag.enabled : true;
  const updatedAt = typeof bag.updatedAt === "string" ? bag.updatedAt : null;

  return { enabled, token, chatIds, updatedAt };
}

export async function getHqOpsTelegramSettings() {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return {
      configured: false,
      enabled: false,
      hasToken: false,
      tokenMasked: null as string | null,
      chatId: "",
      updatedAt: null as string | null,
      raw: null as StoredOpsTelegram | null,
    };
  }

  const { data, error } = await supabase
    .from("brand_settings")
    .select("metadata")
    .eq("brand_id", SETTINGS_BRAND_ID)
    .maybeSingle();

  if (error) {
    return {
      configured: false,
      enabled: false,
      hasToken: false,
      tokenMasked: null as string | null,
      chatId: "",
      updatedAt: null as string | null,
      raw: null as StoredOpsTelegram | null,
    };
  }

  const parsed = parseStored(data?.metadata);
  const token = parsed?.token ?? "";
  const chatIds = parsed?.chatIds ?? [];
  const enabled = parsed?.enabled ?? false;
  const configured = Boolean(token && chatIds.length > 0);

  return {
    configured,
    enabled,
    hasToken: Boolean(token),
    tokenMasked: maskTokenTail(token),
    chatId: chatIds.join(", "),
    updatedAt: parsed?.updatedAt ?? null,
    raw: parsed,
  };
}

export async function saveHqOpsTelegramSettings(input: {
  botToken?: string;
  chatId?: string;
  enabled?: boolean;
}) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return { ok: false as const, status: 503, error: "HQ Supabase service client is not configured." };
  }

  const { data: existing, error: readError } = await supabase
    .from("brand_settings")
    .select("metadata")
    .eq("brand_id", SETTINGS_BRAND_ID)
    .maybeSingle();
  if (readError) return { ok: false as const, status: 500, error: readError.message };

  const metadata = asObject(existing?.metadata);
  const previous = parseStored(metadata) ?? { enabled: true, token: "", chatIds: [], updatedAt: null };

  const nextToken = (input.botToken ?? "").trim() || previous.token;
  const nextChatIds = parseChatIds(input.chatId ?? "").length > 0 ? parseChatIds(input.chatId ?? "") : previous.chatIds;
  const nextEnabled = typeof input.enabled === "boolean" ? input.enabled : previous.enabled;

  if (!nextToken || nextChatIds.length === 0) {
    return { ok: false as const, status: 400, error: "Bot token and chat id are required." };
  }

  metadata.hq_ops_telegram = {
    enabled: nextEnabled,
    botToken: nextToken,
    chatIds: nextChatIds,
    chatId: nextChatIds.join(","),
    updatedAt: new Date().toISOString(),
  };

  const { error: writeError } = await supabase
    .from("brand_settings")
    .upsert(
      { brand_id: SETTINGS_BRAND_ID, metadata, updated_at: new Date().toISOString() },
      { onConflict: "brand_id" },
    );

  if (writeError) return { ok: false as const, status: 500, error: writeError.message };

  return { ok: true as const };
}

export async function resolveHqOpsTelegramForDispatch() {
  const settings = await getHqOpsTelegramSettings();
  if (!settings.raw) return null;
  if (!settings.raw.enabled) return null;
  if (!settings.raw.token || settings.raw.chatIds.length === 0) return null;
  return {
    token: settings.raw.token,
    chatIds: settings.raw.chatIds,
  };
}
