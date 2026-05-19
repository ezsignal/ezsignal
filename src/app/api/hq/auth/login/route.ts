import { NextResponse } from "next/server";
import { isValidHqAdminKey } from "@/lib/hqAdminAuth";

export async function POST(request: Request) {
  let body: { key?: string } = {};
  try {
    body = (await request.json()) as { key?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const key = (body.key ?? "").trim();
  if (!isValidHqAdminKey(key)) {
    return NextResponse.json({ ok: false, error: "Invalid admin key." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("hq_admin_key", key, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

