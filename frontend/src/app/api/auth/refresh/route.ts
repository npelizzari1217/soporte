import { NextRequest, NextResponse } from "next/server";
import {
  cookieAttrs,
  clearCookieAttrs,
  COOKIE_AT,
  COOKIE_RT,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
} from "@/shared/auth/cookies";

/**
 * POST /api/auth/refresh
 *
 * BFF token rotation handler:
 * 1. Reads `rt` httpOnly cookie from the incoming request
 * 2. Sends { refreshToken } to the NestJS backend
 * 3. On success: rotates BOTH cookies (at + rt) with fresh values
 * 4. On backend 401 (revoked/expired rt): clears BOTH cookies and returns 401
 *    — `apiFetch` receives 401 and throws SessionExpiredError → client redirects to /login
 *
 * Spec: [SPEC:frontend-auth/login-exitoso] — rotation contract
 * Design: §2.4 — refresh flow, cookie rotation
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rt = request.cookies.get(COOKIE_RT)?.value;

  const backendRes = await fetch(
    `${process.env.BACKEND_URL}/api/auth/refresh`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    },
  );

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
