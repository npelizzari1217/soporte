import { NextRequest, NextResponse } from "next/server";
import { clearCookieAttrs, cookieName, COOKIE_AT, COOKIE_RT } from "@/shared/auth/cookies";

/**
 * POST /api/auth/logout
 *
 * BFF logout handler:
 * 1. Reads at + rt from httpOnly cookies
 * 2. Calls NestJS backend with Bearer <at> and { refreshToken } to revoke the token
 * 3. Always clears both cookies regardless of backend response
 *    — logout must succeed even if accessToken is expired (the backend still revokes rt)
 *
 * Spec: [SPEC:frontend-auth/logout]
 * Design: §2.2 — logout flow
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const at = request.cookies.get(cookieName(COOKIE_AT))?.value ?? "";
  const rt = request.cookies.get(cookieName(COOKIE_RT))?.value ?? "";

  // Call backend to revoke the refresh token.
  // Ignore backend errors — we always clear cookies to prevent stuck sessions.
  await fetch(`${process.env.BACKEND_URL}/api/auth/logout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(at ? { authorization: `Bearer ${at}` } : {}),
    },
    body: JSON.stringify({ refreshToken: rt }),
  }).catch(() => {
    // Backend unreachable or returned error — still clear cookies.
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...clearCookieAttrs(COOKIE_AT) });
  response.cookies.set({ ...clearCookieAttrs(COOKIE_RT) });

  return response;
}
