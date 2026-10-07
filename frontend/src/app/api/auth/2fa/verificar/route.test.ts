import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

const BACKEND = "http://testbackend/api";

function req(body: object): NextRequest {
  return new NextRequest("http://localhost/api/auth/2fa/verificar", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/2fa/verificar", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("dispositivoConfiable → cookie td httpOnly de 30 días y NO sale en el body", async () => {
    server.use(
      http.post(`${BACKEND}/auth/2fa/verificar`, () =>
        HttpResponse.json({ ticket: "tk", dispositivoConfiable: "tok-dispositivo" }),
      ),
    );

    const res = await POST(req({ desafio: "d", codigo: "123456", recordar: true }));

    expect(await res.json()).toEqual({ ticket: "tk" });
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("td=tok-dispositivo");
    expect(setCookies[0]).toMatch(/HttpOnly/i);
    expect(setCookies[0]).toMatch(/SameSite=Lax/i);
    expect(setCookies[0]).toMatch(/Max-Age=2592000/i);
  });

  it("backend 2xx con cuerpo vacío → responde 200 sin cookies, nunca 500", async () => {
    server.use(
      http.post(`${BACKEND}/auth/2fa/verificar`, () => new HttpResponse(null, { status: 200 })),
    );

    const res = await POST(req({ desafio: "d", codigo: "123456" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("sin dispositivoConfiable → devuelve el ticket y no setea cookies", async () => {
    server.use(
      http.post(`${BACKEND}/auth/2fa/verificar`, () => HttpResponse.json({ ticket: "tk" })),
    );

    const res = await POST(req({ desafio: "d", codigo: "123456" }));

    expect(await res.json()).toEqual({ ticket: "tk" });
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("backend 401 → propaga el 401 sin cookies", async () => {
    server.use(
      http.post(`${BACKEND}/auth/2fa/verificar`, () =>
        HttpResponse.json({ statusCode: 401, message: "Código inválido" }, { status: 401 }),
      ),
    );

    const res = await POST(req({ desafio: "d", codigo: "000000" }));

    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
