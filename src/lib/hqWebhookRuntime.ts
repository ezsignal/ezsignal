import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { brands, type BrandId } from "@/lib/registry";

type IngressStatus = "received" | "queued" | "processed" | "failed" | "duplicate";
type DispatchStatus = "queued" | "sending" | "sent" | "failed" | "skipped" | "dead_letter";

type IngressEvent = {
  id: string;
  provider: string;
  eventKey: string;
  signatureValid: boolean;
  status: IngressStatus;
  payload: unknown;
  errorMessage: string | null;
  receivedAt: string;
  processedAt: string | null;
};

type DispatchJob = {
  id: string;
  ingressId: string;
  brandId: BrandId;
  status: DispatchStatus;
  attempts: number;
  lastError: string | null;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
};

type SignatureCheck = {
  valid: boolean;
  reason: "ok" | "ok_payload_secret" | "secret_not_configured" | "missing_signature" | "invalid_signature";
};

type RuntimeBackend = "database" | "memory";
type RoutingMode = "direct" | "transform";

type BrandPublishRule = {
  brandId: BrandId;
  webhookEnabled: boolean;
  fanoutEnabled: boolean;
  routingMode: RoutingMode;
  settings: Record<string, unknown>;
};

type DispatchTarget = {
  endpoint: string;
  secret: string | null;
  secretHeader: string;
  includeSecretInBody: boolean;
  timeoutMs: number;
  maxAttempts: number;
  retryBaseSeconds: number;
  extraHeaders: Record<string, string>;
};

type DispatchResult = {
  ok: boolean;
  status: number | null;
  body: string | null;
  error: string | null;
};

const MAX_INGRESS_EVENTS = 500;
const MAX_DISPATCH_JOBS = 2000;
const DEFAULT_DISPATCH_TIMEOUT_MS = 12000;
const DEFAULT_RETRY_BASE_SECONDS = 30;
const DEFAULT_MAX_ATTEMPTS = 5;

const ingressEvents: IngressEvent[] = [];
const dispatchJobs: DispatchJob[] = [];
let cachedSupabase: SupabaseClient | null | undefined;

function readBooleanEnv(key: string, fallback: boolean) {
  const value = process.env[key];
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function readNumberEnv(key: string, fallback: number) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  return crypto.randomUUID();
}

function trimToLimit<T>(list: T[], max: number) {
  if (list.length <= max) return;
  list.splice(0, list.length - max);
}

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizeSignature(value: string | null) {
  if (!value) return null;
  return value.replace(/^sha256=/i, "").trim();
}

function timingSafeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function resolveSupabaseConfig() {
  const url = process.env.HQ_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.HQ_SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  return { url, serviceRoleKey };
}

function getSupabaseClient() {
  if (cachedSupabase !== undefined) {
    return cachedSupabase;
  }
  const { url, serviceRoleKey } = resolveSupabaseConfig();
  if (!url || !serviceRoleKey) {
    cachedSupabase = null;
    return cachedSupabase;
  }
  cachedSupabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedSupabase;
}

function runtimeBackend(): RuntimeBackend {
  return getSupabaseClient() ? "database" : "memory";
}

function mapIngressFromDb(row: Record<string, unknown>): IngressEvent {
  return {
    id: String(row.id),
    provider: String(row.provider ?? "unknown"),
    eventKey: String(row.event_key ?? ""),
    signatureValid: Boolean(row.signature_valid),
    status: String(row.status ?? "received") as IngressStatus,
    payload: row.payload ?? {},
    errorMessage: row.error_message ? String(row.error_message) : null,
    receivedAt: String(row.received_at ?? nowIso()),
    processedAt: row.processed_at ? String(row.processed_at) : null,
  };
}

function mapDispatchJobFromDb(row: Record<string, unknown>): DispatchJob {
  return {
    id: String(row.id),
    ingressId: String(row.ingress_id),
    brandId: String(row.brand_id) as BrandId,
    status: String(row.status ?? "queued") as DispatchStatus,
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error ? String(row.last_error) : null,
    payload: row.signal_payload ?? {},
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readBoolean(record: Record<string, unknown>, keys: string[], fallback: boolean) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
      if (normalized === "false" || normalized === "0" || normalized === "no") return false;
    }
  }
  return fallback;
}

function readNumber(record: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readStringMap(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [headerName, headerValue] of Object.entries(candidate)) {
      if (typeof headerValue === "string" && headerValue.trim().length > 0) {
        result[headerName] = headerValue.trim();
      }
    }
    if (Object.keys(result).length > 0) {
      return result;
    }
  }
  return {};
}

function brandEnvPrefix(brandId: BrandId) {
  return `HQ_BRAND_${brandId.toUpperCase()}_WEBHOOK`;
}

function getFallbackEndpoint(brandId: BrandId) {
  const brand = brands.find((row) => row.id === brandId);
  if (!brand) return null;
  const defaultPath = process.env.HQ_BRAND_DEFAULT_WEBHOOK_PATH?.trim() || "/api/webhook/tradingview";
  return `https://${brand.domain}${defaultPath.startsWith("/") ? defaultPath : `/${defaultPath}`}`;
}

function normalizeEndpoint(url: string | null, brandId: BrandId) {
  if (url && url.length > 0) return url;
  return getFallbackEndpoint(brandId);
}

function parseHeaderJson(raw: string | undefined) {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const asRecord = parsed as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(asRecord)) {
      if (typeof value === "string" && value.trim().length > 0) {
        result[key] = value.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

function calculateNextRetryAt(attempts: number, retryBaseSeconds: number) {
  const exponent = Math.max(0, Math.min(6, attempts - 1));
  const delaySeconds = retryBaseSeconds * (2 ** exponent);
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

function sanitizeDispatchPayloadForLog(payload: unknown) {
  return sanitizeInboundPayload(payload);
}

async function loadBrandPublishRule(brandId: BrandId): Promise<BrandPublishRule | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("brand_publish_rules")
    .select("brand_id,webhook_enabled,fanout_enabled,routing_mode,settings")
    .eq("brand_id", brandId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const settings = asObject(row.settings);
  const modeRaw = String(row.routing_mode ?? "direct");
  const routingMode: RoutingMode = modeRaw === "transform" ? "transform" : "direct";

  return {
    brandId,
    webhookEnabled: Boolean(row.webhook_enabled ?? true),
    fanoutEnabled: Boolean(row.fanout_enabled ?? false),
    routingMode,
    settings,
  };
}

function targetFromEnv(brandId: BrandId): DispatchTarget {
  const prefix = brandEnvPrefix(brandId);
  const endpoint = normalizeEndpoint(process.env[`${prefix}_URL`]?.trim() || null, brandId) ?? "";
  const secret = process.env[`${prefix}_SECRET`]?.trim() || null;
  const secretHeader = process.env[`${prefix}_SECRET_HEADER`]?.trim() || "x-webhook-secret";
  const includeSecretInBody = readBooleanEnv(`${prefix}_SECRET_IN_BODY`, true);
  const timeoutMs = Math.max(3000, readNumberEnv(`${prefix}_TIMEOUT_MS`, readNumberEnv("HQ_BRAND_REQUEST_TIMEOUT_MS", DEFAULT_DISPATCH_TIMEOUT_MS)));
  const maxAttempts = Math.max(1, readNumberEnv(`${prefix}_MAX_ATTEMPTS`, readNumberEnv("HQ_BRAND_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS)));
  const retryBaseSeconds = Math.max(5, readNumberEnv(`${prefix}_RETRY_BASE_SECONDS`, readNumberEnv("HQ_BRAND_RETRY_BASE_SECONDS", DEFAULT_RETRY_BASE_SECONDS)));
  const extraHeaders = {
    ...parseHeaderJson(process.env.HQ_BRAND_DEFAULT_WEBHOOK_HEADERS),
    ...parseHeaderJson(process.env[`${prefix}_HEADERS`]),
  };

  return {
    endpoint,
    secret,
    secretHeader,
    includeSecretInBody,
    timeoutMs,
    maxAttempts,
    retryBaseSeconds,
    extraHeaders,
  };
}

async function resolveDispatchTarget(brandId: BrandId): Promise<{ target: DispatchTarget | null; skipReason: string | null }> {
  const envTarget = targetFromEnv(brandId);
  const rule = await loadBrandPublishRule(brandId);

  if (!rule) {
    if (!envTarget.endpoint || !envTarget.secret) {
      return { target: null, skipReason: "Missing webhook URL or secret configuration." };
    }
    return { target: envTarget, skipReason: null };
  }

  if (!rule.webhookEnabled) {
    return { target: null, skipReason: "Brand webhook disabled in publish rules." };
  }

  if (!rule.fanoutEnabled) {
    return { target: null, skipReason: "Brand fanout disabled in publish rules." };
  }

  const settings = rule.settings;
  const endpoint = normalizeEndpoint(
    readString(settings, ["endpoint_url", "webhook_url", "target_url", "url"]) ?? envTarget.endpoint,
    brandId,
  ) ?? "";
  const secret = readString(settings, ["webhook_secret", "secret"]) ?? envTarget.secret;
  const secretHeader = readString(settings, ["secret_header", "secretHeader"]) ?? envTarget.secretHeader;
  const includeSecretInBody = readBoolean(settings, ["include_secret_in_body", "includeSecretInBody"], envTarget.includeSecretInBody);
  const timeoutMs = Math.max(3000, readNumber(settings, ["timeout_ms", "timeoutMs"], envTarget.timeoutMs));
  const maxAttempts = Math.max(1, readNumber(settings, ["max_attempts", "maxAttempts"], envTarget.maxAttempts));
  const retryBaseSeconds = Math.max(5, readNumber(settings, ["retry_base_seconds", "retryBaseSeconds"], envTarget.retryBaseSeconds));
  const extraHeaders = {
    ...envTarget.extraHeaders,
    ...readStringMap(settings, ["headers", "extra_headers", "extraHeaders"]),
  };

  if (!endpoint || !secret) {
    return { target: null, skipReason: "Missing endpoint or secret in brand publish rule." };
  }

  return {
    target: {
      endpoint,
      secret,
      secretHeader,
      includeSecretInBody,
      timeoutMs,
      maxAttempts,
      retryBaseSeconds,
      extraHeaders,
    },
    skipReason: null,
  };
}

function buildDispatchPayload(payload: unknown, brandId: BrandId, target: DispatchTarget) {
  const source = asObject(payload);
  const nextPayload: Record<string, unknown> = { ...source, brand_id: brandId };
  delete nextPayload.brands;

  if (!nextPayload.event) {
    nextPayload.event = "signal";
  }
  if (!nextPayload.pair && typeof source.symbol === "string") {
    nextPayload.pair = source.symbol;
  }

  if (target.includeSecretInBody && target.secret) {
    nextPayload.secret = target.secret;
  }
  return nextPayload;
}

async function sendDispatchToTarget(payload: unknown, target: DispatchTarget): Promise<DispatchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), target.timeoutMs);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...target.extraHeaders,
  };

  if (!target.includeSecretInBody && target.secret) {
    headers[target.secretHeader] = target.secret;
  }

  try {
    const response = await fetch(target.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      body: body.length ? body.slice(0, 4000) : null,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: null,
      error: error instanceof Error ? error.message : "Dispatch request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function recordDeliveryAttempt(
  supabase: SupabaseClient | null,
  jobId: string,
  attemptNo: number,
  requestPayload: unknown,
  dispatchResult: DispatchResult,
) {
  if (!supabase) return;
  await supabase.from("webhook_delivery_attempts").upsert(
    {
      job_id: jobId,
      attempt_no: attemptNo,
      request_payload: sanitizeDispatchPayloadForLog(requestPayload),
      response_status: dispatchResult.status,
      response_body: dispatchResult.body,
      error_message: dispatchResult.error,
    },
    { onConflict: "job_id,attempt_no" },
  );
}

function refreshIngressStatusMemory(ingressId: string) {
  const ingress = ingressEvents.find((row) => row.id === ingressId);
  if (!ingress) return;
  const jobs = dispatchJobs.filter((job) => job.ingressId === ingressId);
  if (!jobs.length) return;

  const allSent = jobs.every((job) => job.status === "sent" || job.status === "skipped");
  const anyFailed = jobs.some((job) => job.status === "failed" || job.status === "dead_letter");
  const anyQueued = jobs.some((job) => job.status === "queued" || job.status === "sending");

  if (allSent) {
    ingress.status = "processed";
    ingress.processedAt = nowIso();
    ingress.errorMessage = null;
    return;
  }
  if (anyFailed && !anyQueued) {
    ingress.status = "failed";
    ingress.processedAt = nowIso();
    ingress.errorMessage = "One or more brand dispatch jobs failed.";
    return;
  }
  ingress.status = "queued";
}

async function refreshIngressStatusDatabase(ingressId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { data, error } = await supabase
    .from("signal_dispatch_jobs")
    .select("status")
    .eq("ingress_id", ingressId);
  if (error || !data || data.length === 0) return;

  const statuses = data.map((row) => String((row as Record<string, unknown>).status));
  const allSent = statuses.every((status) => status === "sent" || status === "skipped");
  const anyFailed = statuses.some((status) => status === "failed" || status === "dead_letter");
  const anyQueued = statuses.some((status) => status === "queued" || status === "sending");

  if (allSent) {
    await supabase
      .from("webhook_event_ingress")
      .update({
        status: "processed",
        processed_at: nowIso(),
        error_message: null,
      })
      .eq("id", ingressId);
    return;
  }
  if (anyFailed && !anyQueued) {
    await supabase
      .from("webhook_event_ingress")
      .update({
        status: "failed",
        processed_at: nowIso(),
        error_message: "One or more brand dispatch jobs failed.",
      })
      .eq("id", ingressId);
    return;
  }
  await supabase
    .from("webhook_event_ingress")
    .update({
      status: "queued",
      processed_at: null,
      error_message: null,
    })
    .eq("id", ingressId);
}

export function getWebhookFlags() {
  return {
    enabled: readBooleanEnv("HQ_WEBHOOK_ENABLED", false),
    shadowMode: readBooleanEnv("HQ_WEBHOOK_SHADOW_MODE", true),
    fanoutEnabled: readBooleanEnv("HQ_WEBHOOK_FANOUT_ENABLED", false),
    performanceEditorEnabled: readBooleanEnv("HQ_PERFORMANCE_EDITOR_ENABLED", false),
  };
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, payload?: unknown): SignatureCheck {
  const secret = process.env.HQ_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return { valid: false, reason: "secret_not_configured" };
  }

  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const payloadSecretRaw = row.webhook_secret ?? row.secret ?? row.webhookSecret;
    if (typeof payloadSecretRaw === "string" && payloadSecretRaw.length > 0) {
      const valid = timingSafeEqualString(payloadSecretRaw, secret);
      if (valid) {
        return { valid: true, reason: "ok_payload_secret" };
      }
    }
  }

  const signature = normalizeSignature(signatureHeader);
  if (!signature) {
    return { valid: false, reason: "missing_signature" };
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const valid = safeEqualHex(signature, expected);
  return { valid, reason: valid ? "ok" : "invalid_signature" };
}

export function sanitizeInboundPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const row = payload as Record<string, unknown>;
  const clone: Record<string, unknown> = { ...row };
  delete clone.webhook_secret;
  delete clone.secret;
  delete clone.webhookSecret;
  return clone;
}

export function resolveEventKey(payload: unknown, rawBody: string, headerEventKey: string | null) {
  if (headerEventKey && headerEventKey.trim().length > 0) {
    return headerEventKey.trim();
  }
  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const candidate = row.event_id ?? row.eventKey ?? row.id ?? row.signal_id;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (typeof candidate === "number") {
      return String(candidate);
    }
  }
  const digest = crypto.createHash("sha256").update(rawBody).digest("hex");
  return `hash-${digest}`;
}

export async function findIngressByEventKey(eventKey: string) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("webhook_event_ingress")
      .select("*")
      .eq("event_key", eventKey)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return mapIngressFromDb(data as Record<string, unknown>);
    }
  }
  return ingressEvents.find((row) => row.eventKey === eventKey) ?? null;
}

export async function registerIngressEvent(input: {
  provider: string;
  eventKey: string;
  payload: unknown;
  signatureValid: boolean;
}) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("webhook_event_ingress")
      .insert({
        provider: input.provider,
        event_key: input.eventKey,
        signature_valid: input.signatureValid,
        payload: input.payload,
        status: "received",
      })
      .select("*")
      .single();
    if (!error && data) {
      return mapIngressFromDb(data as Record<string, unknown>);
    }
  }

  const row: IngressEvent = {
    id: randomId(),
    provider: input.provider,
    eventKey: input.eventKey,
    signatureValid: input.signatureValid,
    status: "received",
    payload: input.payload,
    errorMessage: null,
    receivedAt: nowIso(),
    processedAt: null,
  };
  ingressEvents.push(row);
  trimToLimit(ingressEvents, MAX_INGRESS_EVENTS);
  return row;
}

export async function planDispatchJobs(input: {
  ingressId: string;
  payload: unknown;
  targetBrands: BrandId[];
}) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const insertRows = input.targetBrands.map((brandId) => ({
      ingress_id: input.ingressId,
      brand_id: brandId,
      status: "queued",
      attempts: 0,
      signal_payload: input.payload,
    }));

    const { data, error } = await supabase
      .from("signal_dispatch_jobs")
      .upsert(insertRows, { onConflict: "ingress_id,brand_id" })
      .select("*");
    if (!error && data) {
      await refreshIngressStatusDatabase(input.ingressId);
      return (data as Array<Record<string, unknown>>).map(mapDispatchJobFromDb);
    }
  }

  const now = nowIso();
  const jobs: DispatchJob[] = input.targetBrands.map((brandId) => ({
    id: randomId(),
    ingressId: input.ingressId,
    brandId,
    status: "queued",
    attempts: 0,
    lastError: null,
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    deliveredAt: null,
  }));

  dispatchJobs.push(...jobs);
  trimToLimit(dispatchJobs, MAX_DISPATCH_JOBS);
  refreshIngressStatusMemory(input.ingressId);
  return jobs;
}

export async function dispatchQueuedJobs(limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const supabase = getSupabaseClient();
  if (supabase) {
    const now = nowIso();
    const [queuedRes, retryRes] = await Promise.all([
      supabase
        .from("signal_dispatch_jobs")
        .select("*")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(safeLimit),
      supabase
        .from("signal_dispatch_jobs")
        .select("*")
        .eq("status", "failed")
        .lte("next_retry_at", now)
        .order("next_retry_at", { ascending: true })
        .limit(safeLimit),
    ]);

    if (queuedRes.error || retryRes.error) {
      return { attempted: 0, sent: 0, failed: 0, skipped: 0, deadLetter: 0, backend: "database" as RuntimeBackend };
    }

    const merged = [
      ...((queuedRes.data ?? []) as Array<Record<string, unknown>>),
      ...((retryRes.data ?? []) as Array<Record<string, unknown>>),
    ]
      .map(mapDispatchJobFromDb)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const seen = new Set<string>();
    const jobs: DispatchJob[] = [];
    for (const job of merged) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      jobs.push(job);
      if (jobs.length >= safeLimit) break;
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let deadLetter = 0;

    for (const job of jobs) {
      const { target, skipReason } = await resolveDispatchTarget(job.brandId);
      if (!target) {
        await supabase
          .from("signal_dispatch_jobs")
          .update({
            status: "skipped",
            last_error: skipReason,
            delivered_at: nowIso(),
            next_retry_at: null,
            updated_at: nowIso(),
          })
          .eq("id", job.id);
        skipped += 1;
        await refreshIngressStatusDatabase(job.ingressId);
        continue;
      }

      const attemptNo = job.attempts + 1;
      await supabase
        .from("signal_dispatch_jobs")
        .update({
          status: "sending",
          attempts: attemptNo,
          last_error: null,
          updated_at: nowIso(),
        })
        .eq("id", job.id);

      const requestPayload = buildDispatchPayload(job.payload, job.brandId, target);
      const dispatchResult = await sendDispatchToTarget(requestPayload, target);
      await recordDeliveryAttempt(supabase, job.id, attemptNo, requestPayload, dispatchResult);

      if (dispatchResult.ok) {
        await supabase
          .from("signal_dispatch_jobs")
          .update({
            status: "sent",
            delivered_at: nowIso(),
            last_error: null,
            next_retry_at: null,
            updated_at: nowIso(),
          })
          .eq("id", job.id);
        sent += 1;
      } else {
        const reachedLimit = attemptNo >= target.maxAttempts;
        await supabase
          .from("signal_dispatch_jobs")
          .update({
            status: reachedLimit ? "dead_letter" : "failed",
            last_error: dispatchResult.error,
            next_retry_at: reachedLimit ? null : calculateNextRetryAt(attemptNo, target.retryBaseSeconds),
            updated_at: nowIso(),
          })
          .eq("id", job.id);
        if (reachedLimit) {
          deadLetter += 1;
        } else {
          failed += 1;
        }
      }

      await refreshIngressStatusDatabase(job.ingressId);
    }

    return { attempted: jobs.length, sent, failed, skipped, deadLetter, backend: "database" as RuntimeBackend };
  }

  const queued = dispatchJobs.filter((job) => job.status === "queued" || job.status === "failed").slice(0, safeLimit);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deadLetter = 0;

  for (const job of queued) {
    const { target, skipReason } = await resolveDispatchTarget(job.brandId);
    if (!target) {
      job.status = "skipped";
      job.lastError = skipReason;
      job.deliveredAt = nowIso();
      job.updatedAt = nowIso();
      skipped += 1;
      refreshIngressStatusMemory(job.ingressId);
      continue;
    }

    const attemptNo = job.attempts + 1;
    job.status = "sending";
    job.updatedAt = nowIso();
    job.attempts = attemptNo;

    const requestPayload = buildDispatchPayload(job.payload, job.brandId, target);
    const dispatchResult = await sendDispatchToTarget(requestPayload, target);
    if (dispatchResult.ok) {
      job.status = "sent";
      job.deliveredAt = nowIso();
      job.lastError = null;
      sent += 1;
    } else if (attemptNo >= target.maxAttempts) {
      job.status = "dead_letter";
      job.lastError = dispatchResult.error;
      deadLetter += 1;
    } else {
      job.status = "failed";
      job.lastError = dispatchResult.error;
      failed += 1;
    }
    job.updatedAt = nowIso();
    refreshIngressStatusMemory(job.ingressId);
  }

  return { attempted: queued.length, sent, failed, skipped, deadLetter, backend: "memory" as RuntimeBackend };
}

export async function listDispatchStatus() {
  const supabase = getSupabaseClient();
  if (supabase) {
    const [ingressCountRes, jobsRes, ingressRes, recentJobsRes] = await Promise.all([
      supabase.from("webhook_event_ingress").select("id", { count: "exact", head: true }),
      supabase.from("signal_dispatch_jobs").select("status"),
      supabase
        .from("webhook_event_ingress")
        .select("id, provider, event_key, signature_valid, status, payload, error_message, received_at, processed_at")
        .order("received_at", { ascending: false })
        .limit(10),
      supabase
        .from("signal_dispatch_jobs")
        .select("id, ingress_id, brand_id, status, attempts, last_error, signal_payload, created_at, updated_at, delivered_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const ingressCount = ingressCountRes.count ?? 0;
    const allStatuses = !jobsRes.error && jobsRes.data ? (jobsRes.data as Array<Record<string, unknown>>).map((row) => String(row.status)) : [];
    const counts = {
      ingress: ingressCount,
      queued: allStatuses.filter((status) => status === "queued").length,
      sending: allStatuses.filter((status) => status === "sending").length,
      sent: allStatuses.filter((status) => status === "sent").length,
      failed: allStatuses.filter((status) => status === "failed").length,
      skipped: allStatuses.filter((status) => status === "skipped").length,
      deadLetter: allStatuses.filter((status) => status === "dead_letter").length,
    };

    const recentIngress = !ingressRes.error && ingressRes.data
      ? (ingressRes.data as Array<Record<string, unknown>>).map(mapIngressFromDb)
      : [];
    const recentJobs = !recentJobsRes.error && recentJobsRes.data
      ? (recentJobsRes.data as Array<Record<string, unknown>>).map(mapDispatchJobFromDb)
      : [];

    return {
      backend: "database" as RuntimeBackend,
      counts,
      recentIngress,
      recentJobs,
    };
  }

  const counts = {
    ingress: ingressEvents.length,
    queued: dispatchJobs.filter((job) => job.status === "queued").length,
    sending: dispatchJobs.filter((job) => job.status === "sending").length,
    sent: dispatchJobs.filter((job) => job.status === "sent").length,
    failed: dispatchJobs.filter((job) => job.status === "failed").length,
    skipped: dispatchJobs.filter((job) => job.status === "skipped").length,
    deadLetter: dispatchJobs.filter((job) => job.status === "dead_letter").length,
  };

  return {
    backend: "memory" as RuntimeBackend,
    counts,
    recentIngress: [...ingressEvents].slice(-10).reverse(),
    recentJobs: [...dispatchJobs].slice(-20).reverse(),
  };
}

export function resolveTargetBrands(payload: unknown): BrandId[] {
  const all = brands.map((brand) => brand.id);
  if (!payload || typeof payload !== "object") return all;

  const row = payload as Record<string, unknown>;
  const targets = row.brands;
  if (!Array.isArray(targets) || targets.length === 0) return all;

  const parsed = targets
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is BrandId => all.includes(item as BrandId));

  if (!parsed.length) return all;
  return Array.from(new Set(parsed));
}

export function getWebhookRuntimeMeta() {
  const { url, serviceRoleKey } = resolveSupabaseConfig();
  return {
    backend: runtimeBackend(),
    dbConfigured: Boolean(url && serviceRoleKey),
  };
}

export function getHqSupabaseServiceClient() {
  return getSupabaseClient();
}
