import { NextRequest, NextResponse } from "next/server";
import { ipDelNavegador } from "@/shared/auth/sesion-bff";

/**
 * BFF de la API pública — `/api/v1/{...path}` → `${BACKEND_URL}/v1/{path}` (CA5).
 *
 * El segmento estático `v1` le gana al catch-all genérico `app/api/[...path]` por la resolución
 * de rutas de Next (igual que `app/api/auth/*`). Es opcional (`[[...path]]`) para que también
 * `/api/v1` pelado caiga acá y no en el proxy genérico, que inyectaría el bearer de la sesión.
 *
 * Diferencias con el proxy genérico, todas deliberadas:
 * - La credencial es la clave del integrador (`x-api-key`), no la sesión. NUNCA se reenvían
 *   `authorization` ni `cookie`: un navegador con sesión abierta no puede convertir su cookie en
 *   credencial de la API. Los headers salientes se arman desde cero, por allowlist.
 * - `x-forwarded-for` se reenvía siempre, porque el que llama no tiene sesión, pero solo la
 *   entrada que agrega IIS/ARR (la más a la derecha, validada como IP por `ipDelNavegador`):
 *   lo que el cliente mande a la izquierda se descarta. Mismo criterio que `publico/` en el
 *   genérico y que el BFF de sesión. El throttler v1 cuenta por clave, no por IP
 *   (`ApiV1ThrottlerGuard`), así que hoy es defensa en profundidad, no un control.
 *   En desarrollo local, sin proxy delante, el header no viaja: la única entrada sería la
 *   del cliente.
 * - Los segmentos se validan y se re-codifican: `..`, `.`, vacíos o con `/` o `\` (p. ej.
 *   `%2e%2e` o `%2F`, que Next entrega decodificados) responden 400. Sin esto, `new URL`
 *   resolvería `v1/../clientes` a una ruta del backend fuera de `v1`.
 * - En la respuesta viajan el status, el cuerpo como bytes, `content-type`, `retry-after` y los
 *   `x-ratelimit-*` del throttler (429, CA6). Nunca `set-cookie`.
 * - Backend caído → 502 con cuerpo JSON en el formato de error de NestJS. El genérico no lo
 *   maneja (el `fetch` tira y Next responde 500); un integrador necesita distinguir eso de un
 *   error propio del backend.
 * - Solo `GET` y `POST`, los únicos métodos que sirve el backend en `v1` (CA1). Para el resto
 *   Next responde 405 sin tocar el backend.
 */
interface RouteParams {
  params: Promise<{ path?: string[] }>;
}

/** Headers de respuesta que se reenvían, además de `content-type`. */
const HEADERS_RESPUESTA = /^(retry-after|x-ratelimit-)/i;

function segmentoValido(segmento: string): boolean {
  return segmento !== "" && segmento !== "." && segmento !== ".." && !/[/\\]/.test(segmento);
}

function errorJson(statusCode: number, message: string): NextResponse {
  return NextResponse.json({ statusCode, message }, { status: statusCode });
}

async function proxy(request: NextRequest, params: RouteParams["params"]): Promise<NextResponse> {
  const { path = [] } = await params;
  if (!path.every(segmentoValido)) {
    return errorJson(400, "Ruta inválida");
  }

  const base = `${process.env.BACKEND_URL}/v1`;
  const backendUrl = new URL([base, ...path.map(encodeURIComponent)].join("/"));
  backendUrl.search = request.nextUrl.search;

  const headers = new Headers();
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) headers.set("x-api-key", apiKey);
  const ip = ipDelNavegador(request);
  if (ip) headers.set("x-forwarded-for", ip);

  let body: ArrayBuffer | undefined;
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") {
    body = await request.arrayBuffer();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(backendUrl, { method, headers, body });
  } catch {
    return errorJson(502, "Backend no disponible");
  }

  const resHeaders = new Headers();
  backendRes.headers.forEach((valor, nombre) => {
    if (nombre === "content-type" || HEADERS_RESPUESTA.test(nombre)) resHeaders.set(nombre, valor);
  });

  // 204/304 no llevan cuerpo; para el resto, bytes exactos (mismo criterio que el genérico).
  const sinCuerpo = backendRes.status === 204 || backendRes.status === 304;
  const buffer = sinCuerpo ? null : await backendRes.arrayBuffer();
  return new NextResponse(buffer, { status: backendRes.status, headers: resHeaders });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return proxy(request, params);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return proxy(request, params);
}
