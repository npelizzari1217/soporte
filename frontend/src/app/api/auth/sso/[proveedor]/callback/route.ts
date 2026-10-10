import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  clearCookieAttrs,
  cookieAttrs,
  cookieName,
  COOKIE_SSO_ESTADO,
  COOKIE_SSO_PASO,
  COOKIE_TD,
  SSO_PASO_MAX_AGE,
  TRUSTED_DEVICE_MAX_AGE,
} from "@/shared/auth/cookies";
import { destinoPosLogin } from "@/shared/auth/destino-pos-login";
import { CABECERA_IP_NAVEGADOR, ipDelNavegador } from "@/shared/auth/sesion-bff";

/** Espeja `CompletarSsoResultado` del backend (nunca trae tokens de sesión). */
const resultadoSchema = z.intersection(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("needs2fa"), desafio: z.string().min(1) }),
    z.object({ kind: z.literal("needsEnrolamiento2fa"), desafio: z.string().min(1) }),
    z.object({
      kind: z.literal("ticket"),
      ticket: z.string().min(1),
      dispositivoConfiable: z.string().min(1).optional(),
    }),
  ]),
  z.object({ siguiente: z.string().nullable().optional() }),
);

interface RouteParams {
  params: Promise<{ proveedor: string }>;
}

const PROVEEDORES = new Set(["google", "microsoft"]);

/** Toda respuesta del callback: sin caché, sin Referer, y la cookie `sso_st` borrada. */
function terminar(request: NextRequest, ruta: string): NextResponse {
  const response = NextResponse.redirect(new URL(ruta, request.url), 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(clearCookieAttrs(COOKIE_SSO_ESTADO));
  return response;
}

const falla = (request: NextRequest): NextResponse => terminar(request, "/login?motivo=sso-error");

/**
 * GET /api/auth/sso/[proveedor]/callback?code&state — vuelta del proveedor (navegación Lax).
 *
 * Canjea el resultado con el backend usando `sso_st` como `binding` y SOLO la cookie `td` como
 * dispositivo confiable (lo que traiga la URL se ignora). Deja el resultado en `sso_paso`
 * (`{k,t}`, httpOnly, 120 s, nunca un JWT) y vuelve a `/login?sso=1`. `error=access_denied` →
 * `/login` sin mensaje; cualquier otra falla → `/login?motivo=sso-error`.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { proveedor } = await params;
  const query = request.nextUrl.searchParams;

  const error = query.get("error");
  if (error === "access_denied") return terminar(request, "/login");
  if (error !== null || !PROVEEDORES.has(proveedor)) return falla(request);

  const code = query.get("code");
  const state = query.get("state");
  const binding = request.cookies.get(cookieName(COOKIE_SSO_ESTADO))?.value;
  if (!code || !state || !binding) return falla(request);

  const td = request.cookies.get(cookieName(COOKIE_TD))?.value;
  const ip = ipDelNavegador(request);

  let resultado: z.infer<typeof resultadoSchema>;
  try {
    const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/sso/${proveedor}/callback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ip ? { [CABECERA_IP_NAVEGADOR]: ip } : {}),
      },
      body: JSON.stringify({ code, state, binding, ...(td ? { dispositivoConfiable: td } : {}) }),
    });
    if (!backendRes.ok) return falla(request);
    const parsed = resultadoSchema.safeParse(await backendRes.json());
    if (!parsed.success) return falla(request);
    resultado = parsed.data;
  } catch {
    return falla(request);
  }

  const siguiente = destinoPosLogin(resultado.siguiente);
  const destino = siguiente === "/" ? "/login?sso=1" : `/login?sso=1&siguiente=${encodeURIComponent(siguiente)}`;
  const response = terminar(request, destino);

  const paso =
    resultado.kind === "ticket"
      ? { k: "ticket", t: resultado.ticket }
      : { k: resultado.kind === "needs2fa" ? "2fa" : "enrol", t: resultado.desafio };
  response.cookies.set({
    ...cookieAttrs(COOKIE_SSO_PASO, SSO_PASO_MAX_AGE),
    value: JSON.stringify(paso),
  });

  if (resultado.kind === "ticket" && resultado.dispositivoConfiable) {
    response.cookies.set({
      ...cookieAttrs(COOKIE_TD, TRUSTED_DEVICE_MAX_AGE),
      value: resultado.dispositivoConfiable,
    });
  }
  return response;
}
