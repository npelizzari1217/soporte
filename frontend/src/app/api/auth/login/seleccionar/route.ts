import { NextRequest, NextResponse } from "next/server";
import { responderConSesion } from "@/shared/auth/sesion-bff";

/**
 * POST /api/auth/login/seleccionar — canjea el ticket y el cliente elegido por la sesión.
 * Fija `at`/`rt` y devuelve `{ user }`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/login/seleccionar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return responderConSesion(backendRes);
}
