import { NextRequest, NextResponse } from "next/server";
import { clearCookieAttrs, cookieName, COOKIE_AT, COOKIE_RT } from "@/shared/auth/cookies";

/**
 * POST /api/auth/change-password
 *
 * BFF de cambio de contraseña: proxy TRANSPARENTE hacia el backend.
 * 1. Reenvía `{ passwordActual, passwordNueva }` con `Authorization: Bearer <at>`.
 * 2. Ante 204 (éxito): el backend ya revocó todos los refresh tokens del
 *    usuario, así que la sesión actual tampoco sirve — se limpian las
 *    cookies `at` + `rt` (mismo patrón que `logout-all`).
 * 3. Ante CUALQUIER otro status (401 del guard, 422 de negocio, 403, 400 del
 *    `ValidationPipe`): el status y el cuerpo se reenvían TAL CUAL, con las
 *    cookies INTACTAS. El BFF no puede distinguir un 401 de token vencido de
 *    un 401 de negocio, así que traducirlo a ciegas rompería el refresh
 *    legítimo — y limpiar cookies ante un simple error de tipeo en la
 *    contraseña actual deslogearía al usuario sin motivo.
 *
 * Spec: sdd/cambio-de-contrasena — WU3, reconciliación #2409 punto 4.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const at = request.cookies.get(cookieName(COOKIE_AT))?.value ?? "";

  // `NextRequest.json()` devuelve `Promise<any>` y tira si el body no es JSON
  // válido. Se tipa como `unknown` para que el `any` no se cuele por la puerta
  // de atrás, y se protege para que un body malformado sea un 400 explícito y
  // no un 500 sin manejo. La forma real la valida el backend.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { statusCode: 400, message: "El cuerpo del pedido no es JSON válido." },
      { status: 400 },
    );
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${process.env.BACKEND_URL}/auth/change-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${at}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Backend inalcanzable: no hay respuesta que reenviar ni certeza de que
    // el cambio haya ocurrido. Cookies intactas — no es un 204, no se limpian.
    return NextResponse.json(
      { statusCode: 502, message: "Bad Gateway" },
      { status: 502 },
    );
  }

  if (backendRes.status === 204) {
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set({ ...clearCookieAttrs(COOKIE_AT) });
    response.cookies.set({ ...clearCookieAttrs(COOKIE_RT) });
    return response;
  }

  // `Response.json()` también devuelve `Promise<any>`: se acota a `unknown`
  // porque este BFF no interpreta el cuerpo, solo lo reenvía tal cual.
  const data: unknown = await backendRes.json().catch(() => null);

  return NextResponse.json(
    data ?? { statusCode: backendRes.status, message: backendRes.statusText },
    { status: backendRes.status },
  );
}
