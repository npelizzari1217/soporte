import { NextRequest, NextResponse } from "next/server";
import { cookieAttrs, cookieName, COOKIE_AT, COOKIE_RT, ACCESS_MAX_AGE } from "@/shared/auth/cookies";
import { decodeJwtPayload } from "@/shared/api/types";

/**
 * POST /api/auth/switch
 *
 * BFF tenant-switch handler:
 * 1. Reads `at` from the httpOnly cookie. If absent, short-circuits to 401
 *    without calling the backend (the endpoint requires `JwtAuthGuard`).
 * 2. Forwards `{ ...body, clienteId, refreshToken }` to the NestJS backend
 *    with `Authorization: Bearer <at>` — `refreshToken` is the raw `rt`
 *    cookie value, read here and never exposed to client JS (fix #168: the
 *    backend needs it to keep the refresh token's scope in sync with the
 *    switch, or the chosen tenant gets lost 15 minutes later when the
 *    access token is renewed). Absent `rt` (e.g. a session mid-login before
 *    any refresh was ever issued) is forwarded as absent too — the backend
 *    already treats a missing `refreshToken` as a no-op for this part.
 *
 *    EL `refreshToken` QUE VENGA EN EL BODY SE DESCARTA SIEMPRE, y por eso
 *    se desestructura afuera del spread. Un `{ ...body, ...(rt ? {...} : {}) }`
 *    parece equivalente y no lo es: cuando la cookie NO está, el overlay
 *    condicional no corre y el valor que puso el llamador sobrevive intacto
 *    hasta el backend. Este handler es la frontera donde ese campo deja de
 *    ser del cliente y pasa a ser de la cookie; si el descarte no es
 *    incondicional, el docstring de arriba miente y alguien puede confiar en
 *    él para sacar una guarda del backend.
 * 3. On success: updates ONLY the `at` cookie with the newly re-emitted
 *    token, returns `{ user }` (decoded payload) so the UI can refresh the
 *    session state immediately.
 * 4. On backend error (401/403): propagates status/body, cookie unchanged.
 *
 * ADR-4 (`sdd/auth-multitenancy/design`): the switch (token re-emission) is
 * the ONLY tenant-jump mechanism — it never ROTATES `rt` (only `/refresh`
 * does); forwarding its raw value here lets the backend update its scope
 * in place, which is not a rotation (see `RefreshTokenEntity.actualizarClienteId`).
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

  const rt = request.cookies.get(cookieName(COOKIE_RT))?.value;
  const body = await request.json();
  // El campo del cliente se descarta SIEMPRE; el único `refreshToken` válido
  // es el de la cookie httpOnly. Ver punto 2 del docstring. Se borra en vez de
  // desestructurar para no dejar una variable sin usar que el lint marca.
  const bodyDelCliente = { ...(body ?? {}) };
  delete bodyDelCliente.refreshToken;

  const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/switch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${at}`,
    },
    body: JSON.stringify({ ...bodyDelCliente, ...(rt ? { refreshToken: rt } : {}) }),
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
