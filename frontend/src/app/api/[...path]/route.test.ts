import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { NextRequest } from "next/server";
import { GET, POST, PATCH, DELETE } from "./route";

/**
 * Generic BFF proxy — `/api/{...path}` forwards authenticated requests to
 * `BACKEND_URL/{path}`, injecting `Authorization: Bearer <at>` from the
 * httpOnly `at` cookie server-side (browser never sees the token).
 *
 * NOT explicitly listed in tasks.md — added as a prerequisite for B1: every
 * feature hook calls `apiFetch('tickets')` etc. expecting `/api/tickets` to
 * exist and reach the real backend (ADR-2), but only `/api/auth/*` BFF
 * routes existed before this batch. Deviation documented in apply-progress.
 */
const BACKEND = "http://testbackend/api";

describe("/api/[...path] generic BFF proxy", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("GET: forwards Authorization bearer from the `at` cookie and preserves the query string", async () => {
    let capturedAuth: string | null = null;
    let capturedUrl = "";
    server.use(
      http.get(`${BACKEND}/tickets`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        capturedUrl = request.url;
        return HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 10 });
      }),
    );

    const req = new NextRequest("http://localhost/api/tickets?estado=abc&pagina=2", {
      headers: { cookie: "at=token123" },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["tickets"] }) });

    expect(res.status).toBe(200);
    expect(capturedAuth).toBe("Bearer token123");
    expect(capturedUrl).toContain("estado=abc");
    expect(capturedUrl).toContain("pagina=2");
  });

  it("GET: no `at` cookie → forwards without an Authorization header (backend is the real gate, returns its own 401)", async () => {
    let capturedAuth: string | null | undefined;
    server.use(
      http.get(`${BACKEND}/tickets`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const req = new NextRequest("http://localhost/api/tickets");
    const res = await GET(req, { params: Promise.resolve({ path: ["tickets"] }) });

    expect(capturedAuth).toBeNull();
    expect(res.status).toBe(401);
  });

  it("GET: forwards x-forwarded-for for the publico/ prefix (CSAT throttler discriminator, ADR-C6)", async () => {
    let capturedXff: string | null = null;
    server.use(
      http.get(`${BACKEND}/publico/encuesta/tok123`, ({ request }) => {
        capturedXff = request.headers.get("x-forwarded-for");
        return HttpResponse.json({ numero: "TCK-000123" });
      }),
    );

    const req = new NextRequest("http://localhost/api/publico/encuesta/tok123", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    const res = await GET(req, {
      params: Promise.resolve({ path: ["publico", "encuesta", "tok123"] }),
    });

    expect(res.status).toBe(200);
    expect(capturedXff).toBe("203.0.113.5");
  });

  it("GET: does NOT forward x-forwarded-for outside the publico/ prefix (scope must stay narrow)", async () => {
    let capturedXff: string | null | undefined;
    server.use(
      http.get(`${BACKEND}/tickets`, ({ request }) => {
        capturedXff = request.headers.get("x-forwarded-for");
        return HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 10 });
      }),
    );

    const req = new NextRequest("http://localhost/api/tickets", {
      headers: { cookie: "at=token123", "x-forwarded-for": "203.0.113.5" },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["tickets"] }) });

    expect(res.status).toBe(200);
    expect(capturedXff).toBeNull();
  });

  it("POST: forwards JSON body + joins multi-segment paths (nested resource routes)", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`${BACKEND}/tickets/abc-123/comentarios`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "op-1" }, { status: 201 });
      }),
    );

    const req = new NextRequest("http://localhost/api/tickets/abc-123/comentarios", {
      method: "POST",
      headers: { cookie: "at=token123", "content-type": "application/json" },
      body: JSON.stringify({ texto: "hola", esInterno: true }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ path: ["tickets", "abc-123", "comentarios"] }),
    });

    expect(res.status).toBe(201);
    expect(capturedBody).toEqual({ texto: "hola", esInterno: true });
  });

  it("PATCH: propagates backend error status + NestJS error body verbatim (apiFetch normalize() depends on this shape)", async () => {
    server.use(
      http.patch(`${BACKEND}/tickets/abc-123/estado`, () =>
        HttpResponse.json({ statusCode: 422, message: "Transición inválida" }, { status: 422 }),
      ),
    );

    const req = new NextRequest("http://localhost/api/tickets/abc-123/estado", {
      method: "PATCH",
      headers: { cookie: "at=token123", "content-type": "application/json" },
      body: JSON.stringify({ nuevoEstadoCodigo: "CERRADO" }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ path: ["tickets", "abc-123", "estado"] }),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ statusCode: 422, message: "Transición inválida" });
  });

  it("DELETE: backend 204 No Content → proxy returns 204 without attempting a JSON parse", async () => {
    server.use(
      http.delete(`${BACKEND}/usuarios/u1/membresia`, () => new HttpResponse(null, { status: 204 })),
    );

    const req = new NextRequest("http://localhost/api/usuarios/u1/membresia", {
      method: "DELETE",
      headers: { cookie: "at=token123" },
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ path: ["usuarios", "u1", "membresia"] }),
    });

    expect(res.status).toBe(204);
  });

  it("GET: respuesta binaria (PNG) atraviesa el proxy byte a byte, sin corromperse (sdd/logo-por-cliente, WU3)", async () => {
    // Bytes deliberadamente inválidos como UTF-8 (firma PNG + JPEG + 0xFF/0xFE
    // sueltos): si el proxy decodifica con `text()` y re-serializa, estos
    // bytes cambian. `arrayBuffer()` los preserva exactos.
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xfe, 0x80,
    ]);
    server.use(
      http.get(`${BACKEND}/clientes/c1/logo`, () =>
        new HttpResponse(pngBytes, {
          headers: {
            "content-type": "image/png",
            "x-content-type-options": "nosniff",
            "cache-control": "no-store",
          },
        }),
      ),
    );

    const req = new NextRequest("http://localhost/api/clientes/c1/logo?v=123", {
      headers: { cookie: "at=token123" },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["clientes", "c1", "logo"] }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytesRecibidos = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytesRecibidos)).toEqual(Array.from(pngBytes));
  });

  it("GET: descarga CSV → propaga el cuerpo Y el Content-Disposition (el front saca el nombre de ahí)", async () => {
    server.use(
      http.get(
        `${BACKEND}/compras/export`,
        () =>
          new HttpResponse("numero,motivo\nCOM-1,Insumos\n", {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": 'attachment; filename="compras-2026-08-19.csv"',
            },
          }),
      ),
    );

    const req = new NextRequest("http://localhost/api/compras/export?estado=TODAS", {
      headers: { cookie: "at=token123" },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["compras", "export"] }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="compras-2026-08-19.csv"',
    );
    expect(await res.text()).toContain("COM-1,Insumos");
  });
});
