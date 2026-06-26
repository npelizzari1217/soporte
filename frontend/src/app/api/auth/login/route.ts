import { NextRequest, NextResponse } from "next/server";
import {
  cookieAttrs,
  COOKIE_AT,
  COOKIE_RT,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
} from "@/shared/auth/cookies";
import type { JwtPayload } from "@/shared/api/types";

/**
 * POST /api/auth/login
 *
 * BFF login handler:
 * 1. Forwards credentials to NestJS backend
 * 2. On success: sets httpOnly at + rt cookies, returns { user: JwtPayload }
 * 3. On 401/403: propagates status/body without setting any cookies
 *
 * Spec: [SPEC:frontend-auth/login-exitoso], [SPEC:frontend-auth/creds-invalidas]
 * Spec: [SPEC:frontend-auth/usuario-inactivo], [SPEC:frontend-auth/tenant-inactivo]
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();

  const backendRes = await fetch(
    `${process.env.BACKEND_URL}/api/auth/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!backendRes.ok) {
    // Propagate error status and body — no cookies set
    const errBody = await backendRes
      .json()
      .catch(() => ({ statusCode: backendRes.status, message: backendRes.statusText }));
    return NextResponse.json(errBody, { status: backendRes.status });
  }

  const { accessToken, refreshToken } = await backendRes.json();

  // Decode JWT payload — no signature verification needed here:
  // the payload comes from the trusted NestJS backend over a private network.
  const user = JSON.parse(
    Buffer.from(accessToken.split(".")[1], "base64url").toString(),
  ) as JwtPayload;

  const response = NextResponse.json({ user });
  response.cookies.set({ ...cookieAttrs(COOKIE_AT, ACCESS_MAX_AGE), value: accessToken });
  response.cookies.set({ ...cookieAttrs(COOKIE_RT, REFRESH_MAX_AGE), value: refreshToken });

  return response;
}
