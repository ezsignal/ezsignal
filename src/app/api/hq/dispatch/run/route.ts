import { NextResponse } from "next/server";
import { dispatchQueuedJobs, getWebhookFlags, getWebhookRuntimeMeta } from "@/lib/hqWebhookRuntime";

function resolveRunTokenCandidates() {
  return [process.env.HQ_DISPATCH_RUN_TOKEN?.trim(), process.env.CRON_SECRET?.trim()].filter(
    (value): value is string => Boolean(value && value.length > 0),
  );
}

function isAuthorizedDispatchRequest(request: Request) {
  const tokens = resolveRunTokenCandidates();
  if (tokens.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  return tokens.some((token) => authHeader === `Bearer ${token}` || authHeader === token);
}

function resolveLimitFromQuery(request: Request, fallback: number) {
  const { searchParams } = new URL(request.url);
  const value = Number(searchParams.get("limit") ?? "");
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

async function runDispatch(request: Request, bodyLimit?: number) {
  const flags = getWebhookFlags();
  if (!flags.enabled) {
    return NextResponse.json({ ok: false, error: "HQ webhook is disabled.", flags }, { status: 503 });
  }
  if (flags.shadowMode || !flags.fanoutEnabled) {
    return NextResponse.json(
      {
        ok: false,
        error: "Fan-out dispatch is disabled by flags.",
        flags,
      },
      { status: 409 },
    );
  }

  const limit = bodyLimit ? Math.max(1, Math.min(100, Math.floor(bodyLimit))) : resolveLimitFromQuery(request, 20);
  const result = await dispatchQueuedJobs(limit);

  return NextResponse.json({
    ok: true,
    flags,
    runtime: getWebhookRuntimeMeta(),
    limit,
    result,
  });
}

export async function GET(request: Request) {
  if (!isAuthorizedDispatchRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized dispatch run request." }, { status: 401 });
  }
  return runDispatch(request);
}

export async function POST(request: Request) {
  if (!isAuthorizedDispatchRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized dispatch run request." }, { status: 401 });
  }

  let bodyLimit: number | undefined;
  try {
    const body = (await request.json().catch(() => null)) as { limit?: number } | null;
    if (body?.limit && Number.isFinite(body.limit)) {
      bodyLimit = body.limit;
    }
  } catch {
    // keep defaults
  }

  return runDispatch(request, bodyLimit);
}
