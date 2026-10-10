import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookieAttrs, COOKIE_SSO_ESTADO, SSO_ESTADO_MAX_AGE } from "@/shared/auth/cookies";
import { destinoPosLogin } from "@/shared/auth/destino-pos-login";
import { CABECERA_IP_NAVEGADOR, ipDelNavegador } from "@/shared/auth/sesion-bff";

/** Espeja `IniciarSsoOutput` del backend. */
const iniciarSsoSchema = z.object({
  authorizeUrl: z.string().min(1),
  bindingToken: z.string().min(1),
});

const PROVEEDORES = new Set(["google", "microsoft"]);

interface RouteParams {
  params: Promise<{ proveedor: string }>;
}

function falla(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/login?motivo=sso-error", request.url), 302);
}

/**
 * GET /api/auth/sso/[proveedor]/iniciar?siguiente=
 *
 * Navegación completa del botón SSO: sanea `siguiente` con `destinoPosLogin` (el backend solo acota
 * el largo), pide `authorizeUrl` y `bindingToken` al backend, fija `sso_st` y redirige al proveedor.
 * Cualquier falla (slug fuera de la lista, backend, red, forma inválida) → `/login?motivo=sso-error`.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { proveedor } = await params;
  if (!PROVEEDORES.has(proveedor)) return falla(request);

  const siguiente = destinoPosLogin(request.nextUrl.searchParams.get("siguiente"));
  const ip = ipDelNavegador(request);

  let resultado: z.infer<typeof iniciarSsoSchema>;
  try {
    const backendRes = await fetch(`${process.env.BACKEND_URL}/auth/sso/${proveedor}/iniciar`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ip ? { [CABECERA_IP_NAVEGADOR]: ip } : {}),
      },
      body: JSON.stringify({ siguiente }),
    });
    if (!backendRes.ok) return falla(request);
    const parsed = iniciarSsoSchema.safeParse(await backendRes.json());
    if (!parsed.success) return falla(request);
    resultado = parsed.data;
  } catch {
    return falla(request);
  }

  const response = NextResponse.redirect(resultado.authorizeUrl, 302);
  response.cookies.set({
    ...cookieAttrs(COOKIE_SSO_ESTADO, SSO_ESTADO_MAX_AGE),
    value: resultado.bindingToken,
  });
  return response;
}
