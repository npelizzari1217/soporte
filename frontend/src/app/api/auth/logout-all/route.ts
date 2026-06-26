import { NextRequest, NextResponse } from "next/server";
import { clearCookieAttrs, COOKIE_AT, COOKIE_RT } from "@/shared/auth/cookies";

/**
 * POST /api/auth/logout-all
 *
 * BFF logout-all handler:
 * 1. Calls NestJS backend with Bearer <at> to revoke ALL refresh tokens for the user
 * 2. Clears at + rt cookies on the current device
 *
 * Spec: [SPEC:frontend-auth/logout-all]
 * Design: §2.2 — logout-all flow
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const at = request.cookies.get(COOKIE_AT)?.value ?? "";

  await fetch(`${process.env.BACKEND_URL}/api/auth/logout-all`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${at}`,
    },
  }).catch(() => {
    // Always clear cookies even if backend is unreachable.
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...clearCookieAttrs(COOKIE_AT) });
  response.cookies.set({ ...clearCookieAttrs(COOKIE_RT) });

  return response;
}
