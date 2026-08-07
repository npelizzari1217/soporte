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
 *   shape; anything else falls back to text.
 *
 * 401 handling is intentionally NOT special-cased here — `apiFetch`'s
 * single-flight refresh (PR11) reacts to a plain proxied 401 exactly like it
 * would to a direct one.
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

  const text = await backendRes.text();
  return new NextResponse(text, {
    status: backendRes.status,
    headers: resContentType ? { "content-type": resContentType } : undefined,
  });
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
