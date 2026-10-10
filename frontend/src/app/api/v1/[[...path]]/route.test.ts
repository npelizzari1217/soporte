import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

/**
 * BFF de la API pública — `/api/v1/{...path}` reenvía la clave del integrador (`x-api-key`) y su
 * IP a `BACKEND_URL/v1/{path}`, sin cookies ni `authorization` (CA5). La cookie de sesión de un
 * navegador logueado nunca se convierte en credencial de la API.
 */
const BACKEND = "http://testbackend/api";

function params(path?: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("/api/v1/[[...path]] BFF de la API pública", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("GET: reenvía x-api-key y x-forwarded-for, y preserva el query string", async () => {
    let captured: Headers | undefined;
    let capturedUrl = "";
    server.use(
      http.get(`${BACKEND}/v1/tickets`, ({ request }) => {
        captured = request.headers;
        capturedUrl = request.url;
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );

    const req = new NextRequest("http://localhost/api/v1/tickets?estado=ABIERTO&pagina=2", {
      headers: { "x-api-key": "sop_abc123", "x-forwarded-for": "203.0.113.5" },
    });
    const res = await GET(req, params(["tickets"]));

    expect(res.status).toBe(200);
    expect(captured?.get("x-api-key")).toBe("sop_abc123");
    expect(captured?.get("x-forwarded-for")).toBe("203.0.113.5");
    expect(capturedUrl).toBe(`${BACKEND}/v1/tickets?estado=ABIERTO&pagina=2`);
    expect(await res.json()).toEqual({ items: [], total: 0 });
  });

  it("NUNCA reenvía cookie ni authorization, aunque el pedido traiga una sesión abierta", async () => {
    let captured: Headers | undefined;
    server.use(
      http.get(`${BACKEND}/v1/tickets/t1`, ({ request }) => {
        captured = request.headers;
        return HttpResponse.json({ id: "t1" });
      }),
    );

    const req = new NextRequest("http://localhost/api/v1/tickets/t1", {
      headers: {
        cookie: "at=token-de-sesion; rt=refresh",
        authorization: "Bearer token-de-sesion",
        "x-api-key": "sop_abc123",
      },
    });
    const res = await GET(req, params(["tickets", "t1"]));

    expect(res.status).toBe(200);
    expect(captured?.get("cookie")).toBeNull();
    expect(captured?.get("authorization")).toBeNull();
    expect(captured?.get("x-api-key")).toBe("sop_abc123");
  });

  it("sin clave: se reenvía igual, sin x-api-key (el guard del backend es el que responde 401)", async () => {
    let capturedKey: string | null | undefined;
    server.use(
      http.get(`${BACKEND}/v1/catalogos`, ({ request }) => {
        capturedKey = request.headers.get("x-api-key");
        return HttpResponse.json({ statusCode: 401, message: "Unauthorized" }, { status: 401 });
      }),
    );

    const res = await GET(new NextRequest("http://localhost/api/v1/catalogos"), params(["catalogos"]));

    expect(capturedKey).toBeNull();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ statusCode: 401, message: "Unauthorized" });
  });

  it("POST: reenvía el cuerpo, su content-type y el método en rutas anidadas", async () => {
    let capturedBody: unknown = null;
    let capturedType: string | null = null;
    let capturedMethod = "";
    server.use(
      http.post(`${BACKEND}/v1/tickets/t1/comentarios`, async ({ request }) => {
        capturedMethod = request.method;
        capturedType = request.headers.get("content-type");
        capturedBody = await request.json();
        return HttpResponse.json({ id: "c1" }, { status: 201 });
      }),
    );

    const req = new NextRequest("http://localhost/api/v1/tickets/t1/comentarios", {
      method: "POST",
      headers: { "x-api-key": "sop_abc123", "content-type": "application/json" },
      body: JSON.stringify({ texto: "hola" }),
    });
    const res = await POST(req, params(["tickets", "t1", "comentarios"]));

    expect(res.status).toBe(201);
    expect(capturedMethod).toBe("POST");
    expect(capturedType).toBe("application/json");
    expect(capturedBody).toEqual({ texto: "hola" });
    expect(await res.json()).toEqual({ id: "c1" });
  });

  it("429: propaga status, cuerpo, retry-after y los x-ratelimit-* del throttler (CA6)", async () => {
    server.use(
      http.get(`${BACKEND}/v1/tickets`, () =>
        HttpResponse.json(
          { statusCode: 429, message: "ThrottlerException: Too Many Requests" },
          {
            status: 429,
            headers: {
              "retry-after": "42",
              "x-ratelimit-limit": "60",
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "42",
            },
          },
        ),
      ),
    );

    const req = new NextRequest("http://localhost/api/v1/tickets", {
      headers: { "x-api-key": "sop_abc123" },
    });
    const res = await GET(req, params(["tickets"]));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(res.headers.get("x-ratelimit-limit")).toBe("60");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(res.headers.get("x-ratelimit-reset")).toBe("42");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ statusCode: 429, message: "ThrottlerException: Too Many Requests" });
  });

  it("nunca propaga set-cookie ni otros headers fuera de la allowlist", async () => {
    server.use(
      http.get(`${BACKEND}/v1/tickets`, () =>
        HttpResponse.json(
          { items: [] },
          { headers: { "set-cookie": "at=robada; Path=/", "x-powered-by": "Express" } },
        ),
      ),
    );

    const req = new NextRequest("http://localhost/api/v1/tickets", {
      headers: { "x-api-key": "sop_abc123" },
    });
    const res = await GET(req, params(["tickets"]));

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("GET openapi.json: pasa sin clave y devuelve el documento", async () => {
    server.use(
      http.get(`${BACKEND}/v1/openapi.json`, () => HttpResponse.json({ openapi: "3.0.0" })),
    );

    const res = await GET(new NextRequest("http://localhost/api/v1/openapi.json"), params(["openapi.json"]));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ openapi: "3.0.0" });
  });

  it("/api/v1 pelado: se reenvía a /v1 sin credenciales de sesión (no cae en el proxy genérico)", async () => {
    let capturedAuth: string | null | undefined;
    server.use(
      http.get(`${BACKEND}/v1`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return HttpResponse.json({ statusCode: 404, message: "Not Found" }, { status: 404 });
      }),
    );

    const req = new NextRequest("http://localhost/api/v1", { headers: { cookie: "at=token-de-sesion" } });
    const res = await GET(req, params(undefined));

    expect(res.status).toBe(404);
    expect(capturedAuth).toBeNull();
  });

  it.each([
    ["..", ["..", "clientes"]],
    [".", ["tickets", ".", "t1"]],
    ["vacío", ["tickets", "", "t1"]],
    ["%2F decodificado", ["../clientes"]],
    ["barra invertida", ["..\\clientes"]],
  ])("traversal (%s): responde 400 sin llegar al backend", async (_caso, path) => {
    let llamadas = 0;
    server.use(
      http.all(`${BACKEND}/*`, () => {
        llamadas++;
        return HttpResponse.json({});
      }),
    );

    const req = new NextRequest("http://localhost/api/v1/x", { headers: { "x-api-key": "sop_abc123" } });
    const res = await GET(req, params(path));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: "Ruta inválida" });
    expect(llamadas).toBe(0);
  });

  it("re-codifica cada segmento: caracteres especiales no abren segmentos ni query nuevos", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${BACKEND}/v1/tickets/:id`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({});
      }),
    );

    const req = new NextRequest("http://localhost/api/v1/tickets/x", { headers: { "x-api-key": "sop_abc123" } });
    const res = await GET(req, params(["tickets", "a?b#c"]));

    expect(res.status).toBe(200);
    expect(capturedUrl).toBe(`${BACKEND}/v1/tickets/a%3Fb%23c`);
  });

  it("backend caído: 502 con cuerpo JSON", async () => {
    server.use(http.get(`${BACKEND}/v1/tickets`, () => HttpResponse.error()));

    const req = new NextRequest("http://localhost/api/v1/tickets", { headers: { "x-api-key": "sop_abc123" } });
    const res = await GET(req, params(["tickets"]));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ statusCode: 502, message: "Backend no disponible" });
  });

  it("204: responde sin cuerpo", async () => {
    server.use(http.post(`${BACKEND}/v1/tickets`, () => new HttpResponse(null, { status: 204 })));

    const req = new NextRequest("http://localhost/api/v1/tickets", {
      method: "POST",
      headers: { "x-api-key": "sop_abc123" },
    });
    const res = await POST(req, params(["tickets"]));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});
