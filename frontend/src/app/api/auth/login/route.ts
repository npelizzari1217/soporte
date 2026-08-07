import { NextRequest, NextResponse } from "next/server";
import {
  cookieAttrs,
  COOKIE_AT,
  COOKIE_RT,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
} from "@/shared/auth/cookies";
import { decodeJwtPayload } from "@/shared/api/types";

/**
 * POST /api/auth/login
 *
 * BFF login handler:
 * 1. Forwards credentials (+ optional `clienteId`) to the NestJS backend.
 * 2. If the backend returns `{ needsClienteSelection: true, membresias }`
 *    (multi-membership, R4/R5), pass that payload through AS-IS with NO
 *    cookies set — the UI (PR11) re-posts login with the chosen `clienteId`.
 * 3. On success with tokens: sets httpOnly `at`/`rt` cookies, returns `{ user }`.
 * 4. On backend error (401/403): propagates status/body, no cookies set.
 *
 * Spec: [R23] BFF login route.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();

  const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await backendRes.json().catch(() => null);

  if (!backendRes.ok) {
    return NextResponse.json(
      data ?? { statusCode: backendRes.status, message: backendRes.statusText },
      { status: backendRes.status },
    );
  }

  if (data && data.needsClienteSelection) {
    // R23: reenviar sin setear cookies — el front debe re-postear con clienteId.
    return NextResponse.json(data);
  }

  const { accessToken, refreshToken } = data as {
    accessToken: string;
    refreshToken: string;
  };

  // No signature verification needed here: the payload comes from the
  // trusted NestJS backend over a private network.
  const user = decodeJwtPayload(accessToken);

  const response = NextResponse.json({ user });
  response.cookies.set({ ...cookieAttrs(COOKIE_AT, ACCESS_MAX_AGE), value: accessToken });
  response.cookies.set({ ...cookieAttrs(COOKIE_RT, REFRESH_MAX_AGE), value: refreshToken });

  return response;
}
