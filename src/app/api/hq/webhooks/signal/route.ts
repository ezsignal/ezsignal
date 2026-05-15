import { NextResponse } from "next/server";
import {
  dispatchQueuedJobs,
  findIngressByEventKey,
  getHqSupabaseServiceClient,
  getWebhookFlags,
  getWebhookRuntimeMeta,
  planDispatchJobs,
  registerIngressEvent,
  resolveEventKey,
  resolveTargetBrands,
  sanitizeInboundPayload,
  verifyWebhookSignature,
} from "@/lib/hqWebhookRuntime";
import { fanoutSignalToBrandsDb } from "@/lib/hqSignalDbFanout";

function readBooleanEnv(key: string, fallback: boolean) {
  const value = process.env[key];
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function POST(request: Request) {
  const flags = getWebhookFlags();
  if (!flags.enabled) {
    return NextResponse.json(
      {
        ok: false,
        error: "HQ webhook ingress is disabled.",
        flags,
      },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  let payload: unknown = {};

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const provider = request.headers.get("x-webhook-provider") ?? "unknown";
  const eventKey = resolveEventKey(payload, rawBody, request.headers.get("x-event-id"));
  const existing = await findIngressByEventKey(eventKey);
  if (existing) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      event: {
        id: existing.id,
        eventKey: existing.eventKey,
        status: existing.status,
        receivedAt: existing.receivedAt,
      },
      flags,
      runtime: getWebhookRuntimeMeta(),
    });
  }

  const signature = verifyWebhookSignature(rawBody, request.headers.get("x-hq-signature"), payload);
  if (signature.reason === "invalid_signature" || signature.reason === "missing_signature") {
    return NextResponse.json(
      { ok: false, error: "Webhook signature validation failed.", signature },
      { status: 401 },
    );
  }

  const safePayload = sanitizeInboundPayload(payload);

  const ingress = await registerIngressEvent({
    provider,
    eventKey,
    payload: safePayload,
    signatureValid: signature.valid,
  });
  const targetBrands = resolveTargetBrands(safePayload);

  const dbFanoutEnabled = readBooleanEnv("HQ_WEBHOOK_DB_FANOUT_ENABLED", true);
  const allowHttpFanoutWithDb = readBooleanEnv("HQ_WEBHOOK_ALLOW_HTTP_FANOUT_WITH_DB", false);
  let dbFanoutResult: Awaited<ReturnType<typeof fanoutSignalToBrandsDb>> | null = null;

  if (!flags.shadowMode && dbFanoutEnabled) {
    const supabase = getHqSupabaseServiceClient();
    if (!supabase) {
      return NextResponse.json(
        {
          ok: false,
          error: "HQ Supabase service client is not configured for DB fanout mode.",
          flags,
          runtime: getWebhookRuntimeMeta(),
        },
        { status: 503 },
      );
    }

    dbFanoutResult = await fanoutSignalToBrandsDb({
      supabase,
      payload: safePayload,
      targetBrands,
      ingressId: ingress.id,
    });

    if (!dbFanoutResult.ok && dbFanoutResult.status && dbFanoutResult.status >= 400 && dbFanoutResult.status !== 207) {
      return NextResponse.json(
        {
          ok: false,
          duplicate: false,
          error: dbFanoutResult.error ?? "HQ DB fanout failed.",
          dbFanout: dbFanoutResult,
          event: {
            id: ingress.id,
            eventKey: ingress.eventKey,
            status: "failed",
            receivedAt: ingress.receivedAt,
          },
          flags,
          runtime: getWebhookRuntimeMeta(),
        },
        { status: dbFanoutResult.status },
      );
    }
  }

  let plannedJobs = 0;
  let eagerDispatchResult: Awaited<ReturnType<typeof dispatchQueuedJobs>> | null = null;
  const shouldRunHttpFanout = !flags.shadowMode && flags.fanoutEnabled && (!dbFanoutEnabled || allowHttpFanoutWithDb);
  if (shouldRunHttpFanout) {
    plannedJobs = (
      await planDispatchJobs({
        ingressId: ingress.id,
        payload: safePayload,
        targetBrands,
      })
    ).length;

    const eagerDispatchEnabled = readBooleanEnv("HQ_WEBHOOK_EAGER_DISPATCH_ENABLED", true);
    if (eagerDispatchEnabled && plannedJobs > 0) {
      eagerDispatchResult = await dispatchQueuedJobs(Math.max(20, plannedJobs));
    }
  }

  return NextResponse.json({
    ok: dbFanoutResult ? dbFanoutResult.ok : true,
    duplicate: false,
    mode: flags.shadowMode
      ? "shadow"
      : dbFanoutEnabled && !allowHttpFanoutWithDb
        ? "db_fanout"
        : flags.fanoutEnabled
          ? "fanout"
          : "store_only",
    event: {
      id: ingress.id,
      eventKey: ingress.eventKey,
      status: dbFanoutResult
        ? dbFanoutResult.ok
          ? "processed"
          : "failed"
        : ingress.status,
      receivedAt: ingress.receivedAt,
    },
    targetBrands,
    dbFanout: dbFanoutResult,
    plannedJobs,
    eagerDispatch: eagerDispatchResult,
    signature,
    flags,
    runtime: getWebhookRuntimeMeta(),
  });
}
