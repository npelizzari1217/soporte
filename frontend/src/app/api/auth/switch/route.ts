import { NextRequest, NextResponse } from "next/server";
import { cookieAttrs, cookieName, COOKIE_AT, ACCESS_MAX_AGE } from "@/shared/auth/cookies";
import { decodeJwtPayload } from "@/shared/api/types";

/**
 * POST /api/auth/switch
 *
 * BFF tenant-switch handler:
 * 1. Reads `at` from the httpOnly cookie. If absent, short-circuits to 401
 *    without calling the backend (the endpoint requires `JwtAuthGuard`).
 * 2. Forwards `{ clienteId }` to the NestJS backend with
 *    `Authorization: Bearer <at>`.
 * 3. On success: updates ONLY the `at` cookie with the newly re-emitted
 *    token, returns `{ user }` (decoded payload) so the UI can refresh the
 *    session state immediately.
 * 4. On backend error (401/403): propagates status/body, cookie unchanged.
 *
 * ADR-4 (`sdd/auth-multitenancy/design`): the switch (token re-emission) is
 * the ONLY tenant-jump mechanism — it never rotates `rt` (only `/refresh` does).
 *
 * Spec: [R28] Switcher en el shell.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const at = request.cookies.get(cookieName(COOKIE_AT))?.value;

  if (!at) {
    return NextResponse.json(
      { statusCode: 401, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = await request.json();

  const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/switch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${at}`,
    },
    body: JSON.stringify(body),
  });

  const data = await backendRes.json().catch(() => null);

  if (!backendRes.ok) {
    return NextResponse.json(
      data ?? { statusCode: backendRes.status, message: backendRes.statusText },
      { status: backendRes.status },
    );
  }

  const { accessToken } = data as { accessToken: string };
  const user = decodeJwtPayload(accessToken);

  const response = NextResponse.json({ user });
  response.cookies.set({ ...cookieAttrs(COOKIE_AT, ACCESS_MAX_AGE), value: accessToken });

  return response;
}
