import { NextRequest, NextResponse } from "next/server";
import { clearCookieAttrs, cookieName, COOKIE_AT, COOKIE_RT } from "@/shared/auth/cookies";

/**
 * POST /api/auth/logout
 *
 * BFF logout handler:
 * 1. Reads `at` + `rt` from httpOnly cookies.
 * 2. Calls the NestJS backend with `Authorization: Bearer <at>` and
 *    `{ refreshToken }` to revoke that refresh token.
 * 3. ALWAYS clears both cookies regardless of the backend response — logout
 *    must succeed even if `at` is expired or the backend is unreachable, so
 *    the client never gets stuck in a half-logged-out state.
 *
 * Spec: [R25] BFF logout route (sesión actual).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const at = request.cookies.get(cookieName(COOKIE_AT))?.value ?? "";
  const rt = request.cookies.get(cookieName(COOKIE_RT))?.value ?? "";

  await fetch(`${process.env.BACKEND_URL}/auth/logout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(at ? { authorization: `Bearer ${at}` } : {}),
    },
    body: JSON.stringify({ refreshToken: rt }),
  }).catch(() => {
    // Backend unreachable or returned an error — still clear cookies.
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...clearCookieAttrs(COOKIE_AT) });
  response.cookies.set({ ...clearCookieAttrs(COOKIE_RT) });

  return response;
}
