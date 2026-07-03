import { NextRequest, NextResponse } from "next/server";
import { cookieName, COOKIE_AT } from "@/shared/auth/cookies";

/**
 * BFF catch-all proxy — app/api/[...path]/route.ts
 *
 * Forwards ANY request method (GET/POST/PUT/PATCH/DELETE) to:
 *   ${BACKEND_URL}/api/<path>?<queryString>
 *
 * Responsibilities:
 * - Inject Authorization: Bearer <at> from the httpOnly cookie (server-side read)
 * - Propagate query string, body, and safe headers (content-type, accept)
 * - Drop client cookies (never forwarded to backend — backend uses Bearer, not cookies)
 * - CSRF defense: verify Origin == app origin for mutating methods (POST/PUT/PATCH/DELETE)
 * - Pass through backend status + body + content-type verbatim (client normalizes errors)
 * - The 401 from backend is propagated as-is → apiFetch single-flight handles refresh
 *
 * NOTE: /api/auth/* paths are handled by dedicated static route handlers (more specific
 * in Next.js App Router resolution) and are NEVER routed here.
 *
 * Spec: [SPEC:frontend-auth/login-exitoso Bearer injection via proxy]
 * Spec: [SPEC:frontend-api-client/normalizacion-respuestas proxy pass-through]
 * Design: §4 — BFF catch-all
 * Design: §2.1 — CSRF: SameSite=Lax + Origin check (ADR-3)
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Headers explicitly allowed to be forwarded to the backend.
 *
 * x-tenant-id: cross-tenant selector del operador global (admin-general, ADR-3).
 * El backend (TenantGuard) rechaza con 403 a cualquier no-operador que lo envíe,
 * así que reenviarlo aquí es seguro — la autorización real vive en el backend.
 */
const ALLOWED_HEADERS = new Set(["content-type", "accept", "x-tenant-id"]);

/** Headers that must never be forwarded (security + protocol). */
const BLOCKED_HEADERS = new Set([
  "host",
  "cookie",
  "content-length",
  "connection",
  "transfer-encoding",
]);

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const pathStr = path.join("/");

  // ── CSRF defense ────────────────────────────────────────────────────────────
  // SameSite=Lax prevents cross-site cookie sending for most methods, but an
  // explicit Origin check adds defense-in-depth for mutating methods (ADR-3).
  if (MUTATING_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    const reqUrl = new URL(request.url);
    // Detrás de un reverse-proxy que termina TLS (IIS/ARR), `request.url` refleja
    // el host/protocolo INTERNO (ej. http://localhost:3100), no el público. Comparar
    // contra eso rechaza el Origin real del navegador (https://dominio) → 403 CSRF en
    // TODA mutación. Preferimos el origen público explícito (APP_ORIGIN) y, si no está,
    // los headers X-Forwarded-* del proxy; recién en dev caemos a reqUrl.
    const fwdProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const fwdHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const expectedOrigin =
      process.env.APP_ORIGIN ??
      (fwdProto && fwdHost
        ? `${fwdProto}://${fwdHost}`
        : `${reqUrl.protocol}//${reqUrl.host}`);

    if (!origin || origin !== expectedOrigin) {
      return new NextResponse(
        JSON.stringify({ message: "Forbidden: CSRF check failed" }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
  }

  // ── Build target URL ─────────────────────────────────────────────────────────
  const target = `${process.env.BACKEND_URL}/api/${pathStr}${request.nextUrl.search}`;

  // ── Build forwarded headers ──────────────────────────────────────────────────
  const forwardedHeaders = new Headers();

  // Inject Bearer from the httpOnly at cookie — the browser cannot do this
  const at = request.cookies.get(cookieName(COOKIE_AT))?.value;
  if (at) {
    forwardedHeaders.set("authorization", `Bearer ${at}`);
  }

  // Copy safe headers (content-type, accept); drop everything else
  for (const [key, value] of request.headers.entries()) {
    const k = key.toLowerCase();
    if (ALLOWED_HEADERS.has(k) && !BLOCKED_HEADERS.has(k)) {
      forwardedHeaders.set(k, value);
    }
  }

  // ── Forward body for non-GET/HEAD methods ────────────────────────────────────
  // Use arrayBuffer() to buffer the body — avoids the `duplex: 'half'`
  // TypeScript issue and is sufficient for the non-streaming foundation.
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const body: ArrayBuffer | undefined = hasBody
    ? await request.arrayBuffer()
    : undefined;

  // ── Proxy to backend ─────────────────────────────────────────────────────────
  const backendRes = await fetch(target, {
    method: request.method,
    headers: forwardedHeaders,
    body,
    redirect: "manual", // never follow redirects — pass them through
    cache: "no-store",
  });

  // ── Build response — copy status + body + content-type verbatim ──────────────
  // The client (apiFetch + normalize) is responsible for parsing errors.
  // A 401 here is deliberately passed through so the single-flight refresh
  // in the browser handles it (design §2.4, ADR-1).
  const responseHeaders = new Headers();
  const contentType = backendRes.headers.get("content-type");
  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
