import { NextRequest, NextResponse } from "next/server";
import { clearCookieAttrs, cookieName, COOKIE_AT, COOKIE_RT } from "@/shared/auth/cookies";

/**
 * POST /api/auth/logout-all
 *
 * BFF logout-all handler:
 * 1. Calls the NestJS backend with `Authorization: Bearer <at>` to revoke
 *    ALL refresh tokens for the user (`LogoutAllUseCase`, requires
 *    `JwtAuthGuard`).
 * 2. Clears `at` + `rt` cookies on the current device regardless of the
 *    backend response.
 *
 * Spec: [R25] BFF logout-all route (todas las sesiones).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const at = request.cookies.get(cookieName(COOKIE_AT))?.value ?? "";

  await fetch(`${process.env.BACKEND_URL}/auth/logout-all`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${at}`,
    },
  }).catch(() => {
    // Always clear cookies even if the backend is unreachable.
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...clearCookieAttrs(COOKIE_AT) });
  response.cookies.set({ ...clearCookieAttrs(COOKIE_RT) });

  return response;
}
