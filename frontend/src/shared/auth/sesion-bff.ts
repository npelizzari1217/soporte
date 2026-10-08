import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import {
  cookieAttrs,
  COOKIE_AT,
  COOKIE_RT,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  COOKIE_TD,
  TRUSTED_DEVICE_MAX_AGE,
} from "@/shared/auth/cookies";
import { decodeJwtPayload } from "@/shared/api/types";

/** Cabecera con la que el BFF le pasa al backend la IP del navegador (ADR-6, I4). */
export const CABECERA_IP_NAVEGADOR = "x-soporte-ip-navegador";

/** Quita el puerto de una entrada de `x-forwarded-for`: `1.2.3.4:5` y `[::1]:5` (ARR por defecto). */
function sinPuerto(entrada: string): string {
  const corchetes = /^\[([^\]]+)\](?::\d+)?$/.exec(entrada);
  if (corchetes) return corchetes[1];
  if (/^[^:]+:\d+$/.test(entrada)) return entrada.slice(0, entrada.lastIndexOf(":"));
  return entrada;
}

/**
 * IP del navegador para el límite de intentos del backend. Toma la entrada MÁS A LA DERECHA de
 * `x-forwarded-for` (la agrega IIS/ARR; lo que el navegador mande a la izquierda se descarta),
 * le quita el puerto y la devuelve solo si es una IP válida.
 */
export function ipDelNavegador(request: NextRequest): string | undefined {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return undefined;
  const ultima = xff.split(",").pop()?.trim() ?? "";
  const ip = sinPuerto(ultima);
  return isIP(ip) !== 0 ? ip : undefined;
}

/**
 * Traduce la respuesta del backend en la del BFF. Un error se propaga tal cual sin cookies; una
 * respuesta con tokens fija `at`/`rt` y devuelve `{ user }`; cualquier otra (segundo paso,
 * selección de cliente) se reenvía sin cookies de sesión. `dispositivoConfiable` nunca sale hacia el
 * cliente: si viene (login que omitió el código gracias a un dispositivo vigente, que el backend
 * renovó 30 días), se re-fija la cookie `td` con 30 días nuevos (ventana deslizante).
 */
export async function responderConSesion(backendRes: Response): Promise<NextResponse> {
  const data = await backendRes.json().catch(() => null);

  if (!backendRes.ok) {
    return NextResponse.json(
      data ?? { statusCode: backendRes.status, message: backendRes.statusText },
      { status: backendRes.status },
    );
  }

  const dispositivoConfiable: unknown =
    data && typeof data === "object" ? data.dispositivoConfiable : undefined;
  const fijarDispositivo = (response: NextResponse): NextResponse => {
    if (typeof dispositivoConfiable === "string" && dispositivoConfiable) {
      response.cookies.set({
        ...cookieAttrs(COOKIE_TD, TRUSTED_DEVICE_MAX_AGE),
        value: dispositivoConfiable,
      });
    }
    return response;
  };

  if (data && typeof data.accessToken === "string" && typeof data.refreshToken === "string") {
    // El payload viene del backend de confianza por red privada: no se verifica la firma.
    const response = NextResponse.json({ user: decodeJwtPayload(data.accessToken) });
    response.cookies.set({ ...cookieAttrs(COOKIE_AT, ACCESS_MAX_AGE), value: data.accessToken });
    response.cookies.set({ ...cookieAttrs(COOKIE_RT, REFRESH_MAX_AGE), value: data.refreshToken });
    return fijarDispositivo(response);
  }

  if (data && typeof data === "object") delete data.dispositivoConfiable;
  return fijarDispositivo(NextResponse.json(data));
}
