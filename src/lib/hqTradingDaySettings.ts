import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHqSupabaseServiceClient } from "@/lib/hqWebhookRuntime";
import {
  DEFAULT_TRADING_DAY_BOUNDARY,
  formatTradingDayBoundaryLabel,
  normalizeTradingDayBoundary,
  type TradingDayBoundary,
} from "@/lib/hqTradingDay";

type TradingDayBoundarySource = "database" | "env" | "default";

export type HqTradingDaySettings = TradingDayBoundary & {
  source: TradingDayBoundarySource;
};

const SETTINGS_BRAND_ID = "kafra";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readNumberish(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseBoundaryFromMetadata(metadata: unknown): Partial<TradingDayBoundary> | null {
  const meta = asObject(metadata);
  const nested = asObject(meta.trading_day_boundary);

  const startHourMy =
    readNumberish(nested.startHourMy) ??
    readNumberish(nested.start_hour_my) ??
    readNumberish(nested.start_hour) ??
    readNumberish(nested.hour) ??
    readNumberish(meta.trading_day_start_hour_my) ??
    readNumberish(meta.trading_day_start_hour);

  const startMinuteMy =
    readNumberish(nested.startMinuteMy) ??
    readNumberish(nested.start_minute_my) ??
    readNumberish(nested.start_minute) ??
    readNumberish(nested.minute) ??
    readNumberish(meta.trading_day_start_minute_my) ??
    readNumberish(meta.trading_day_start_minute);

  if (startHourMy === null && startMinuteMy === null) return null;
  return {
    startHourMy: startHourMy ?? DEFAULT_TRADING_DAY_BOUNDARY.startHourMy,
    startMinuteMy: startMinuteMy ?? DEFAULT_TRADING_DAY_BOUNDARY.startMinuteMy,
  };
}

function parseBoundaryFromEnv(): Partial<TradingDayBoundary> | null {
  const hourRaw = process.env.HQ_TRADING_DAY_START_HOUR_MY;
  const minuteRaw = process.env.HQ_TRADING_DAY_START_MINUTE_MY;
  if (!hourRaw && !minuteRaw) return null;
  const hour = readNumberish(hourRaw);
  const minute = readNumberish(minuteRaw);
  if (hour === null && minute === null) return null;
  return {
    startHourMy: hour ?? DEFAULT_TRADING_DAY_BOUNDARY.startHourMy,
    startMinuteMy: minute ?? DEFAULT_TRADING_DAY_BOUNDARY.startMinuteMy,
  };
}

export async function getHqTradingDaySettings(
  supabase = getHqSupabaseServiceClient(),
): Promise<HqTradingDaySettings> {
  const envBoundary = parseBoundaryFromEnv();
  let active = normalizeTradingDayBoundary(envBoundary ?? DEFAULT_TRADING_DAY_BOUNDARY);
  let source: TradingDayBoundarySource = envBoundary ? "env" : "default";

  if (!supabase) {
    return {
      ...active,
      source,
    };
  }

  const { data, error } = await supabase
    .from("brand_settings")
    .select("metadata")
    .eq("brand_id", SETTINGS_BRAND_ID)
    .maybeSingle();

  if (error) {
    return {
      ...active,
      source,
    };
  }

  const dbBoundary = parseBoundaryFromMetadata(data?.metadata);
  if (!dbBoundary) {
    return {
      ...active,
      source,
    };
  }

  return {
    ...normalizeTradingDayBoundary(dbBoundary),
    source: "database",
  };
}

export async function updateHqTradingDaySettings(
  nextBoundaryInput: Partial<TradingDayBoundary>,
  supabase = getHqSupabaseServiceClient(),
) {
  if (!supabase) {
    return {
      ok: false as const,
      status: 503,
      error: "HQ Supabase service client is not configured.",
    };
  }

  const nextBoundary = normalizeTradingDayBoundary(nextBoundaryInput);
  const { data: existing, error: readError } = await supabase
    .from("brand_settings")
    .select("metadata")
    .eq("brand_id", SETTINGS_BRAND_ID)
    .maybeSingle();

  if (readError) {
    return {
      ok: false as const,
      status: 500,
      error: readError.message,
    };
  }

  const metadata = asObject(existing?.metadata);
  metadata.trading_day_boundary = {
    start_hour: nextBoundary.startHourMy,
    start_minute: nextBoundary.startMinuteMy,
    label: formatTradingDayBoundaryLabel(nextBoundary),
    updated_at: new Date().toISOString(),
  };

  const { error: writeError } = await supabase
    .from("brand_settings")
    .upsert(
      {
        brand_id: SETTINGS_BRAND_ID,
        metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id" },
    );

  if (writeError) {
    return {
      ok: false as const,
      status: 500,
      error: writeError.message,
    };
  }

  return {
    ok: true as const,
    settings: {
      ...nextBoundary,
      source: "database" as const,
    },
  };
}

export function tradingDaySettingsResponsePayload(settings: HqTradingDaySettings) {
  return {
    startHourMy: settings.startHourMy,
    startMinuteMy: settings.startMinuteMy,
    label: formatTradingDayBoundaryLabel(settings),
    source: settings.source,
  };
}

export function parseTradingDayBody(body: unknown): Partial<TradingDayBoundary> | null {
  const payload = asObject(body);
  const hour = readNumberish(payload.startHourMy ?? payload.start_hour_my ?? payload.startHour ?? payload.hour);
  const minute = readNumberish(payload.startMinuteMy ?? payload.start_minute_my ?? payload.startMinute ?? payload.minute);

  if (hour === null && minute === null) return null;
  return {
    startHourMy: hour ?? undefined,
    startMinuteMy: minute ?? undefined,
  };
}
