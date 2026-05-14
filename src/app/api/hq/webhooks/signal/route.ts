import { NextResponse } from "next/server";
import {
  dispatchQueuedJobs,
  findIngressByEventKey,
  getWebhookFlags,
  getWebhookRuntimeMeta,
  planDispatchJobs,
  registerIngressEvent,
  resolveEventKey,
  resolveTargetBrands,
  sanitizeInboundPayload,
  verifyWebhookSignature,
} from "@/lib/hqWebhookRuntime";

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

  let plannedJobs = 0;
  let eagerDispatchResult: Awaited<ReturnType<typeof dispatchQueuedJobs>> | null = null;
  if (!flags.shadowMode && flags.fanoutEnabled) {
    const targets = resolveTargetBrands(safePayload);
    plannedJobs = (
      await planDispatchJobs({
        ingressId: ingress.id,
        payload: safePayload,
        targetBrands: targets,
      })
    ).length;

    const eagerDispatchEnabled = readBooleanEnv("HQ_WEBHOOK_EAGER_DISPATCH_ENABLED", true);
    if (eagerDispatchEnabled && plannedJobs > 0) {
      eagerDispatchResult = await dispatchQueuedJobs(Math.max(20, plannedJobs));
    }
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    mode: flags.shadowMode ? "shadow" : flags.fanoutEnabled ? "fanout" : "store_only",
    event: {
      id: ingress.id,
      eventKey: ingress.eventKey,
      status: ingress.status,
      receivedAt: ingress.receivedAt,
    },
    plannedJobs,
    eagerDispatch: eagerDispatchResult,
    signature,
    flags,
    runtime: getWebhookRuntimeMeta(),
  });
}
