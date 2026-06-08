import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandId } from "@/lib/registry";
import { loadBrandPerformanceSettingsMap } from "@/lib/hqBrandPerformanceSettings";

const GOLD_PIPS_MULTIPLIER = 10;
const SIGNAL_DUPLICATE_COOLDOWN_SECONDS = Number(process.env.SIGNAL_DUPLICATE_COOLDOWN_SECONDS ?? "90");

const BRAND_PRICE_DISTANCE_MULTIPLIER: Partial<Record<BrandId, number>> = {
  richjoker: 0.5,
  shinobi: 0.5,
};

type WebhookEvent = "signal" | "price_update" | "signal_closed";
type SignalMode = "scalping" | "intraday";
type SignalType = "buy" | "sell";
type SignalOutcome = "tp1" | "tp2" | "tp3" | "be" | "sl";

type PerformanceSettings = {
  bePercentage: number;
  scalpingPeakPips: number;
  intradayPeakPips: number;
};

type SignalSnapshot = {
  id: string;
  mode: SignalMode;
  type: SignalType;
  entry_target: number;
  live_price: number | null;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number | null;
  max_floating_pips: number | null;
};

type BrandResult = {
  brandId: BrandId;
  status: "processed" | "skipped" | "duplicate" | "failed";
  event: WebhookEvent;
  reason?: string;
  signalId?: string;
  performanceLogId?: string;
  outcome?: SignalOutcome;
};

type ParseResult =
  | {
      ok: true;
      event: WebhookEvent;
      pair: string;
      mode: SignalMode;
      type: SignalType;
      status: "active" | "closed";
      entryTarget: number | null;
      livePrice: number | null;
      sl: number | null;
      tp1: number | null;
      tp2: number | null;
      tp3: number | null;
      closePrice: number | null;
      outcomeRaw: SignalOutcome | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export type DbFanoutResult = {
  ok: boolean;
  event?: WebhookEvent;
  pair?: string;
  mode?: SignalMode;
  totalBrands: number;
  processed: number;
  skipped: number;
  duplicates: number;
  failed: number;
  results: BrandResult[];
  error?: string;
  status?: number;
};

type DbFanoutSummary = {
  ok: boolean;
  status?: number;
  event?: WebhookEvent;
  pair?: string;
  mode?: SignalMode;
  totalBrands: number;
  processed: number;
  skipped: number;
  duplicates: number;
  failed: number;
  results: Array<{
    brandId: BrandId;
    status: BrandResult["status"];
    event: WebhookEvent;
    reason?: string;
  }>;
  error?: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalized(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getDefaultBrandPriceDistanceMultiplier(brandId: BrandId) {
  const fallback = BRAND_PRICE_DISTANCE_MULTIPLIER[brandId] ?? 1;
  const envKey = `HQ_BRAND_${brandId.toUpperCase()}_PRICE_DISTANCE_MULTIPLIER`;
  const envRaw = process.env[envKey];
  if (!envRaw || envRaw.trim().length === 0) return fallback;
  const parsed = Number(envRaw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readSettingsMultiplier(settings: unknown) {
  const bag = asObject(settings);
  const fromSnake = asNumber(bag.signal_price_distance_multiplier);
  const fromCamel = asNumber(bag.signalPriceDistanceMultiplier);
  const picked = fromSnake ?? fromCamel;
  if (picked === null) return null;
  if (!Number.isFinite(picked) || picked <= 0) return null;
  return picked;
}

async function loadBrandPriceDistanceMultiplierMap(
  supabase: SupabaseClient,
  targetBrands: BrandId[],
) {
  const defaults: Record<BrandId, number> = {} as Record<BrandId, number>;
  for (const brandId of targetBrands) {
    defaults[brandId] = getDefaultBrandPriceDistanceMultiplier(brandId);
  }

  const { data, error } = await supabase
    .from("brand_publish_rules")
    .select("brand_id,settings")
    .in("brand_id", targetBrands);

  if (error || !data) return defaults;

  for (const row of data as Array<Record<string, unknown>>) {
    const brandIdRaw = normalized(row.brand_id);
    if (!brandIdRaw) continue;
    if (!targetBrands.includes(brandIdRaw as BrandId)) continue;
    const parsed = readSettingsMultiplier(row.settings);
    if (parsed !== null) {
      defaults[brandIdRaw as BrandId] = parsed;
    }
  }

  return defaults;
}

function scaleLevelFromEntry(entry: number, level: number, multiplier: number) {
  const scaled = entry + (level - entry) * multiplier;
  return Number(scaled.toFixed(5));
}

function scaleSignalLevelsForBrand(args: {
  priceDistanceMultiplier: number;
  entryTarget: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number | null;
}) {
  const multiplier = args.priceDistanceMultiplier;
  if (Math.abs(multiplier - 1) < 0.000001) {
    return {
      entryTarget: args.entryTarget,
      sl: args.sl,
      tp1: args.tp1,
      tp2: args.tp2,
      tp3: args.tp3,
    };
  }

  return {
    entryTarget: args.entryTarget,
    sl: scaleLevelFromEntry(args.entryTarget, args.sl, multiplier),
    tp1: scaleLevelFromEntry(args.entryTarget, args.tp1, multiplier),
    tp2: scaleLevelFromEntry(args.entryTarget, args.tp2, multiplier),
    tp3: args.tp3 === null ? null : scaleLevelFromEntry(args.entryTarget, args.tp3, multiplier),
  };
}

function inferHitOutcome(args: {
  type: SignalType;
  livePrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number | null;
}): "tp1" | "tp2" | "tp3" | "sl" | null {
  const { type, livePrice, sl, tp1, tp2, tp3 } = args;
  if (type === "buy") {
    if (livePrice <= sl) return "sl";
    if (tp3 !== null && livePrice >= tp3) return "tp3";
    if (livePrice >= tp2) return "tp2";
    if (livePrice >= tp1) return "tp1";
    return null;
  }
  if (livePrice >= sl) return "sl";
  if (tp3 !== null && livePrice <= tp3) return "tp3";
  if (livePrice <= tp2) return "tp2";
  if (livePrice <= tp1) return "tp1";
  return null;
}

function classifyCycleOutcome(args: {
  type: SignalType;
  mode: SignalMode;
  entryTarget: number;
  closePrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number | null;
  peakPips: number;
  performanceSettings: PerformanceSettings;
}): SignalOutcome {
  const peakThreshold = args.mode === "intraday" ? args.performanceSettings.intradayPeakPips : args.performanceSettings.scalpingPeakPips;
  const immediateHit = inferHitOutcome({
    type: args.type,
    livePrice: args.closePrice,
    sl: args.sl,
    tp1: args.tp1,
    tp2: args.tp2,
    tp3: args.tp3,
  });

  if (immediateHit === "tp1" || immediateHit === "tp2" || immediateHit === "tp3") {
    return immediateHit;
  }

  if (immediateHit === "sl") {
    if (args.peakPips <= peakThreshold) return "sl";
    return "be";
  }

  const realizedPips =
    args.type === "buy"
      ? (args.closePrice - args.entryTarget) * GOLD_PIPS_MULTIPLIER
      : (args.entryTarget - args.closePrice) * GOLD_PIPS_MULTIPLIER;

  if (args.peakPips < peakThreshold && realizedPips <= 0) return "be";
  if (realizedPips <= 0) return "be";
  return "tp1";
}

function computeStoredNetPips(args: { outcome: SignalOutcome; realizedPips: number; peakPips: number; bePercentage: number }) {
  if (args.outcome === "sl") {
    return Number((-Math.abs(args.realizedPips)).toFixed(1));
  }
  if (args.outcome === "be") {
    return Number(Math.max(0, args.peakPips * (args.bePercentage / 100)).toFixed(1));
  }
  return Number(Math.max(args.realizedPips, args.peakPips).toFixed(1));
}

function getModeBucketWindowMs(mode: SignalMode) {
  return mode === "intraday" ? 4 * 60 * 60 * 1000 : 30 * 60 * 1000;
}

function getModeBucketBoundsIso(mode: SignalMode, anchor = new Date()) {
  const windowMs = getModeBucketWindowMs(mode);
  const anchorMs = anchor.getTime();
  const bucketStartMs = Math.floor(anchorMs / windowMs) * windowMs;
  return {
    fromIso: new Date(bucketStartMs).toISOString(),
    toIso: new Date(bucketStartMs + windowMs).toISOString(),
  };
}

function chooseOutcome(existing: SignalOutcome, next: SignalOutcome) {
  const rank: Record<SignalOutcome, number> = {
    sl: 0,
    be: 1,
    tp1: 2,
    tp2: 3,
    tp3: 4,
  };
  return rank[next] >= rank[existing] ? next : existing;
}

function parsePayload(payload: unknown): ParseResult {
  const body = asObject(payload);
  const pair = String(body.pair ?? body.symbol ?? "XAUUSD").trim().toUpperCase();
  const eventRaw = normalized(body.event) ?? "signal";
  const modeRaw = normalized(body.mode) ?? normalized(body.strategy) ?? "scalping";
  const typeRaw = normalized(body.type) ?? normalized(body.side) ?? "buy";
  const status = normalized(body.status) === "closed" ? "closed" : "active";

  if (eventRaw !== "signal" && eventRaw !== "price_update" && eventRaw !== "signal_closed") {
    return { ok: false, status: 400, error: "event must be signal, price_update or signal_closed" };
  }
  if (modeRaw !== "scalping" && modeRaw !== "intraday") {
    return { ok: false, status: 400, error: "mode/strategy must be scalping or intraday" };
  }
  if (eventRaw === "signal" && typeRaw !== "buy" && typeRaw !== "sell") {
    return { ok: false, status: 400, error: "type/side must be buy or sell" };
  }

  const entryTarget = asNumber(body.entry_target ?? body.entry);
  const livePrice = asNumber(body.live_price ?? body.price);
  const sl = asNumber(body.sl ?? body.stop_loss);
  const tp1 = asNumber(body.tp1);
  const tp2 = asNumber(body.tp2);
  const tp3 = asNumber(body.tp3);
  const closePrice = asNumber(body.close_price ?? body.live_price ?? body.price);
  const outcomeRaw = normalized(body.outcome);
  const parsedOutcome =
    outcomeRaw && ["tp1", "tp2", "tp3", "be", "sl"].includes(outcomeRaw)
      ? (outcomeRaw as SignalOutcome)
      : outcomeRaw
        ? null
        : null;

  if (outcomeRaw && !parsedOutcome) {
    return { ok: false, status: 400, error: "outcome must be tp1, tp2, tp3, be or sl" };
  }

  if (eventRaw === "price_update" && (livePrice === null || livePrice <= 0)) {
    return { ok: false, status: 400, error: "live_price (or price) is required for price_update" };
  }

  if (eventRaw === "signal_closed" && closePrice === null) {
    return { ok: false, status: 400, error: "close_price (or live_price/price) is required for signal_closed" };
  }

  if (eventRaw === "signal" && (entryTarget === null || livePrice === null || livePrice <= 0 || sl === null || tp1 === null || tp2 === null)) {
    return {
      ok: false,
      status: 400,
      error: "entry_target/live_price/sl/tp1/tp2 are required numbers for signal event",
    };
  }

  return {
    ok: true,
    event: eventRaw,
    pair,
    mode: modeRaw,
    type: typeRaw === "sell" ? "sell" : "buy",
    status,
    entryTarget,
    livePrice,
    sl,
    tp1,
    tp2,
    tp3,
    closePrice,
    outcomeRaw: parsedOutcome,
  };
}

async function findActiveSignal(
  supabase: SupabaseClient,
  brandId: BrandId,
  pair: string,
  mode: SignalMode,
): Promise<{ row: SignalSnapshot | null; error: string | null }> {
  const { data, error } = await supabase
    .from("signals")
    .select(
      "id, mode, type:action, entry_target:entry, live_price, sl:stop_loss, tp1:take_profit_1, tp2:take_profit_2, tp3:take_profit_3, max_floating_pips",
    )
    .eq("brand_id", brandId)
    .eq("pair", pair)
    .eq("mode", mode)
    .eq("status", "active")
    .is("master_signal_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  if (!data) return { row: null, error: null };

  const rowData = data as Record<string, unknown>;
  const row: SignalSnapshot = {
    id: String(rowData.id),
    mode: (normalized(rowData.mode) === "intraday" ? "intraday" : "scalping") as SignalMode,
    type: (normalized(rowData.type) === "sell" ? "sell" : "buy") as SignalType,
    entry_target: asNumber(rowData.entry_target) ?? 0,
    live_price: asNumber(rowData.live_price),
    sl: asNumber(rowData.sl) ?? 0,
    tp1: asNumber(rowData.tp1) ?? 0,
    tp2: asNumber(rowData.tp2) ?? 0,
    tp3: asNumber(rowData.tp3),
    max_floating_pips: asNumber(rowData.max_floating_pips),
  };
  return { row, error: null };
}

async function insertPerformanceLog(supabase: SupabaseClient, row: {
  brandId: BrandId;
  signalId: string;
  pair: string;
  mode: SignalMode;
  action: SignalType;
  outcome: SignalOutcome;
  points: number;
  price: number;
  netPips: number;
  peakPips: number;
}) {
  const now = new Date();
  const bounds = getModeBucketBoundsIso(row.mode, now);
  const bucketStartIso = bounds.fromIso;
  const roundedNet = Number(row.netPips.toFixed(1));
  const roundedPeak = Number(row.peakPips.toFixed(1));
  const roundedPoints = Number(row.points.toFixed(1));

  const { data: existingBySignal, error: findBySignalError } = await supabase
    .from("performance_logs")
    .select("id, outcome, net_pips, points, peak_pips")
    .eq("brand_id", row.brandId)
    .eq("signal_id", row.signalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findBySignalError) throw new Error(findBySignalError.message);

  if (existingBySignal) {
    const existingRow = existingBySignal as Record<string, unknown>;
    const existingOutcomeRaw = normalized(existingRow.outcome);
    const existingOutcome =
      existingOutcomeRaw === "tp1" ||
      existingOutcomeRaw === "tp2" ||
      existingOutcomeRaw === "tp3" ||
      existingOutcomeRaw === "be" ||
      existingOutcomeRaw === "sl"
        ? (existingOutcomeRaw as SignalOutcome)
        : row.outcome;

    const existingNet = asNumber(existingRow.net_pips) ?? asNumber(existingRow.points) ?? 0;
    const existingPeak = asNumber(existingRow.peak_pips) ?? existingNet;

    const mergedNet = Number(Math.max(existingNet, roundedNet).toFixed(1));
    const mergedPeak = Number(Math.max(existingPeak, roundedPeak, mergedNet).toFixed(1));
    const mergedOutcome = chooseOutcome(existingOutcome, row.outcome);

    const { error: updateError } = await supabase
      .from("performance_logs")
      .update({
        outcome: mergedOutcome,
        points: mergedNet,
        net_pips: mergedNet,
        peak_pips: mergedPeak,
        price: row.price,
      })
      .eq("id", String(existingRow.id));

    if (updateError) throw new Error(updateError.message);
    return String(existingRow.id);
  }

  const { data: existing, error: findError } = await supabase
    .from("performance_logs")
    .select("id, outcome, net_pips, points, peak_pips")
    .eq("brand_id", row.brandId)
    .eq("pair", row.pair)
    .eq("mode", row.mode)
    .eq("action", row.action)
    .gte("created_at", bounds.fromIso)
    .lt("created_at", bounds.toIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  if (existing) {
    const existingRow = existing as Record<string, unknown>;
    const existingOutcomeRaw = normalized(existingRow.outcome);
    const existingOutcome =
      existingOutcomeRaw === "tp1" ||
      existingOutcomeRaw === "tp2" ||
      existingOutcomeRaw === "tp3" ||
      existingOutcomeRaw === "be" ||
      existingOutcomeRaw === "sl"
        ? (existingOutcomeRaw as SignalOutcome)
        : row.outcome;

    const existingNet = asNumber(existingRow.net_pips) ?? asNumber(existingRow.points) ?? 0;
    const existingPeak = asNumber(existingRow.peak_pips) ?? existingNet;

    const mergedNet = Number(Math.max(existingNet, roundedNet).toFixed(1));
    const mergedPeak = Number(Math.max(existingPeak, roundedPeak, mergedNet).toFixed(1));
    const mergedOutcome = chooseOutcome(existingOutcome, row.outcome);

    const { error: updateError } = await supabase
      .from("performance_logs")
      .update({
        signal_id: row.signalId,
        outcome: mergedOutcome,
        points: mergedNet,
        net_pips: mergedNet,
        peak_pips: mergedPeak,
        price: row.price,
      })
      .eq("id", String(existingRow.id));

    if (updateError) throw new Error(updateError.message);
    return String(existingRow.id);
  }

  const { data, error } = await supabase
    .from("performance_logs")
    .insert({
      brand_id: row.brandId,
      signal_id: row.signalId,
      pair: row.pair,
      mode: row.mode,
      action: row.action,
      outcome: row.outcome,
      points: roundedPoints,
      price: row.price,
      net_pips: roundedNet,
      peak_pips: roundedPeak,
      created_at: bucketStartIso,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return String((data as Record<string, unknown>).id);
}

async function archivePreviousActiveSignal(args: {
  supabase: SupabaseClient;
  brandId: BrandId;
  pair: string;
  mode: SignalMode;
  performanceSettings: PerformanceSettings;
}) {
  const { supabase, brandId, pair, mode, performanceSettings } = args;
  let lastResult: { signalId: string; performanceLogId: string } | null = null;
  // Close ALL active signals for this pair+mode (handles leftover accumulation from churn),
  // not just the newest one. Guarded against runaway loops.
  for (let guard = 0; guard < 25; guard += 1) {
    const previousRes = await findActiveSignal(supabase, brandId, pair, mode);
    if (previousRes.error) throw new Error(previousRes.error);
    if (!previousRes.row) break;

    const previous = previousRes.row;
    const closePrice = previous.live_price && previous.live_price > 0 ? previous.live_price : previous.entry_target;
    const points =
      previous.type === "buy" ? closePrice - previous.entry_target : previous.entry_target - closePrice;
    const realizedPips = points * GOLD_PIPS_MULTIPLIER;
    const peakPips = Math.max(previous.max_floating_pips ?? 0, realizedPips);
    const outcome = classifyCycleOutcome({
      mode,
      performanceSettings,
      type: previous.type,
      entryTarget: previous.entry_target,
      closePrice,
      sl: previous.sl,
      tp1: previous.tp1,
      tp2: previous.tp2,
      tp3: previous.tp3,
      peakPips,
    });
    const historyPips = computeStoredNetPips({
      bePercentage: performanceSettings.bePercentage,
      outcome,
      realizedPips,
      peakPips,
    });

    const { error: closeError } = await supabase
      .from("signals")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", previous.id);
    if (closeError) throw new Error(closeError.message);

    const performanceLogId = await insertPerformanceLog(supabase, {
      brandId,
      signalId: previous.id,
      pair,
      mode,
      action: previous.type,
      outcome,
      points: historyPips,
      price: closePrice,
      netPips: historyPips,
      peakPips,
    });
    lastResult = { signalId: previous.id, performanceLogId };
  }
  return lastResult;
}

async function processPriceUpdate(args: {
  supabase: SupabaseClient;
  brandId: BrandId;
  pair: string;
  mode: SignalMode;
  livePrice: number;
  performanceSettings: PerformanceSettings;
}): Promise<BrandResult> {
  const { supabase, brandId, pair, mode, livePrice, performanceSettings } = args;
  const currentRes = await findActiveSignal(supabase, brandId, pair, mode);
  if (currentRes.error) return { brandId, event: "price_update", status: "failed", reason: currentRes.error };
  if (!currentRes.row) return { brandId, event: "price_update", status: "skipped", reason: "no_active_signal_found" };

  const current = currentRes.row;
  const points = current.type === "buy" ? livePrice - current.entry_target : current.entry_target - livePrice;
  const currentPips = points * GOLD_PIPS_MULTIPLIER;
  const maxFloatingPips = Math.max(current.max_floating_pips ?? 0, currentPips);
  const hitOutcome = inferHitOutcome({
    type: current.type,
    livePrice,
    sl: current.sl,
    tp1: current.tp1,
    tp2: current.tp2,
    tp3: current.tp3,
  });

  if (!hitOutcome || hitOutcome === "tp1" || hitOutcome === "tp2") {
    const { error } = await supabase
      .from("signals")
      .update({ live_price: livePrice, max_floating_pips: maxFloatingPips, updated_at: new Date().toISOString() })
      .eq("id", current.id);
    if (error) return { brandId, event: "price_update", status: "failed", reason: error.message };
    return { brandId, event: "price_update", status: "processed", signalId: current.id };
  }

  const realizedPips = currentPips;
  const peakPips = Math.max(maxFloatingPips, realizedPips);
  const classifiedOutcome = classifyCycleOutcome({
    mode,
    performanceSettings,
    type: current.type,
    entryTarget: current.entry_target,
    closePrice: livePrice,
    sl: current.sl,
    tp1: current.tp1,
    tp2: current.tp2,
    tp3: current.tp3,
    peakPips,
  });
  const historyPips = computeStoredNetPips({
    bePercentage: performanceSettings.bePercentage,
    outcome: classifiedOutcome,
    realizedPips,
    peakPips,
  });

  const { error: closeError } = await supabase
    .from("signals")
    .update({
      live_price: livePrice,
      max_floating_pips: peakPips,
      status: "closed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id);
  if (closeError) return { brandId, event: "price_update", status: "failed", reason: closeError.message };

  try {
    const performanceLogId = await insertPerformanceLog(supabase, {
      brandId,
      signalId: current.id,
      pair,
      mode: current.mode,
      action: current.type,
      outcome: classifiedOutcome,
      points: historyPips,
      price: livePrice,
      netPips: historyPips,
      peakPips,
    });
    return {
      brandId,
      event: "price_update",
      status: "processed",
      signalId: current.id,
      performanceLogId,
      outcome: classifiedOutcome,
    };
  } catch (error) {
    return {
      brandId,
      event: "price_update",
      status: "failed",
      reason: error instanceof Error ? error.message : "Failed to insert performance log",
    };
  }
}

async function processSignalClosed(args: {
  supabase: SupabaseClient;
  brandId: BrandId;
  pair: string;
  mode: SignalMode;
  closePrice: number;
  outcomeRaw: SignalOutcome | null;
  performanceSettings: PerformanceSettings;
}): Promise<BrandResult> {
  const { supabase, brandId, pair, mode, closePrice, outcomeRaw, performanceSettings } = args;
  const currentRes = await findActiveSignal(supabase, brandId, pair, mode);
  if (currentRes.error) return { brandId, event: "signal_closed", status: "failed", reason: currentRes.error };
  if (!currentRes.row) return { brandId, event: "signal_closed", status: "skipped", reason: "no_active_signal_found" };

  const current = currentRes.row;
  const points = current.type === "buy" ? closePrice - current.entry_target : current.entry_target - closePrice;
  const realizedPips = points * GOLD_PIPS_MULTIPLIER;
  const peakPips = Math.max(current.max_floating_pips ?? 0, realizedPips);
  const classifiedOutcome =
    outcomeRaw ??
    classifyCycleOutcome({
      mode,
      performanceSettings,
      type: current.type,
      entryTarget: current.entry_target,
      closePrice,
      sl: current.sl,
      tp1: current.tp1,
      tp2: current.tp2,
      tp3: current.tp3,
      peakPips,
    });
  const historyPips = computeStoredNetPips({
    bePercentage: performanceSettings.bePercentage,
    outcome: classifiedOutcome,
    realizedPips,
    peakPips,
  });

  const { error: closeError } = await supabase
    .from("signals")
    .update({ live_price: closePrice, status: "closed", max_floating_pips: peakPips, updated_at: new Date().toISOString() })
    .eq("id", current.id);
  if (closeError) return { brandId, event: "signal_closed", status: "failed", reason: closeError.message };

  try {
    const performanceLogId = await insertPerformanceLog(supabase, {
      brandId,
      signalId: current.id,
      pair,
      mode,
      action: current.type,
      outcome: classifiedOutcome,
      points: historyPips,
      price: closePrice,
      netPips: historyPips,
      peakPips,
    });
    return {
      brandId,
      event: "signal_closed",
      status: "processed",
      signalId: current.id,
      performanceLogId,
      outcome: classifiedOutcome,
    };
  } catch (error) {
    return {
      brandId,
      event: "signal_closed",
      status: "failed",
      reason: error instanceof Error ? error.message : "Failed to insert performance log",
    };
  }
}

async function processSignalOpen(args: {
  supabase: SupabaseClient;
  brandId: BrandId;
  priceDistanceMultiplier: number;
  pair: string;
  mode: SignalMode;
  type: SignalType;
  status: "active" | "closed";
  entryTarget: number;
  livePrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number | null;
  performanceSettings: PerformanceSettings;
}): Promise<BrandResult> {
  const {
    supabase,
    brandId,
    pair,
    mode,
    type,
    status,
    entryTarget,
    livePrice,
    sl,
    tp1,
    tp2,
    tp3,
    priceDistanceMultiplier,
    performanceSettings,
  } = args;
  const scaledLevels = scaleSignalLevelsForBrand({
    priceDistanceMultiplier,
    entryTarget,
    sl,
    tp1,
    tp2,
    tp3,
  });

  const cooldownFromIso = new Date(Date.now() - Math.max(10, SIGNAL_DUPLICATE_COOLDOWN_SECONDS) * 1000).toISOString();

  const { data: maybeDup, error: dupError } = await supabase
    .from("signals")
    .select("id, entry_target:entry")
    .eq("brand_id", brandId)
    .eq("pair", pair)
    .eq("mode", mode)
    .eq("action", type)
    .eq("status", "active")
    .is("master_signal_id", null)
    .gte("created_at", cooldownFromIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dupError) return { brandId, event: "signal", status: "failed", reason: dupError.message };
  if (maybeDup) {
    const dupEntry = asNumber((maybeDup as Record<string, unknown>).entry_target) ?? 0;
    if (Math.abs(dupEntry - entryTarget) < 0.05) {
      return {
        brandId,
        event: "signal",
        status: "duplicate",
        signalId: String((maybeDup as Record<string, unknown>).id),
        reason: "cooldown_active",
      };
    }
  }

  // 30-min slot gate: keep only ONE signal per pair+mode per bucket (slot). The source may
  // emit many signals within a slot at different entries (price moving); keep the first
  // confirmed one and ignore the rest until the next 30-min (or 4h) boundary.
  const slotBounds = getModeBucketBoundsIso(mode);
  const { data: slotDup } = await supabase
    .from("signals")
    .select("id")
    .eq("brand_id", brandId)
    .eq("pair", pair)
    .eq("mode", mode)
    .is("master_signal_id", null)
    .gte("created_at", slotBounds.fromIso)
    .lt("created_at", slotBounds.toIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (slotDup) {
    return {
      brandId,
      event: "signal",
      status: "duplicate",
      signalId: String((slotDup as Record<string, unknown>).id),
      reason: "slot_already_filled",
    };
  }

  try {
    await archivePreviousActiveSignal({ supabase, brandId, pair, mode, performanceSettings });
  } catch (error) {
    return {
      brandId,
      event: "signal",
      status: "failed",
      reason: error instanceof Error ? error.message : "Failed to archive previous signal",
    };
  }

  const immediateHit = inferHitOutcome({
    type,
    livePrice,
    sl: scaledLevels.sl,
    tp1: scaledLevels.tp1,
    tp2: scaledLevels.tp2,
    tp3: scaledLevels.tp3,
  });
  const immediateOutcome = (immediateHit === "tp3" || immediateHit === "sl")
    ? classifyCycleOutcome({
        mode,
        performanceSettings,
        type,
        entryTarget,
        closePrice: livePrice,
        sl: scaledLevels.sl,
        tp1: scaledLevels.tp1,
        tp2: scaledLevels.tp2,
        tp3: scaledLevels.tp3,
        peakPips: Math.max(0, (type === "buy" ? livePrice - entryTarget : entryTarget - livePrice) * GOLD_PIPS_MULTIPLIER),
      })
    : null;
  const finalStatus = (immediateHit === "tp3" || immediateHit === "sl") ? "closed" : status;

  const { data, error } = await supabase
    .from("signals")
    .insert({
      brand_id: brandId,
      pair,
      mode,
      action: type,
      entry: entryTarget,
      live_price: livePrice,
      stop_loss: scaledLevels.sl,
      take_profit_1: scaledLevels.tp1,
      take_profit_2: scaledLevels.tp2,
      take_profit_3: scaledLevels.tp3,
      max_floating_pips: 0,
      status: finalStatus,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { brandId, event: "signal", status: "failed", reason: error.message };
  const signalId = String((data as Record<string, unknown>).id);

  if (!immediateOutcome) {
    return { brandId, event: "signal", status: "processed", signalId };
  }

  const points = type === "buy" ? livePrice - entryTarget : entryTarget - livePrice;
  const realizedPips = points * GOLD_PIPS_MULTIPLIER;
  const peakPips = Math.max(0, realizedPips);
  const historyPips = computeStoredNetPips({
    bePercentage: performanceSettings.bePercentage,
    outcome: immediateOutcome,
    realizedPips,
    peakPips,
  });

  try {
    const performanceLogId = await insertPerformanceLog(supabase, {
      brandId,
      signalId,
      pair,
      mode,
      action: type,
      outcome: immediateOutcome,
      points: historyPips,
      price: livePrice,
      netPips: historyPips,
      peakPips,
    });
    return {
      brandId,
      event: "signal",
      status: "processed",
      signalId,
      performanceLogId,
      outcome: immediateOutcome,
    };
  } catch (error) {
    return {
      brandId,
      event: "signal",
      status: "failed",
      reason: error instanceof Error ? error.message : "Failed to insert immediate performance log",
      signalId,
    };
  }
}

async function markIngressStatus(
  supabase: SupabaseClient,
  ingressId: string | null | undefined,
  status: "processed" | "failed",
  errorMessage: string | null = null,
) {
  if (!ingressId) return;
  await supabase
    .from("webhook_event_ingress")
    .update({
      status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", ingressId);
}

async function persistIngressDbFanoutSummary(
  supabase: SupabaseClient,
  ingressId: string | null | undefined,
  summary: DbFanoutSummary,
) {
  if (!ingressId) return;
  const { data, error } = await supabase.from("webhook_event_ingress").select("payload").eq("id", ingressId).maybeSingle();
  if (error || !data) return;

  const row = data as Record<string, unknown>;
  const payload = asObject(row.payload);
  const existingMeta = asObject(payload.hq_meta ?? payload.hqMeta);
  const nextPayload = {
    ...payload,
    hq_meta: {
      ...existingMeta,
      dbFanout: summary,
    },
  };

  await supabase.from("webhook_event_ingress").update({ payload: nextPayload }).eq("id", ingressId);
}

export async function fanoutSignalToBrandsDb(input: {
  supabase: SupabaseClient;
  payload: unknown;
  targetBrands: BrandId[];
  ingressId?: string | null;
}): Promise<DbFanoutResult> {
  const parsed = parsePayload(input.payload);
  const orderedBrands = Array.from(new Set(input.targetBrands)).sort((a, b) => {
    if (a === "kafra" && b !== "kafra") return -1;
    if (b === "kafra" && a !== "kafra") return 1;
    return a.localeCompare(b);
  });

  if (!parsed.ok) {
    await markIngressStatus(input.supabase, input.ingressId, "failed", parsed.error);
    await persistIngressDbFanoutSummary(input.supabase, input.ingressId, {
      ok: false,
      status: parsed.status,
      totalBrands: orderedBrands.length,
      processed: 0,
      skipped: 0,
      duplicates: 0,
      failed: orderedBrands.length,
      results: [],
      error: parsed.error,
    });
    return {
      ok: false,
      totalBrands: orderedBrands.length,
      processed: 0,
      skipped: 0,
      duplicates: 0,
      failed: orderedBrands.length,
      results: [],
      error: parsed.error,
      status: parsed.status,
    };
  }

  const brandPriceDistanceMultiplierMap = await loadBrandPriceDistanceMultiplierMap(input.supabase, orderedBrands);
  const brandPerformanceSettingsMap = await loadBrandPerformanceSettingsMap(input.supabase, orderedBrands);

  const results: BrandResult[] = [];
  for (const brandId of orderedBrands) {
    try {
      if (parsed.event === "price_update") {
        results.push(
          await processPriceUpdate({
            supabase: input.supabase,
            brandId,
            pair: parsed.pair,
            mode: parsed.mode,
            livePrice: parsed.livePrice ?? 0,
            performanceSettings: brandPerformanceSettingsMap[brandId] ?? { bePercentage: 80, scalpingPeakPips: 10, intradayPeakPips: 50 },
          }),
        );
        continue;
      }

      if (parsed.event === "signal_closed") {
        results.push(
          await processSignalClosed({
            supabase: input.supabase,
            brandId,
            pair: parsed.pair,
            mode: parsed.mode,
            closePrice: parsed.closePrice ?? 0,
            outcomeRaw: parsed.outcomeRaw,
            performanceSettings: brandPerformanceSettingsMap[brandId] ?? { bePercentage: 80, scalpingPeakPips: 10, intradayPeakPips: 50 },
          }),
        );
        continue;
      }

      results.push(
        await processSignalOpen({
          supabase: input.supabase,
          brandId,
          priceDistanceMultiplier: brandPriceDistanceMultiplierMap[brandId] ?? 1,
          pair: parsed.pair,
          mode: parsed.mode,
          type: parsed.type,
          status: parsed.status,
          entryTarget: parsed.entryTarget ?? 0,
          livePrice: parsed.livePrice ?? 0,
          sl: parsed.sl ?? 0,
          tp1: parsed.tp1 ?? 0,
          tp2: parsed.tp2 ?? 0,
          tp3: parsed.tp3,
          performanceSettings: brandPerformanceSettingsMap[brandId] ?? { bePercentage: 80, scalpingPeakPips: 10, intradayPeakPips: 50 },
        }),
      );
    } catch (error) {
      results.push({
        brandId,
        event: parsed.event,
        status: "failed",
        reason: error instanceof Error ? error.message : "Unhandled brand processing failure",
      });
    }
  }

  const processed = results.filter((row) => row.status === "processed").length;
  const skipped = results.filter((row) => row.status === "skipped").length;
  const duplicates = results.filter((row) => row.status === "duplicate").length;
  const failed = results.filter((row) => row.status === "failed").length;
  const ok = failed === 0;

  await persistIngressDbFanoutSummary(input.supabase, input.ingressId, {
    ok,
    status: ok ? 200 : 207,
    event: parsed.event,
    pair: parsed.pair,
    mode: parsed.mode,
    totalBrands: orderedBrands.length,
    processed,
    skipped,
    duplicates,
    failed,
    results: results.map((row) => ({
      brandId: row.brandId,
      status: row.status,
      event: row.event,
      reason: row.reason,
    })),
    error: ok ? undefined : "One or more brand writes failed in HQ DB fanout",
  });

  await markIngressStatus(
    input.supabase,
    input.ingressId,
    ok ? "processed" : "failed",
    ok ? null : "One or more brand writes failed in HQ DB fanout",
  );

  return {
    ok,
    event: parsed.event,
    pair: parsed.pair,
    mode: parsed.mode,
    totalBrands: orderedBrands.length,
    processed,
    skipped,
    duplicates,
    failed,
    results,
    status: ok ? 200 : 207,
  };
}
