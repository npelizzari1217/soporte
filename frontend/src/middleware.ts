/**
 * Next.js Middleware — route protection gate (Edge Runtime).
 *
 * Reads the `at` (access token) and `rt` (refresh token) cookies and enforces:
 *   - Unauthenticated users → redirect to /login
 *   - Authenticated users on /login → redirect to / (dashboard)
 *   - Everything else → next()
 *
 * JWT verification is delegated to `shared/auth/verify.ts` (jose, Edge-compatible).
 *
 * Tolerant-refresh design (R26): if `at` is expired but `rt` exists, the
 * request passes through instead of redirecting. Doing the refresh
 * server-side in the middleware would require shared in-process state
 * (a mutex) that is not visible across multi-instance Node deployments,
 * causing rotation conflicts. Instead, `apiFetch`'s client-side single-flight
 * (PR11) transparently refreshes on the first 401 response.
 *
 * Spec: [R26] Middleware Edge (jose).
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/shared/auth/verify";
import { COOKIE_AT, COOKIE_RT, cookieName } from "@/shared/auth/cookies";

/**
 * Prefijos de rutas públicas, sin sesión (match por prefijo, no exacto).
 *
 * ADR-C7 (sdd/csat/design): el route group `(publico)` de Next es
 * TRANSPARENTE a la URL — no alcanza por sí solo para dejar pasar una ruta.
 * Sin esta allowlist, `/encuesta/:token` cae en el mismo 307 a `/login` que
 * cualquier ruta protegida y la encuesta de satisfacción no se puede
 * responder nunca (el destinatario del mail NUNCA tiene sesión). Angosto a
 * propósito: una allowlist ancha (p. ej. `/`) dejaría pasar rutas protegidas
 * reales como `/tickets`.
 */
const RUTAS_PUBLICAS = ["/encuesta/", "/restablecer-password"];

/** Una entrada que termina en `/` es un prefijo; si no, la ruta es exacta. */
function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((ruta) =>
    ruta.endsWith("/") ? pathname.startsWith(ruta) : pathname === ruta,
  );
}

export default async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (esRutaPublica(pathname)) {
    return NextResponse.next();
  }

  const at = request.cookies.get(cookieName(COOKIE_AT))?.value;
  const rt = request.cookies.get(cookieName(COOKIE_RT))?.value;

  // ── /login: redirect away if a session is alive ──────────────────────────
  if (pathname === "/login") {
    if (at) {
      const result = await verifyAccessToken(at);
      if (result !== "invalid") {
        if (result === "expired" && !rt) {
          // Expired at, no rt: session truly dead → show login
          return NextResponse.next();
        }
        // Valid at, OR expired at + rt present: session alive → dashboard
        return NextResponse.redirect(new URL("/", request.url), { status: 307 });
      }
      // Invalid at: check if rt can save the session
      if (rt) {
        return NextResponse.redirect(new URL("/", request.url), { status: 307 });
      }
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
    if (rt) {
      // Tolerant: rt exists → let through, client refreshes on first 401.
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", request.url), { status: 307 });
  }

  const result = await verifyAccessToken(at);

  if (result === "expired") {
    if (rt) {
      // R26 tolerant: expired at + refresh token → let through.
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", request.url), { status: 307 });
  }

  if (result === "invalid") {
    // Forged/tampered token: redirect and clear the bad cookie immediately.
    const res = NextResponse.redirect(new URL("/login", request.url), { status: 307 });
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

  // Valid, non-expired JWT → pass through.
  return NextResponse.next();
}

/**
 * Matcher — which paths this middleware intercepts.
 *
 * Excludes:
 *   - _next/static, _next/image — Next.js internal assets
 *   - favicon.ico               — static asset
 *   - api                       — route handlers manage their own auth
 *   - .*\.\w+$                  — any file with an extension (images, fonts, …)
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.\\w+$).*)"],
};
