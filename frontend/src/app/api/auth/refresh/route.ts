import { NextRequest, NextResponse } from "next/server";
import {
  cookieAttrs,
  clearCookieAttrs,
  cookieName,
  COOKIE_AT,
  COOKIE_RT,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
} from "@/shared/auth/cookies";

/**
 * POST /api/auth/refresh
 *
 * BFF token rotation handler:
 * 1. Reads the `rt` httpOnly cookie from the incoming request. If absent,
 *    short-circuits to 401 + clears both cookies without calling the backend
 *    (there is nothing to rotate).
 * 2. Sends `{ refreshToken }` to the NestJS backend — NO clienteId hint
 *    (Opción B / decisión #2025: `refresh_tokens.cliente_id` is persisted
 *    server-side at issuance time; the backend re-scopes by reading it
 *    directly, no external hint needed).
 * 3. On success: rotates BOTH cookies (`at` + `rt`) with fresh values.
 * 4. On backend 401 (revoked/expired rt): clears BOTH cookies and returns 401
 *    — `apiFetch` (PR11) receives 401 and throws `SessionExpiredError`.
 *
 * Spec: [R24] BFF refresh route.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rt = request.cookies.get(cookieName(COOKIE_RT))?.value;

  if (!rt) {
    const response = new NextResponse(null, { status: 401 });
    response.cookies.set({ ...clearCookieAttrs(COOKIE_AT) });
    response.cookies.set({ ...clearCookieAttrs(COOKIE_RT) });
    return response;
  }

  const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: rt }),
  });

  if (!backendRes.ok) {
    // Refresh token revoked or expired — clear both cookies so the middleware
    // detects no session and redirects to /login on the next navigation.
    const response = new NextResponse(null, { status: backendRes.status });
    response.cookies.set({ ...clearCookieAttrs(COOKIE_AT) });
    response.cookies.set({ ...clearCookieAttrs(COOKIE_RT) });
    return response;
  }

  const { accessToken, refreshToken } = await backendRes.json();

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...cookieAttrs(COOKIE_AT, ACCESS_MAX_AGE), value: accessToken });
  response.cookies.set({ ...cookieAttrs(COOKIE_RT, REFRESH_MAX_AGE), value: refreshToken });

  return response;
}
