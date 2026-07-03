import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { NextRequest } from "next/server";
import { GET, POST, PUT } from "./route";
// PATCH and DELETE export the same handler as PUT — covered implicitly by the PUT test.

// Spec: [SPEC:frontend-auth/login-exitoso Bearer injection via proxy]
// Spec: [SPEC:frontend-api-client/normalizacion-respuestas proxy pass-through]

const BACKEND = "http://testbackend";

/** Helper: create NextRequest params arg for catch-all route */
function mkParams(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

describe("BFF catch-all proxy", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
    delete process.env.APP_ORIGIN;
  });

  // ─── Bearer injection ────────────────────────────────────────────────────────

  it("GET with at cookie → backend receives Authorization: Bearer <at>", async () => {
    let capturedAuth: string | null = null;

    server.use(
      http.get(`${BACKEND}/api/tickets`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return HttpResponse.json([{ id: "1" }]);
      }),
    );

    const req = new NextRequest("http://localhost/api/tickets", {
      method: "GET",
      headers: { cookie: "at=my_access_token" },
    });

    const res = await GET(req, mkParams(["tickets"]));

    expect(res.status).toBe(200);
    expect(capturedAuth).toBe("Bearer my_access_token");
  });

  // ─── Query string propagation ─────────────────────────────────────────────────

  it("GET with query string → ?status=open propagated to backend", async () => {
    let capturedUrl: string | null = null;

    server.use(
      http.get(`${BACKEND}/api/tickets`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    const req = new NextRequest(
      "http://localhost/api/tickets?status=open&page=1",
      {
        method: "GET",
        headers: { cookie: "at=token" },
      },
    );

    await GET(req, mkParams(["tickets"]));

    expect(capturedUrl).toContain("?status=open&page=1");
  });

  // ─── Body + content-type propagation ─────────────────────────────────────────

  it("POST with JSON body → body forwarded, content-type: application/json propagated", async () => {
    let capturedBody: unknown = null;
    let capturedContentType: string | null = null;

    server.use(
      http.post(`${BACKEND}/api/tickets`, async ({ request }) => {
        capturedBody = await request.json();
        capturedContentType = request.headers.get("content-type");
        return HttpResponse.json({ id: "2" }, { status: 201 });
      }),
    );

    const req = new NextRequest("http://localhost/api/tickets", {
      method: "POST",
      body: JSON.stringify({ title: "Test ticket" }),
      headers: {
        "content-type": "application/json",
        cookie: "at=token",
        origin: "http://localhost",
      },
    });

    const res = await POST(req, mkParams(["tickets"]));

    expect(res.status).toBe(201);
    expect(capturedBody).toMatchObject({ title: "Test ticket" });
    expect(capturedContentType).toContain("application/json");
  });

  // ─── CSRF check ──────────────────────────────────────────────────────────────

  it("POST with non-matching Origin → 403 (CSRF check)", async () => {
    const req = new NextRequest("http://localhost/api/tickets", {
      method: "POST",
      body: JSON.stringify({ title: "Test" }),
      headers: {
        "content-type": "application/json",
        cookie: "at=token",
        origin: "http://evil.com",
      },
    });

    const res = await POST(req, mkParams(["tickets"]));

    expect(res.status).toBe(403);
  });

  it("POST with missing Origin → 403 (CSRF check)", async () => {
    const req = new NextRequest("http://localhost/api/tickets", {
      method: "POST",
      body: JSON.stringify({ title: "Test" }),
      headers: {
        "content-type": "application/json",
        cookie: "at=token",
        // no origin header
      },
    });

    const res = await POST(req, mkParams(["tickets"]));

    expect(res.status).toBe(403);
  });

  // ─── CSRF detrás de reverse-proxy (regresión: prod HTTPS + IIS) ───────────────
  // Bug: request.url refleja el host interno (http://localhost:3100), no el público,
  // por lo que el Origin real del navegador (https://dominio) se rechazaba → 403 en
  // TODA mutación en producción. El fix usa APP_ORIGIN / X-Forwarded-* como origen esperado.

  it("POST behind proxy: Origin matches APP_ORIGIN → forwarded (no 403)", async () => {
    process.env.APP_ORIGIN = "https://soporte.sesitec.net";
    server.use(
      http.post(`${BACKEND}/api/clientes`, () =>
        HttpResponse.json({ id: "c1" }, { status: 201 }),
      ),
    );

    // reqUrl interno (localhost:3100) ≠ Origin público — el caso que rompía en prod.
    const req = new NextRequest("http://localhost:3100/api/clientes", {
      method: "POST",
      body: JSON.stringify({ nombre: "Acme" }),
      headers: {
        "content-type": "application/json",
        cookie: "at=token",
        origin: "https://soporte.sesitec.net",
      },
    });

    const res = await POST(req, mkParams(["clientes"]));

    expect(res.status).toBe(201);
  });

  it("POST behind proxy: Origin != APP_ORIGIN → 403", async () => {
    process.env.APP_ORIGIN = "https://soporte.sesitec.net";
    const req = new NextRequest("http://localhost:3100/api/clientes", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
        cookie: "at=token",
        origin: "https://evil.com",
      },
    });

    const res = await POST(req, mkParams(["clientes"]));

    expect(res.status).toBe(403);
  });

  it("POST behind proxy: X-Forwarded-* used when APP_ORIGIN unset", async () => {
    server.use(
      http.post(`${BACKEND}/api/clientes`, () =>
        HttpResponse.json({ id: "c2" }, { status: 201 }),
      ),
    );

    const req = new NextRequest("http://localhost:3100/api/clientes", {
      method: "POST",
      body: JSON.stringify({ nombre: "Acme" }),
      headers: {
        "content-type": "application/json",
        cookie: "at=token",
        origin: "https://soporte.sesitec.net",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "soporte.sesitec.net",
      },
    });

    const res = await POST(req, mkParams(["clientes"]));

    expect(res.status).toBe(201);
  });

  // ─── Cookie header NOT forwarded to backend ───────────────────────────────────

  it("browser Cookie header is NOT forwarded to backend (only Bearer injected)", async () => {
    let capturedCookieHeader: string | null = null;

    server.use(
      http.get(`${BACKEND}/api/tickets`, ({ request }) => {
        capturedCookieHeader = request.headers.get("cookie");
        return HttpResponse.json([]);
      }),
    );

    const req = new NextRequest("http://localhost/api/tickets", {
      method: "GET",
      headers: {
        cookie: "at=my_token; rt=my_refresh; session=abc",
      },
    });

    await GET(req, mkParams(["tickets"]));

    expect(capturedCookieHeader).toBeNull();
  });

  // ─── Backend 401 propagated as-is ────────────────────────────────────────────

  it("backend 401 → propagated as-is to client (no refresh intervention)", async () => {
    server.use(
      http.get(`${BACKEND}/api/tickets`, () =>
        new HttpResponse(null, { status: 401 }),
      ),
    );

    const req = new NextRequest("http://localhost/api/tickets", {
      method: "GET",
      headers: { cookie: "at=expired_token" },
    });

    const res = await GET(req, mkParams(["tickets"]));

    expect(res.status).toBe(401);
  });

  // ─── Backend 200 → status + body + content-type copied verbatim ──────────────

  it("backend 200 → status + body + content-type copied verbatim", async () => {
    server.use(
      http.get(`${BACKEND}/api/tickets`, () =>
        HttpResponse.json([{ id: "1", title: "Test" }]),
      ),
    );

    const req = new NextRequest("http://localhost/api/tickets", {
      method: "GET",
      headers: { cookie: "at=token" },
    });

    const res = await GET(req, mkParams(["tickets"]));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: "1", title: "Test" }]);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  // ─── GET without at cookie → no Authorization header ─────────────────────────

  it("GET without at cookie → backend receives no Authorization header", async () => {
    let capturedAuth: string | null = null;

    server.use(
      http.get(`${BACKEND}/api/public`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return HttpResponse.json({ public: true });
      }),
    );

    const req = new NextRequest("http://localhost/api/public", {
      method: "GET",
      // no cookie header
    });

    await GET(req, mkParams(["public"]));

    expect(capturedAuth).toBeNull();
  });

  // ─── x-tenant-id forwarding (admin-general PR5, T5.1) ─────────────────────────
  // Spec ref: ADR-3 del design — el BFF debe reenviar x-tenant-id para que el
  // cross-tenant del operador funcione (TenantGuard lo consume en el backend).

  it("GET with x-tenant-id header → backend receives x-tenant-id forwarded", async () => {
    let capturedTenantId: string | null = null;

    server.use(
      http.get(`${BACKEND}/api/ciclos`, ({ request }) => {
        capturedTenantId = request.headers.get("x-tenant-id");
        return HttpResponse.json([]);
      }),
    );

    const req = new NextRequest("http://localhost/api/ciclos", {
      method: "GET",
      headers: {
        cookie: "at=token",
        "x-tenant-id": "some-uuid",
      },
    });

    await GET(req, mkParams(["ciclos"]));

    expect(capturedTenantId).toBe("some-uuid");
  });

  it("GET without x-tenant-id header → backend receives no x-tenant-id (no header artificial)", async () => {
    let capturedTenantId: string | null = null;

    server.use(
      http.get(`${BACKEND}/api/ciclos`, ({ request }) => {
        capturedTenantId = request.headers.get("x-tenant-id");
        return HttpResponse.json([]);
      }),
    );

    const req = new NextRequest("http://localhost/api/ciclos", {
      method: "GET",
      headers: { cookie: "at=token" },
    });

    await GET(req, mkParams(["ciclos"]));

    expect(capturedTenantId).toBeNull();
  });

  it("GET with x-tenant-id → content-type and accept still forwarded (no-regression)", async () => {
    let capturedContentType: string | null = null;
    let capturedAccept: string | null = null;

    server.use(
      http.get(`${BACKEND}/api/ciclos`, ({ request }) => {
        capturedContentType = request.headers.get("content-type");
        capturedAccept = request.headers.get("accept");
        return HttpResponse.json([]);
      }),
    );

    const req = new NextRequest("http://localhost/api/ciclos", {
      method: "GET",
      headers: {
        cookie: "at=token",
        "x-tenant-id": "some-uuid",
        "content-type": "application/json",
        accept: "application/json",
      },
    });

    await GET(req, mkParams(["ciclos"]));

    expect(capturedContentType).toContain("application/json");
    expect(capturedAccept).toContain("application/json");
  });

  // ─── PUT/PATCH/DELETE export ──────────────────────────────────────────────────

  it("PUT with same-origin Origin → forwarded to backend", async () => {
    let capturedMethod: string | null = null;

    server.use(
      http.put(`${BACKEND}/api/tickets/1`, ({ request }) => {
        capturedMethod = request.method;
        return HttpResponse.json({ id: "1" });
      }),
    );

    const req = new NextRequest("http://localhost/api/tickets/1", {
      method: "PUT",
      body: JSON.stringify({ status: "closed" }),
      headers: {
        "content-type": "application/json",
        cookie: "at=token",
        origin: "http://localhost",
      },
    });

    const res = await PUT(req, mkParams(["tickets", "1"]));

    expect(res.status).toBe(200);
    expect(capturedMethod).toBe("PUT");
  });
});
