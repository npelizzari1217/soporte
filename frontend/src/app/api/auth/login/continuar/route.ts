import { NextRequest, NextResponse } from "next/server";
import { responderConSesion } from "@/shared/auth/sesion-bff";

/**
 * POST /api/auth/login/continuar — canjea el ticket (segundo paso resuelto) por la sesión.
 * Con tokens fija `at`/`rt`; si falta elegir cliente reenvía la selección sin cookies.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/login/continuar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return responderConSesion(backendRes);
}
