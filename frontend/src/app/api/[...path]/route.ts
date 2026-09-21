import { NextRequest, NextResponse } from "next/server";
import { cookieName, COOKIE_AT } from "@/shared/auth/cookies";

/**
 * Generic BFF proxy — `/api/{...path}` → `${BACKEND_URL}/{path}`.
 *
 * Prerequisite for B1+ (not in tasks.md): `apiFetch` (PR11) always calls
 * `/api/{path}`, and every feature hook from this batch onward expects that
 * to reach the real NestJS backend (ADR-2). Before this batch, only
 * `/api/auth/*` had dedicated BFF route handlers — no generic forwarder
 * existed for `tickets`/`catalogos`/`usuarios`/etc. Literal segments
 * (`app/api/auth/login/route.ts`, etc.) still win over this catch-all per
 * Next.js route resolution, so the auth BFF routes are unaffected.
 *
 * Responsibilities:
 * - Injects `Authorization: Bearer <at>` from the httpOnly `at` cookie —
 *   the browser never sees the token (same trust boundary as the rest of
 *   the BFF). No cookie → forwarded without the header; the backend's own
 *   `JwtAuthGuard` returns 401, we don't duplicate that check here.
 * - Forwards the query string verbatim (filters/pagination, ADR-2).
 * - Body passthrough: JSON/text bytes preserve the original `content-type`;
 *   `multipart/form-data` (adjuntos, T1.13) is re-sent as `FormData` so
 *   `fetch` regenerates a valid boundary.
 * - Response passthrough: 204 short-circuits (no JSON parse attempt, mirrors
 *   `shared/api/normalize.ts`); JSON bodies pass through as-is so `ApiError`
 *   normalization on the client sees the exact NestJS `{statusCode,message}`
 *   shape; anything else (binarios, CSV, etc.) pasa como `ArrayBuffer` —
 *   NUNCA `text()` (sdd/logo-por-cliente, WU3, H6): decodificar un PNG como
 *   UTF-8 y volver a serializarlo lo corrompe. `Content-Disposition` (nombre
 *   de descarga), `X-Content-Type-Options` (nosniff del logo) y
 *   `Cache-Control` se reenvían cuando el backend los manda.
 *
 * 401 handling is intentionally NOT special-cased here — `apiFetch`'s
 * single-flight refresh (PR11) reacts to a plain proxied 401 exactly like it
 * would to a direct one.
 *
 * `x-forwarded-for` se reenvía SOLO para el prefijo `publico/` (CSAT, WU8,
 * ADR-C6). Todo el resto de la app habla con el backend a través de este
 * mismo proxy server-side, así que el backend ve la IP del BFF para TODOS
 * los usuarios autenticados — un solo cupo compartido no discrimina nada
 * ahí, y ensanchar el reenvío a rutas autenticadas no aporta nada (el actor
 * ya está identificado por su sesión). El endpoint público de la encuesta es
 * el único caso donde no hay sesión y el throttler necesita un discriminador
 * por IP+token (`CsatThrottlerGuard`). Sin `trust proxy` en el backend: este
 * header sigue siendo falsificable, no es control de seguridad.
 */
interface RouteParams {
  params: Promise<{ path: string[] }>;
}

async function proxy(request: NextRequest, params: Promise<{ path: string[] }>): Promise<NextResponse> {
  const { path } = await params;
  const at = request.cookies.get(cookieName(COOKIE_AT))?.value;

  const backendUrl = new URL(`${process.env.BACKEND_URL}/${path.join("/")}`);
  backendUrl.search = request.nextUrl.search;

  const headers = new Headers();
  if (at) headers.set("authorization", `Bearer ${at}`);

  if (path[0] === "publico") {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) headers.set("x-forwarded-for", xff);
  }

  let body: BodyInit | undefined;
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") {
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("multipart/form-data")) {
      body = await request.formData();
    } else {
      body = await request.arrayBuffer();
      if (contentType) headers.set("content-type", contentType);
    }
  }

  const backendRes = await fetch(backendUrl, { method, headers, body });

  if (backendRes.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const resContentType = backendRes.headers.get("content-type");
  if (resContentType?.includes("application/json")) {
    const data = await backendRes.json().catch(() => null);
    return NextResponse.json(data, { status: backendRes.status });
  }

  // `arrayBuffer()`, nunca `text()`: preserva los bytes exactos para
  // binarios (logo del cliente, WU3) igual que para las descargas de texto
  // ya existentes (CSV) — mismo camino, sin recodificar ninguno de los dos.
  const buffer = await backendRes.arrayBuffer();
  const resHeaders = new Headers();
  if (resContentType) resHeaders.set("content-type", resContentType);
  // `Content-Disposition` se reenvía porque es el ÚNICO lugar donde viaja el
  // nombre del archivo de una descarga (`GET /compras/export`). Si el proxy lo
  // come, el navegador baja el CSV con el nombre de la ruta ("export") y sin
  // extensión — falla silenciosa: el archivo baja igual, solo que inservible.
  const resDisposition = backendRes.headers.get("content-disposition");
  if (resDisposition) resHeaders.set("content-disposition", resDisposition);
  // `X-Content-Type-Options`/`Cache-Control`: el `GET` del logo (WU2) los
  // manda para que el navegador no haga MIME-sniffing y para su política de
  // caché — sin reenviarlos acá, el proxy los tira silenciosamente.
  const resNosniff = backendRes.headers.get("x-content-type-options");
  if (resNosniff) resHeaders.set("x-content-type-options", resNosniff);
  const resCacheControl = backendRes.headers.get("cache-control");
  if (resCacheControl) resHeaders.set("cache-control", resCacheControl);

  return new NextResponse(buffer, { status: backendRes.status, headers: resHeaders });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return proxy(request, params);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return proxy(request, params);
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return proxy(request, params);
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return proxy(request, params);
}
