import { NextRequest, NextResponse } from "next/server";
import { cookieName, COOKIE_TD } from "@/shared/auth/cookies";
import { CABECERA_IP_NAVEGADOR, ipDelNavegador, responderConSesion } from "@/shared/auth/sesion-bff";

/**
 * POST /api/auth/login
 *
 * BFF login handler:
 * 1. Forwards credentials (+ optional `clienteId`) to the NestJS backend, con la IP del navegador
 *    (`x-soporte-ip-navegador`) y la cookie `td` como `dispositivoConfiable` (2FA, ADR-7). Lo que
 *    el cliente mande como `dispositivoConfiable` se descarta: solo vale la cookie.
 * 2. Si el backend pide un paso más (`needsClienteSelection`, `needs2fa`, `needsEnrolamiento2fa`),
 *    reenvía el payload SIN cookies: la UI sigue el flujo.
 * 3. On success with tokens: sets httpOnly `at`/`rt` cookies, returns `{ user }`.
 * 4. On backend error (401/403): propagates status/body, no cookies set.
 *
 * Spec: [R23] BFF login route.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  delete body.dispositivoConfiable;
  const td = request.cookies.get(cookieName(COOKIE_TD))?.value;
  const ip = ipDelNavegador(request);

  const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ip ? { [CABECERA_IP_NAVEGADOR]: ip } : {}),
    },
    body: JSON.stringify({ ...body, ...(td ? { dispositivoConfiable: td } : {}) }),
  });

  return responderConSesion(backendRes);
}
