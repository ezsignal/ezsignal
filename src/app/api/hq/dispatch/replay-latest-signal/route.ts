import { NextResponse } from "next/server";
import {
  dispatchQueuedJobs,
  getHqSupabaseServiceClient,
  getWebhookFlags,
  getWebhookRuntimeMeta,
  planDispatchJobs,
  registerIngressEvent,
  resolveTargetBrands,
} from "@/lib/hqWebhookRuntime";
import { isHqAdminAuthorized } from "@/lib/hqAdminAuth";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (!isHqAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized replay request." }, { status: 401 });
  }

  const flags = getWebhookFlags();
  if (!flags.enabled) {
    return NextResponse.json({ ok: false, error: "HQ webhook is disabled.", flags }, { status: 503 });
  }
  if (flags.shadowMode || !flags.fanoutEnabled) {
    return NextResponse.json(
      { ok: false, error: "Fan-out dispatch is disabled by flags.", flags },
      { status: 409 },
    );
  }

  const supabase = getHqSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "HQ Supabase service client is not configured." }, { status: 500 });
  }

  const { data: ingressRows, error: ingressError } = await supabase
    .from("webhook_event_ingress")
    .select("id, event_key, payload, received_at")
    .order("received_at", { ascending: false })
    .limit(50);

  if (ingressError) {
    return NextResponse.json({ ok: false, error: ingressError.message }, { status: 500 });
  }

  const latestSignalIngress = (ingressRows ?? []).find((row) => {
    const payload = asObject(row.payload);
    return payload.event === "signal";
  });

  if (!latestSignalIngress) {
    return NextResponse.json({ ok: false, error: "No signal payload found to replay." }, { status: 404 });
  }

  const sourcePayload = asObject(latestSignalIngress.payload);
  const replayEventId = `manual-replay-signal-${Date.now()}`;
  const replayPayload = {
    ...sourcePayload,
    event: "signal",
    event_id: replayEventId,
  };

  const ingress = await registerIngressEvent({
    provider: "hq_manual_replay",
    eventKey: replayEventId,
    payload: replayPayload,
    signatureValid: true,
  });

  const targetBrands = resolveTargetBrands(replayPayload);
  const plannedJobs = await planDispatchJobs({
    ingressId: ingress.id,
    payload: replayPayload,
    targetBrands,
  });
  const dispatchResult = await dispatchQueuedJobs(Math.max(20, plannedJobs.length || 1));

  return NextResponse.json({
    ok: true,
    flags,
    runtime: getWebhookRuntimeMeta(),
    replay: {
      sourceIngressId: String(latestSignalIngress.id),
      sourceEventKey: String(latestSignalIngress.event_key),
      replayIngressId: ingress.id,
      replayEventKey: replayEventId,
      targetBrands,
      plannedJobs: plannedJobs.length,
    },
    result: dispatchResult,
  });
}
