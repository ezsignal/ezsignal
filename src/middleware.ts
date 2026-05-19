import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidHqAdminKey } from "@/lib/hqAdminAuth";

function isPublicPath(pathname: string) {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/hq/auth/")) return true;
  if (pathname.startsWith("/api/hq/webhooks/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const key = request.cookies.get("hq_admin_key")?.value ?? "";
  if (isValidHqAdminKey(key)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};

