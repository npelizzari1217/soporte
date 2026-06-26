/**
 * Next.js Middleware — route protection gate (Edge Runtime)
 *
 * Reads the `at` (access token) and `rt` (refresh token) cookies and enforces:
 *   - Unauthenticated users → redirect to /login
 *   - Authenticated users on /login → redirect to / (dashboard)
 *   - Everything else → next()
 *
 * JWT verification is delegated to shared/auth/verify.ts (jose, Edge-compatible).
 *
 * SPEC DELTA — ADR-4:
 *   Spec scenario `frontend-route-protection/refresh-silencioso` requires
 *   server-side refresh in this middleware when the access token is expired.
 *   REJECTED: doing so would break with multi-instance Node deployments because
 *   any shared in-process state (e.g. a mutex) is not visible across instances,
 *   and parallel refresh calls would cause rotation conflicts.
 *   Instead, middleware is TOLERANT: if `at` is expired but `rt` exists, request
 *   passes through. The client single-flight (shared/api/client.ts) transparently
 *   handles the refresh on the first 401 response.
 *
 * Spec: [SPEC:frontend-route-protection/sin-sesion]
 *       [SPEC:frontend-route-protection/jose-verificacion]
 *       [SPEC:frontend-route-protection/rutas-excluidas]  (ADR-4 on refresh-silencioso)
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/shared/auth/verify";
import { COOKIE_AT, COOKIE_RT } from "@/shared/auth/cookies";

/**
 * Resolve the effective cookie name for the current environment.
 * In production the `__Host-` prefix is required (Secure + Path=/ + no Domain).
 * In development/test cookies use bare names (`at`, `rt`).
 */
function cookieName(name: string): string {
  return process.env.NODE_ENV === "production" ? `__Host-${name}` : name;
}

export default async function middleware(
  request: NextRequest
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const at = request.cookies.get(cookieName(COOKIE_AT))?.value;
  const rt = request.cookies.get(cookieName(COOKIE_RT))?.value;

  // ── /login: redirect away if a session is alive ──────────────────────────
  //
  // "Session alive" = valid/expired at with rt present, OR rt alone (client
  // will refresh on first API call per ADR-4), OR at still valid.
  if (pathname === "/login") {
    if (at) {
      const result = await verifyAccessToken(at);
      if (result !== "invalid") {
        // valid or expired — if expired we still need rt to call it a live session
        if (result === "expired" && !rt) {
          // Expired with no refresh token: session truly dead → let user log in
          return NextResponse.next();
        }
        // Valid at, OR expired at + rt present: session is alive → dashboard
        return NextResponse.redirect(new URL("/", request.url), { status: 307 });
      }
      // Invalid at: check if rt can save the session
      if (rt) {
        return NextResponse.redirect(new URL("/", request.url), { status: 307 });
      }
      // Invalid at, no rt: no session → show login page
      return NextResponse.next();
    }

    // No at: session alive only if rt present (client will refresh on first 401)
    if (rt) {
      return NextResponse.redirect(new URL("/", request.url), { status: 307 });
    }
    return NextResponse.next();
  }

  // ── Protected routes ─────────────────────────────────────────────────────

  if (!at) {
    // No access token at all
    if (rt) {
      // ADR-4 tolerant: refresh token exists → the client will exchange it
      // on the first 401. Let the request through.
      return NextResponse.next();
    }
    // No session whatsoever → login
    return NextResponse.redirect(new URL("/login", request.url), { status: 307 });
  }

  // Access token present: verify it
  const result = await verifyAccessToken(at);

  if (result === "expired") {
    if (rt) {
      // ADR-4 tolerant: expired at + refresh token → let through; client refreshes
      return NextResponse.next();
    }
    // Expired at, no refresh token: full logout
    return NextResponse.redirect(new URL("/login", request.url), { status: 307 });
  }

  if (result === "invalid") {
    // Forged / tampered token: redirect and clear the bad cookie immediately
    const res = NextResponse.redirect(new URL("/login", request.url), {
      status: 307,
    });
    // Clear the invalid cookie so it is not sent on subsequent requests
    res.cookies.set({
      name: cookieName(COOKIE_AT),
      value: "",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  }

  // Valid, non-expired JWT → pass through
  return NextResponse.next();
}

/**
 * Matcher — which paths this middleware intercepts.
 *
 * Excludes:
 *   - _next/static, _next/image  — Next.js internal assets
 *   - favicon.ico                — static asset
 *   - api                        — route handlers manage their own auth
 *   - .*\.\w+$                   — any file with an extension (images, fonts, …)
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.\\w+$).*)",
  ],
};
