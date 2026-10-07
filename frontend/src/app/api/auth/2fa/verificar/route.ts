import { NextRequest, NextResponse } from "next/server";
import { cookieAttrs, COOKIE_TD, TRUSTED_DEVICE_MAX_AGE } from "@/shared/auth/cookies";

/**
 * POST /api/auth/2fa/verificar — verifica el código del desafío y devuelve `{ ticket }`.
 * Si el backend emite un dispositivo confiable (`recordar`), lo guarda en la cookie httpOnly `td`
 * y NO lo incluye en la respuesta: el token del dispositivo nunca llega al JS del navegador.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/2fa/verificar`, {
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

  const cuerpo: { dispositivoConfiable?: unknown } =
    data !== null && typeof data === "object" ? data : {};
  const { dispositivoConfiable, ...resto } = cuerpo;
  const response = NextResponse.json(resto);
  if (typeof dispositivoConfiable === "string" && dispositivoConfiable) {
    response.cookies.set({
      ...cookieAttrs(COOKIE_TD, TRUSTED_DEVICE_MAX_AGE),
      value: dispositivoConfiable,
    });
  }
  return response;
}
