import { NextResponse } from "next/server";
import { getHqSupabaseServiceClient, getWebhookFlags, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";
import type { BrandId } from "@/lib/registry";

const ALLOWED_OUTCOMES = new Set(["tp1", "tp2", "tp3", "be", "sl"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERFORMANCE_SELECT = "id, brand_id, signal_id, pair, mode, action, outcome, points, net_pips, peak_pips, price, created_at";
const ALL_BRAND_IDS: BrandId[] = ["kafra", "sarjan", "richjoker", "shinobi"];

type PerformanceRow = {
  id: string;
  brand_id: string;
  mode: "scalping" | "intraday";
  type: "buy" | "sell";
  outcome: "tp1" | "tp2" | "tp3" | "be" | "sl";
  pair: string;
  net_pips: number | null;
  peak_pips: number | null;
  price: number | null;
  note: string | null;
  created_at: string;
};

type UpdatePerformanceBody = {
  logId?: string;
  brandId?: string;
  propagateAllBrands?: boolean;
  outcome?: string;
  mode?: string;
  points?: number | string | null;
  netPips?: number | string | null;
  peakPips?: number | string | null;
  price?: number | string | null;
  note?: string;
  reason?: string;
  editedBy?: string | null;
  csv?: string;
  ids?: string[];
};

type CsvPerfRecord = {
  sourceId: string | null;
  brandId: BrandId;
  createdAtIso: string;
  pair: string;
  mode: "scalping" | "intraday";
  type: "buy" | "sell";
  outcome: "tp1" | "tp2" | "tp3" | "be" | "sl";
  netPips: number;
  peakPips: number | null;
  note: string | null;
};

type PerfFilters = {
  brandId: BrandId | null;
  mode: "scalping" | "intraday" | null;
  type: "buy" | "sell" | null;
  outcome: "tp1" | "tp2" | "tp3" | "be" | "sl" | null;
  fromIso: string | null;
  toIso: string | null;
  q: string;
};

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundPips(value: number | null, decimals = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toCsvValue(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeBrandId(input: string | null | undefined): BrandId | null {
  const value = (input ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "kafra") return "kafra";
  if (value === "sarjan") return "sarjan";
  if (value === "shinobi") return "shinobi";
  if (value === "richjoker" || value === "richjokerindi" || value === "richjoker_indi" || value === "rich-joker" || value === "joker" || value === "rich joker") {
    return "richjoker";
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }

  out.push(cur);
  return out.map((x) => x.trim());
}

function parseDateToIso(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4}),\s*(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyOrYyyy = Number(m[3]);
    const hh = Number(m[4]);
    const mi = Number(m[5]);
    const ss = Number(m[6]);
    const fullYear = String(m[3]).length === 4 ? yyOrYyyy : (yyOrYyyy >= 70 ? 1900 + yyOrYyyy : 2000 + yyOrYyyy);
    const utcMs = Date.UTC(fullYear, mm - 1, dd, hh - 8, mi, ss);
    if (Number.isNaN(utcMs)) return null;
    return new Date(utcMs).toISOString();
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toSecEpoch(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function toModeBucketEpoch(iso: string, mode: "scalping" | "intraday") {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 0;
  const intervalMs = mode === "intraday" ? 4 * 60 * 60 * 1000 : 30 * 60 * 1000;
  return Math.floor(ms / intervalMs) * intervalMs;
}

function normalizePerformanceRow(row: Record<string, unknown>, note: string | null = null): PerformanceRow {
  const points = parseNumber(row.points);
  const netPipsRaw = parseNumber(row.net_pips) ?? points;
  const peakPipsRaw = parseNumber(row.peak_pips) ?? netPipsRaw ?? points;
  const netPips = roundPips(netPipsRaw);
  const peakPips = roundPips(peakPipsRaw);
  return {
    id: String(row.id),
    brand_id: String(row.brand_id),
    mode: row.mode === "intraday" ? "intraday" : "scalping",
    type: row.action === "sell" ? "sell" : "buy",
    outcome: (typeof row.outcome === "string" && ALLOWED_OUTCOMES.has(row.outcome)) ? row.outcome as PerformanceRow["outcome"] : "be",
    pair: typeof row.pair === "string" && row.pair.length > 0 ? row.pair : "XAUUSD",
    net_pips: netPips,
    peak_pips: peakPips,
    price: parseNumber(row.price),
    note,
    created_at: String(row.created_at),
  };
}

function toMinuteBucket(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16);
  return d.toISOString().slice(0, 16);
}

function dedupePerformanceRows(rows: PerformanceRow[]) {
  const seen = new Set<string>();
  const out: PerformanceRow[] = [];

  for (const row of rows) {
    const key = [
      row.brand_id,
      row.pair,
      toMinuteBucket(row.created_at),
      row.mode,
      row.type,
      row.outcome,
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function parseFilters(searchParams: URLSearchParams): PerfFilters {
  const brandId = normalizeBrandId(searchParams.get("brandId"));
  const modeRaw = (searchParams.get("mode") ?? "").trim().toLowerCase();
  const typeRaw = (searchParams.get("type") ?? "").trim().toLowerCase();
  const outcomeRaw = (searchParams.get("outcome") ?? "").trim().toLowerCase();
  const fromIso = parseDateToIso(searchParams.get("from") ?? "");
  const toIso = parseDateToIso(searchParams.get("to") ?? "");
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  return {
    brandId,
    mode: modeRaw === "scalping" || modeRaw === "intraday" ? modeRaw : null,
    type: typeRaw === "buy" || typeRaw === "sell" ? typeRaw : null,
    outcome: ALLOWED_OUTCOMES.has(outcomeRaw) ? outcomeRaw as PerfFilters["outcome"] : null,
    fromIso,
    toIso,
    q,
  };
}

function applyFilters<T>(query: T, filters: PerfFilters) {
  let scoped = query as T & {
    eq: (column: string, value: string) => typeof scoped;
    gte: (column: string, value: string) => typeof scoped;
    lte: (column: string, value: string) => typeof scoped;
  };
  if (filters.brandId) scoped = scoped.eq("brand_id", filters.brandId);
  if (filters.mode) scoped = scoped.eq("mode", filters.mode);
  if (filters.type) scoped = scoped.eq("action", filters.type);
  if (filters.outcome) scoped = scoped.eq("outcome", filters.outcome);
  if (filters.fromIso) scoped = scoped.gte("created_at", filters.fromIso);
  if (filters.toIso) scoped = scoped.lte("created_at", filters.toIso);
  return scoped;
}

function csvHeaderIndex(header: string[], names: string[]) {
  const lowered = header.map((h) => h.toLowerCase().trim());
  for (const name of names) {
    const idx = lowered.findIndex((h) => h === name);
    if (idx >= 0) return idx;
  }
  return -1;
}

async function attachLatestNotes(
  supabase: NonNullable<ReturnType<typeof getHqSupabaseServiceClient>>,
  rows: Array<Record<string, unknown>>,
) {
  const ids = rows.map((row) => String(row.id));
  const latestReasonByLogId = new Map<string, string>();
  if (!ids.length) return latestReasonByLogId;

  const { data, error } = await supabase
    .from("performance_log_edits")
    .select("log_id, reason, created_at")
    .in("log_id", ids)
    .order("created_at", { ascending: false });

  if (error || !data) return latestReasonByLogId;
  for (const item of data as Array<Record<string, unknown>>) {
    const logId = typeof item.log_id === "string" ? item.log_id : null;
    if (!logId || latestReasonByLogId.has(logId)) continue;
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (reason) latestReasonByLogId.set(logId, reason);
  }
  return latestReasonByLogId;
}

async function resolvePropagationRows(
  supabase: NonNullable<ReturnType<typeof getHqSupabaseServiceClient>>,
  seedRows: Array<Record<string, unknown>>,
) {
  const resolved = new Map<string, Record<string, unknown>>();
  for (const row of seedRows) {
    const rowId = String(row.id);
    resolved.set(rowId, row);

    const sourcePair = typeof row.pair === "string" && row.pair.trim().length > 0 ? row.pair : "XAUUSD";
    const sourceMode = row.mode === "intraday" ? "intraday" : "scalping";
    const sourceType = row.action === "sell" ? "sell" : "buy";
    const sourceCreatedAtMs = new Date(String(row.created_at)).getTime();
    if (!Number.isFinite(sourceCreatedAtMs)) continue;

    const windowMs = 5 * 60 * 1000;
    const fromIso = new Date(sourceCreatedAtMs - windowMs).toISOString();
    const toIso = new Date(sourceCreatedAtMs + windowMs).toISOString();

    const { data: candidateRows, error } = await supabase
      .from("performance_logs")
      .select(PERFORMANCE_SELECT)
      .eq("pair", sourcePair)
      .eq("mode", sourceMode)
      .eq("action", sourceType)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(2000);
    if (error) throw new Error(error.message);

    const nearestByBrand = new Map<string, Record<string, unknown>>();
    for (const candidate of (candidateRows ?? []) as Array<Record<string, unknown>>) {
      const candidateBrand = String(candidate.brand_id);
      const candidateMs = new Date(String(candidate.created_at)).getTime();
      if (!Number.isFinite(candidateMs)) continue;

      const previous = nearestByBrand.get(candidateBrand);
      if (!previous) {
        nearestByBrand.set(candidateBrand, candidate);
        continue;
      }

      const prevDiff = Math.abs(new Date(String(previous.created_at)).getTime() - sourceCreatedAtMs);
      const nextDiff = Math.abs(candidateMs - sourceCreatedAtMs);
      if (nextDiff < prevDiff) nearestByBrand.set(candidateBrand, candidate);
    }

    for (const candidate of nearestByBrand.values()) {
      resolved.set(String(candidate.id), candidate);
    }
  }

  return Array.from(resolved.values());
}

function getModeBucketWindowMs(mode: string) {
  return mode === "intraday" ? 4 * 60 * 60 * 1000 : 30 * 60 * 1000;
}

function getBucketBoundsIso(createdAtRaw: string, modeRaw: string) {
  const createdAtMs = new Date(createdAtRaw).getTime();
  if (!Number.isFinite(createdAtMs)) return null;
  const intervalMs = getModeBucketWindowMs(modeRaw);
  const bucketStartMs = Math.floor(createdAtMs / intervalMs) * intervalMs;
  const bucketEndMs = bucketStartMs + intervalMs;
  return {
    fromIso: new Date(bucketStartMs).toISOString(),
    toIso: new Date(bucketEndMs).toISOString(),
  };
}

async function resolvePropagationClusterRows(
  supabase: NonNullable<ReturnType<typeof getHqSupabaseServiceClient>>,
  seedRows: Array<Record<string, unknown>>,
) {
  const resolved = new Map<string, Record<string, unknown>>();
  for (const row of seedRows) {
    resolved.set(String(row.id), row);
    const sourcePair = typeof row.pair === "string" && row.pair.trim().length > 0 ? row.pair : "XAUUSD";
    const sourceMode = row.mode === "intraday" ? "intraday" : "scalping";
    const sourceType = row.action === "sell" ? "sell" : "buy";
    const sourceOutcome = typeof row.outcome === "string" ? row.outcome : null;
    if (!sourceOutcome) continue;

    const bounds = getBucketBoundsIso(String(row.created_at), sourceMode);
    if (!bounds) continue;

    const { data: candidateRows, error } = await supabase
      .from("performance_logs")
      .select(PERFORMANCE_SELECT)
      .eq("pair", sourcePair)
      .eq("mode", sourceMode)
      .eq("action", sourceType)
      .eq("outcome", sourceOutcome)
      .gte("created_at", bounds.fromIso)
      .lt("created_at", bounds.toIso)
      .limit(5000);
    if (error) throw new Error(error.message);

    for (const candidate of (candidateRows ?? []) as Array<Record<string, unknown>>) {
      resolved.set(String(candidate.id), candidate);
    }
  }

  return Array.from(resolved.values());
}

async function importPerformanceCsv(
  supabase: NonNullable<ReturnType<typeof getHqSupabaseServiceClient>>,
  csv: string,
  fallbackBrandId: BrandId | null,
  propagateAllBrands = false,
) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { ok: false as const, status: 400, error: "CSV must include header and at least one row." };
  }

  const header = parseCsvLine(lines[0]);
  const idxId = csvHeaderIndex(header, ["id", "tick", "log_id"]);
  const idxBrand = csvHeaderIndex(header, ["brand", "brand_id"]);
  const idxTime = csvHeaderIndex(header, ["time", "created_at", "timestamp"]);
  const idxMode = csvHeaderIndex(header, ["mode"]);
  const idxType = csvHeaderIndex(header, ["type", "action"]);
  const idxOutcome = csvHeaderIndex(header, ["outcome"]);
  const idxNet = csvHeaderIndex(header, ["net pips", "net_pips", "points"]);
  const idxPeak = csvHeaderIndex(header, ["peak pips", "peak_pips"]);
  const idxPair = csvHeaderIndex(header, ["pair"]);
  const idxNote = csvHeaderIndex(header, ["note", "reason"]);

  if ([idxTime, idxMode, idxType, idxOutcome, idxNet].some((idx) => idx < 0)) {
    return {
      ok: false as const,
      status: 400,
      error: "Missing required columns. Required: Time, Mode, Type, Outcome, Net Pips. Optional: Brand, Peak Pips, Pair, Note, ID.",
    };
  }

  const parsed: CsvPerfRecord[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const sourceIdRaw = idxId >= 0 ? (cols[idxId] ?? "").trim() : "";
    const brandRaw = idxBrand >= 0 ? cols[idxBrand] : "";
    const brandId = normalizeBrandId(brandRaw) ?? fallbackBrandId;
    const createdAtIso = parseDateToIso(cols[idxTime] ?? "");
    const modeRaw = (cols[idxMode] ?? "").trim().toLowerCase();
    const typeRaw = (cols[idxType] ?? "").trim().toLowerCase();
    const outcomeRaw = (cols[idxOutcome] ?? "").trim().toLowerCase();
    const pairRaw = idxPair >= 0 ? (cols[idxPair] ?? "").trim().toUpperCase() : "XAUUSD";
    const noteRaw = idxNote >= 0 ? (cols[idxNote] ?? "").trim() : "";
    const netRaw = (cols[idxNet] ?? "").replace(/[^\d.-]/g, "");
    const peakRaw = idxPeak >= 0 ? (cols[idxPeak] ?? "").replace(/[^\d.-]/g, "") : "";

    const netPips = Number(netRaw);
    const peakPips = peakRaw === "" ? null : Number(peakRaw);
    const modeOk = modeRaw === "scalping" || modeRaw === "intraday";
    const typeOk = typeRaw === "buy" || typeRaw === "sell";
    const outcomeOk = ALLOWED_OUTCOMES.has(outcomeRaw);
    const pair = pairRaw || "XAUUSD";

    if (!brandId || !createdAtIso || !modeOk || !typeOk || !outcomeOk || !Number.isFinite(netPips) || (peakPips !== null && !Number.isFinite(peakPips))) {
      skipped += 1;
      continue;
    }

    parsed.push({
      sourceId: sourceIdRaw || null,
      brandId,
      createdAtIso,
      pair,
      mode: modeRaw as CsvPerfRecord["mode"],
      type: typeRaw as CsvPerfRecord["type"],
      outcome: outcomeRaw as CsvPerfRecord["outcome"],
      netPips,
      peakPips,
      note: noteRaw ? noteRaw.slice(0, 500) : null,
    });
  }

  if (!parsed.length) {
    return { ok: false as const, status: 400, error: "No valid CSV rows to import.", skipped };
  }

  const importRows = propagateAllBrands
    ? parsed.flatMap((row) =>
      ALL_BRAND_IDS.map((brandId) => ({
        ...row,
        brandId,
        sourceId: null,
      })))
    : parsed;

  const dedupedImportMap = new Map<string, CsvPerfRecord>();
  for (const row of importRows) {
    const bucketEpoch = toModeBucketEpoch(row.createdAtIso, row.mode);
    const dedupeKey = `${row.brandId}|${row.pair}|${row.mode}|${row.type}|${bucketEpoch}`;
    const previous = dedupedImportMap.get(dedupeKey);
    if (!previous) {
      dedupedImportMap.set(dedupeKey, row);
      continue;
    }
    const previousMs = new Date(previous.createdAtIso).getTime();
    const nextMs = new Date(row.createdAtIso).getTime();
    if (nextMs >= previousMs) {
      dedupedImportMap.set(dedupeKey, row);
    }
  }
  const finalImportRows = Array.from(dedupedImportMap.values());
  const csvDuplicatesCollapsed = importRows.length - finalImportRows.length;

  const uniqueBrands = Array.from(new Set(finalImportRows.map((row) => row.brandId)));
  const minIso = finalImportRows.reduce((acc, row) => (row.createdAtIso < acc ? row.createdAtIso : acc), finalImportRows[0].createdAtIso);
  const maxIso = finalImportRows.reduce((acc, row) => (row.createdAtIso > acc ? row.createdAtIso : acc), finalImportRows[0].createdAtIso);

  const { data: existingRows, error: existingError } = await supabase
    .from("performance_logs")
    .select("id, brand_id, pair, created_at, mode, action, outcome")
    .in("brand_id", uniqueBrands)
    .gte("created_at", minIso)
    .lte("created_at", maxIso)
    .order("created_at", { ascending: false })
    .limit(20000);

  if (existingError) {
    return { ok: false as const, status: 500, error: existingError.message };
  }

  const byId = new Map<string, { id: string; brand_id: string; outcome: string | null }>();
  const byKey = new Map<string, Array<{ id: string; used: boolean; outcome: string | null }>>();
  for (const row of (existingRows ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.id);
    const brandId = String(row.brand_id);
    const mode = row.mode === "intraday" ? "intraday" : "scalping";
    const type = row.action === "sell" ? "sell" : "buy";
    const createdAt = String(row.created_at);
    const bucketEpoch = toModeBucketEpoch(createdAt, mode);
    const pair = typeof row.pair === "string" && row.pair.length > 0 ? row.pair : "XAUUSD";
    const key = `${brandId}|${pair}|${mode}|${type}|${bucketEpoch}`;
    const outcome = typeof row.outcome === "string" ? row.outcome : null;
    byId.set(id, { id, brand_id: brandId, outcome });
    const bucket = byKey.get(key) ?? [];
    bucket.push({ id, used: false, outcome });
    byKey.set(key, bucket);
  }

  let updated = 0;
  let inserted = 0;
  let auditErrors = 0;
  let dbDuplicatesPruned = 0;
  const cleanedExistingKeys = new Set<string>();

  for (const row of finalImportRows) {
    const bucketEpoch = toModeBucketEpoch(row.createdAtIso, row.mode);
    const key = `${row.brandId}|${row.pair}|${row.mode}|${row.type}|${bucketEpoch}`;
    let matched: { id: string; brand_id: string; outcome: string | null } | null = null;
    if (row.sourceId && byId.has(row.sourceId)) {
      matched = byId.get(row.sourceId) ?? null;
    } else {
      const bucket = byKey.get(key) ?? [];
      const candidate = bucket.find((item) => !item.used);
      if (candidate) {
        candidate.used = true;
        matched = { id: candidate.id, brand_id: row.brandId, outcome: candidate.outcome };
      }
    }

    if (matched) {
      const { error: updateError } = await supabase
        .from("performance_logs")
        .update({
          pair: row.pair,
          mode: row.mode,
          action: row.type,
          outcome: row.outcome,
          points: row.netPips,
          net_pips: row.netPips,
          peak_pips: row.peakPips,
          created_at: row.createdAtIso,
        })
        .eq("id", matched.id)
        .eq("brand_id", row.brandId);

      if (updateError) {
        return { ok: false as const, status: 500, error: updateError.message, skipped };
      }
      updated += 1;

      if (!cleanedExistingKeys.has(key)) {
        const bucket = byKey.get(key) ?? [];
        const duplicateIds = bucket
          .map((item) => item.id)
          .filter((id) => id !== matched?.id);
        if (duplicateIds.length > 0) {
          const { error: pruneError } = await supabase
            .from("performance_logs")
            .delete()
            .in("id", duplicateIds);
          if (pruneError) {
            return { ok: false as const, status: 500, error: pruneError.message, skipped };
          }
          dbDuplicatesPruned += duplicateIds.length;
        }
        cleanedExistingKeys.add(key);
      }

      if (row.note) {
        const { error: auditError } = await supabase.from("performance_log_edits").insert({
          brand_id: row.brandId,
          log_id: matched.id,
          previous_outcome: matched.outcome,
          next_outcome: row.outcome,
          reason: row.note,
          edited_by: null,
        });
        if (auditError) auditErrors += 1;
      }
      continue;
    }

    const insertPayload = {
      brand_id: row.brandId,
      pair: row.pair,
      mode: row.mode,
      action: row.type,
      outcome: row.outcome,
      points: row.netPips,
      net_pips: row.netPips,
      peak_pips: row.peakPips,
      created_at: row.createdAtIso,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from("performance_logs")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError) {
      return { ok: false as const, status: 500, error: insertError.message, skipped };
    }
    inserted += 1;

    if (row.note) {
      const insertedId = String((insertedRow as Record<string, unknown>).id);
      const { error: auditError } = await supabase.from("performance_log_edits").insert({
        brand_id: row.brandId,
        log_id: insertedId,
        previous_outcome: null,
        next_outcome: row.outcome,
        reason: row.note,
        edited_by: null,
      });
      if (auditError) auditErrors += 1;
    }
  }

  return {
    ok: true as const,
    imported: finalImportRows.length,
    sourceRows: parsed.length,
    propagatedAllBrands: propagateAllBrands,
    csvDuplicatesCollapsed,
    dbDuplicatesPruned,
    updated,
    inserted,
    skipped,
    auditErrors,
  };
}

export async function GET(request: Request) {
  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "HQ Supabase service client is not configured.", runtime: getWebhookRuntimeMeta() },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "").trim().toLowerCase();
  const filters = parseFilters(searchParams);
  const q = filters.q;
  const limitRaw = Number(searchParams.get("limit") ?? "1000");
  const offsetRaw = Number(searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.floor(limitRaw))) : 1000;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  const fetchLimit = 20000;
  const dataQuery = applyFilters(
    supabase.from("performance_logs").select(PERFORMANCE_SELECT),
    filters,
  )
    .order("created_at", { ascending: false })
    .limit(fetchLimit)
    .range(0, fetchLimit - 1);

  const { data, error } = await dataQuery;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const baseRows = (data ?? []) as Array<Record<string, unknown>>;
  const latestReasonByLogId = await attachLatestNotes(supabase, baseRows);
  let rows = baseRows.map((row) => normalizePerformanceRow(row, latestReasonByLogId.get(String(row.id)) ?? null));

  if (q) {
    rows = rows.filter((row) => {
      const haystack = [
        row.id,
        row.brand_id,
        row.pair,
        row.mode,
        row.type,
        row.outcome,
        row.note ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  const dedupedRows = dedupePerformanceRows(rows);
  const pagedRows = dedupedRows.slice(offset, offset + limit);

  if (format === "csv") {
    const header = ["id", "brand_id", "time", "pair", "mode", "type", "outcome", "net_pips", "peak_pips", "note"];
    const lines = dedupedRows.map((row) => [
      row.id,
      row.brand_id,
      row.created_at,
      row.pair,
      row.mode,
      row.type,
      row.outcome,
      row.net_pips ?? "",
      row.peak_pips ?? "",
      row.note ?? "",
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((value) => toCsvValue(value)).join(","))
      .join("\n");
    return new NextResponse(`${csv}\n`, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    flags: getWebhookFlags(),
    runtime: getWebhookRuntimeMeta(),
    total: dedupedRows.length,
    count: pagedRows.length,
    rows: pagedRows,
  });
}

export async function POST(request: Request) {
  const flags = getWebhookFlags();
  if (!flags.performanceEditorEnabled) {
    return NextResponse.json({ ok: false, error: "HQ performance editor is disabled by flag.", flags }, { status: 409 });
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "HQ Supabase service client is not configured.", runtime: getWebhookRuntimeMeta() },
      { status: 503 },
    );
  }

  let body: UpdatePerformanceBody;
  try {
    body = (await request.json()) as UpdatePerformanceBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  if (typeof body.csv === "string" && body.csv.trim().length > 0) {
    const fallbackBrandId = normalizeBrandId(body.brandId);
    const imported = await importPerformanceCsv(supabase, body.csv, fallbackBrandId, body.propagateAllBrands === true);
    if (!imported.ok) {
      return NextResponse.json({ ok: false, error: imported.error, skipped: imported.skipped ?? 0 }, { status: imported.status });
    }
    return NextResponse.json({ ok: true, ...imported, flags, runtime: getWebhookRuntimeMeta() });
  }

  const logId = body.logId?.trim();
  if (!logId) {
    return NextResponse.json({ ok: false, error: "logId is required." }, { status: 400 });
  }

  const brandId = normalizeBrandId(body.brandId);
  let existingQuery = supabase
    .from("performance_logs")
    .select(PERFORMANCE_SELECT)
    .eq("id", logId)
    .limit(1);

  if (brandId) {
    existingQuery = existingQuery.eq("brand_id", brandId);
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Performance log not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.mode === "string" && body.mode.trim().length > 0) {
    const normalizedMode = body.mode.trim().toLowerCase();
    if (normalizedMode !== "scalping" && normalizedMode !== "intraday") {
      return NextResponse.json({ ok: false, error: "mode must be scalping or intraday." }, { status: 400 });
    }
    updates.mode = normalizedMode;
  }

  if (typeof body.outcome === "string" && body.outcome.trim().length > 0) {
    const normalizedOutcome = body.outcome.trim().toLowerCase();
    if (!ALLOWED_OUTCOMES.has(normalizedOutcome)) {
      return NextResponse.json({ ok: false, error: "outcome must be tp1, tp2, tp3, be, or sl." }, { status: 400 });
    }
    updates.outcome = normalizedOutcome;
  }

  if (body.points !== undefined) {
    const parsed = body.points === null ? null : parseNumber(body.points);
    if (body.points !== null && parsed === null) {
      return NextResponse.json({ ok: false, error: "points must be a valid number or null." }, { status: 400 });
    }
    updates.points = parsed;
    updates.net_pips = parsed;
  }

  if (body.netPips !== undefined) {
    const parsed = body.netPips === null ? null : parseNumber(body.netPips);
    if (body.netPips !== null && parsed === null) {
      return NextResponse.json({ ok: false, error: "netPips must be a valid number or null." }, { status: 400 });
    }
    updates.points = parsed;
    updates.net_pips = parsed;
  }

  if (body.peakPips !== undefined) {
    const parsed = body.peakPips === null ? null : parseNumber(body.peakPips);
    if (body.peakPips !== null && parsed === null) {
      return NextResponse.json({ ok: false, error: "peakPips must be a valid number or null." }, { status: 400 });
    }
    updates.peak_pips = parsed;
  }

  if (body.price !== undefined) {
    const parsed = body.price === null ? null : parseNumber(body.price);
    if (body.price !== null && parsed === null) {
      return NextResponse.json({ ok: false, error: "price must be a valid number or null." }, { status: 400 });
    }
    updates.price = parsed;
  }

  const reasonInput = typeof body.note === "string"
    ? body.note
    : typeof body.reason === "string"
      ? body.reason
      : "";
  const reason = reasonInput.trim().length > 0 ? reasonInput.trim().slice(0, 500) : null;

  if (Object.keys(updates).length === 0 && !reason) {
    return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
  }

  const propagateAllBrands = body.propagateAllBrands === true;
  const sourcePair = typeof existing.pair === "string" && existing.pair.trim().length > 0 ? existing.pair : "XAUUSD";
  const sourceMode = existing.mode === "intraday" ? "intraday" : "scalping";
  const sourceType = existing.action === "sell" ? "sell" : "buy";
  const sourceBrandId = String(existing.brand_id);
  const sourceCreatedAt = new Date(String(existing.created_at));
  const sourceCreatedAtMs = sourceCreatedAt.getTime();

  let targetRows: Array<Record<string, unknown>> = [existing as Record<string, unknown>];
  if (propagateAllBrands && Number.isFinite(sourceCreatedAtMs)) {
    const windowMs = 5 * 60 * 1000;
    const fromIso = new Date(sourceCreatedAtMs - windowMs).toISOString();
    const toIso = new Date(sourceCreatedAtMs + windowMs).toISOString();

    const { data: candidateRows, error: candidateError } = await supabase
      .from("performance_logs")
      .select(PERFORMANCE_SELECT)
      .eq("pair", sourcePair)
      .eq("mode", sourceMode)
      .eq("action", sourceType)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(2000);

    if (candidateError) {
      return NextResponse.json({ ok: false, error: candidateError.message }, { status: 500 });
    }

    const nearestByBrand = new Map<string, Record<string, unknown>>();
    for (const candidate of (candidateRows ?? []) as Array<Record<string, unknown>>) {
      const candidateBrand = String(candidate.brand_id);
      const candidateMs = new Date(String(candidate.created_at)).getTime();
      if (!Number.isFinite(candidateMs)) continue;
      const existingCandidate = nearestByBrand.get(candidateBrand);
      if (!existingCandidate) {
        nearestByBrand.set(candidateBrand, candidate);
        continue;
      }
      const existingDiff = Math.abs(new Date(String(existingCandidate.created_at)).getTime() - sourceCreatedAtMs);
      const nextDiff = Math.abs(candidateMs - sourceCreatedAtMs);
      if (nextDiff < existingDiff) {
        nearestByBrand.set(candidateBrand, candidate);
      }
    }
    nearestByBrand.set(sourceBrandId, existing as Record<string, unknown>);
    targetRows = Array.from(nearestByBrand.values());
  }

  const targetIds = Array.from(new Set(targetRows.map((row) => String(row.id))));
  let currentRow = existing as Record<string, unknown>;
  if (Object.keys(updates).length > 0 && targetIds.length > 0) {
    const { data: updated, error: updateError } = await supabase
      .from("performance_logs")
      .update(updates)
      .in("id", targetIds)
      .select(PERFORMANCE_SELECT);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
    const updatedRows = (updated ?? []) as Array<Record<string, unknown>>;
    const sourceUpdatedRow = updatedRows.find((row) => String(row.id) === logId);
    if (sourceUpdatedRow) {
      currentRow = sourceUpdatedRow;
    }
  }

  const editedBy = body.editedBy && UUID_REGEX.test(body.editedBy) ? body.editedBy : null;
  const previousOutcome = typeof existing.outcome === "string" ? existing.outcome : null;
  const nextOutcome = typeof updates.outcome === "string" ? updates.outcome : previousOutcome;

  let auditLogged = 0;
  let auditError: string | null = null;
  for (const row of targetRows) {
    const rowPreviousOutcome = typeof row.outcome === "string" ? row.outcome : previousOutcome;
    const { error: editLogError } = await supabase.from("performance_log_edits").insert({
      brand_id: String(row.brand_id),
      log_id: String(row.id),
      previous_outcome: rowPreviousOutcome,
      next_outcome: nextOutcome,
      reason,
      edited_by: editedBy,
    });
    if (editLogError) {
      auditError = editLogError.message;
    } else {
      auditLogged += 1;
    }
  }

  const affectedBrandIds = Array.from(new Set(targetRows.map((row) => String(row.brand_id)))).sort();

  return NextResponse.json({
    ok: true,
    flags,
    runtime: getWebhookRuntimeMeta(),
    row: normalizePerformanceRow(currentRow, reason),
    auditLogged,
    auditError,
    propagatedAllBrands: propagateAllBrands,
    updatedRows: targetIds.length,
    updatedBrands: affectedBrandIds,
  });
}

export async function PATCH(request: Request) {
  const flags = getWebhookFlags();
  if (!flags.performanceEditorEnabled) {
    return NextResponse.json({ ok: false, error: "HQ performance editor is disabled by flag.", flags }, { status: 409 });
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "HQ Supabase service client is not configured.", runtime: getWebhookRuntimeMeta() },
      { status: 503 },
    );
  }

  let body: UpdatePerformanceBody;
  try {
    body = (await request.json()) as UpdatePerformanceBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "ids is required for bulk update." }, { status: 400 });
  }

  const brandId = normalizeBrandId(body.brandId);
  const updates: Record<string, unknown> = {};

  if (typeof body.mode === "string" && body.mode.trim().length > 0) {
    const normalizedMode = body.mode.trim().toLowerCase();
    if (normalizedMode !== "scalping" && normalizedMode !== "intraday") {
      return NextResponse.json({ ok: false, error: "mode must be scalping or intraday." }, { status: 400 });
    }
    updates.mode = normalizedMode;
  }

  if (typeof body.outcome === "string" && body.outcome.trim().length > 0) {
    const normalizedOutcome = body.outcome.trim().toLowerCase();
    if (!ALLOWED_OUTCOMES.has(normalizedOutcome)) {
      return NextResponse.json({ ok: false, error: "outcome must be tp1, tp2, tp3, be, or sl." }, { status: 400 });
    }
    updates.outcome = normalizedOutcome;
  }

  const reasonInput = typeof body.note === "string"
    ? body.note
    : typeof body.reason === "string"
      ? body.reason
      : "";
  const reason = reasonInput.trim().length > 0 ? reasonInput.trim().slice(0, 500) : null;

  if (Object.keys(updates).length === 0 && !reason) {
    return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
  }

  let existingQuery = supabase
    .from("performance_logs")
    .select("id, brand_id, outcome")
    .in("id", ids);

  if (brandId) {
    existingQuery = existingQuery.eq("brand_id", brandId);
  }

  const { data: existingRows, error: existingError } = await existingQuery;
  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  const rows = (existingRows ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) {
    return NextResponse.json({ ok: false, error: "No matching rows found for bulk update." }, { status: 404 });
  }

  if (Object.keys(updates).length > 0) {
    let updateQuery = supabase.from("performance_logs").update(updates).in("id", rows.map((row) => String(row.id)));
    if (brandId) {
      updateQuery = updateQuery.eq("brand_id", brandId);
    }
    const { error: updateError } = await updateQuery;
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
  }

  const editedBy = body.editedBy && UUID_REGEX.test(body.editedBy) ? body.editedBy : null;
  let auditLogged = 0;
  if (reason || typeof updates.outcome === "string") {
    for (const row of rows) {
      const previousOutcome = typeof row.outcome === "string" ? row.outcome : null;
      const nextOutcome = typeof updates.outcome === "string" ? updates.outcome : previousOutcome;
      const { error: auditError } = await supabase.from("performance_log_edits").insert({
        brand_id: String(row.brand_id),
        log_id: String(row.id),
        previous_outcome: previousOutcome,
        next_outcome: nextOutcome,
        reason,
        edited_by: editedBy,
      });
      if (!auditError) auditLogged += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    flags,
    runtime: getWebhookRuntimeMeta(),
    updated: rows.length,
    auditLogged,
  });
}

export async function DELETE(request: Request) {
  const flags = getWebhookFlags();
  if (!flags.performanceEditorEnabled) {
    return NextResponse.json({ ok: false, error: "HQ performance editor is disabled by flag.", flags }, { status: 409 });
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "HQ Supabase service client is not configured.", runtime: getWebhookRuntimeMeta() },
      { status: 503 },
    );
  }

  let body: UpdatePerformanceBody & { ids?: string[] };
  try {
    body = (await request.json()) as UpdatePerformanceBody & { ids?: string[] };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const propagateAllBrands = body.propagateAllBrands === true;
  const editedBy = body.editedBy && UUID_REGEX.test(body.editedBy) ? body.editedBy : null;
  const reasonInput = typeof body.note === "string"
    ? body.note
    : typeof body.reason === "string"
      ? body.reason
      : "";
  const reason = reasonInput.trim().length > 0 ? reasonInput.trim().slice(0, 500) : "Deleted from HQ editor";

  if (ids.length > 0) {
    const brandId = normalizeBrandId(body.brandId);
    let existingQuery = supabase
      .from("performance_logs")
      .select(PERFORMANCE_SELECT)
      .in("id", ids);
    if (brandId && !propagateAllBrands) {
      existingQuery = existingQuery.eq("brand_id", brandId);
    }
    const { data: existingRows, error: existingError } = await existingQuery;
    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    const seedRows = (existingRows ?? []) as Array<Record<string, unknown>>;
    if (!seedRows.length) {
      return NextResponse.json({ ok: false, error: "No matching rows found for delete." }, { status: 404 });
    }

    let targetRows = seedRows;
    if (propagateAllBrands) {
      try {
        targetRows = await resolvePropagationClusterRows(supabase, seedRows);
      } catch (resolveError) {
        const message = resolveError instanceof Error ? resolveError.message : "Failed resolving propagation targets.";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
      }
    }

    const targetIds = Array.from(new Set(targetRows.map((row) => String(row.id))));
    const { error: deleteError } = await supabase.from("performance_logs").delete().in("id", targetIds);
    if (deleteError) {
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    let auditLogged = 0;
    for (const row of targetRows) {
      const { error: auditError } = await supabase.from("performance_log_edits").insert({
        brand_id: String(row.brand_id),
        log_id: String(row.id),
        previous_outcome: typeof row.outcome === "string" ? row.outcome : null,
        next_outcome: null,
        reason,
        edited_by: editedBy,
      });
      if (!auditError) auditLogged += 1;
    }

    return NextResponse.json({
      ok: true,
      deleted: targetIds.length,
      auditLogged,
      propagatedAllBrands: propagateAllBrands,
      flags,
      runtime: getWebhookRuntimeMeta(),
    });
  }

  const logId = body.logId?.trim();
  if (!logId) {
    return NextResponse.json({ ok: false, error: "logId is required." }, { status: 400 });
  }

  const brandId = normalizeBrandId(body.brandId);
  let existingQuery = supabase
    .from("performance_logs")
    .select(PERFORMANCE_SELECT)
    .eq("id", logId)
    .limit(1);

  if (brandId && !propagateAllBrands) {
    existingQuery = existingQuery.eq("brand_id", brandId);
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Performance log not found." }, { status: 404 });
  }

  let targetRows: Array<Record<string, unknown>> = [existing as Record<string, unknown>];
  if (propagateAllBrands) {
    try {
      targetRows = await resolvePropagationClusterRows(supabase, [existing as Record<string, unknown>]);
    } catch (resolveError) {
      const message = resolveError instanceof Error ? resolveError.message : "Failed resolving propagation targets.";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  const targetIds = Array.from(new Set(targetRows.map((row) => String(row.id))));
  const { error: deleteError } = await supabase.from("performance_logs").delete().in("id", targetIds);
  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  let auditLogged = 0;
  let auditError: string | null = null;
  for (const row of targetRows) {
    const { error: editLogError } = await supabase.from("performance_log_edits").insert({
      brand_id: String(row.brand_id),
      log_id: String(row.id),
      previous_outcome: typeof row.outcome === "string" ? row.outcome : null,
      next_outcome: null,
      reason,
      edited_by: editedBy,
    });
    if (editLogError) {
      auditError = editLogError.message;
    } else {
      auditLogged += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: targetIds.length,
    propagatedAllBrands: propagateAllBrands,
    flags,
    runtime: getWebhookRuntimeMeta(),
    auditLogged,
    auditError,
  });
}
