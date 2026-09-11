import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: [R28] Switcher — POST /api/auth/switch, actualiza SOLO la cookie `at`
// (el switch NO rota el refresh — ADR-2/PR4). Fix #168: SÍ reenvía la cookie
// `rt` cruda al backend, para que este mantenga al día el scope del refresh
// vigente sin rotarlo.

const BACKEND = "http://testbackend/api";

const newPayload = {
  sub: "1",
  cliente_id: "c2",
  rol: "USUARIO",
  permisos: ["ticket:crear"],
  is_global_admin: false,
  cliente_nombre: "Cliente Dos",
  membresias: [
    { cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" },
    { cliente_id: "c2", nombre: "Cliente Dos", rol: "USUARIO" },
  ],
};

function makeJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fakesig`;
}

describe("POST /api/auth/switch", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("valid at + rt + clienteId → forwards Bearer <at> and { clienteId, refreshToken }, sets ONLY the at cookie, returns { user }", async () => {
    const newAccessToken = makeJwt(newPayload);
    let capturedAuthHeader: string | null = null;
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BACKEND}/auth/switch`, async ({ request }) => {
        capturedAuthHeader = request.headers.get("authorization");
        capturedBody = await request.json();
        return HttpResponse.json({ accessToken: newAccessToken });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/switch", {
      method: "POST",
      headers: { cookie: "at=old_access_token; rt=refresh_token_value", "content-type": "application/json" },
      body: JSON.stringify({ clienteId: "c2" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(capturedAuthHeader).toBe("Bearer old_access_token");
    // fix #168: reenvía la rt cruda como refreshToken, para que el backend
    // mantenga al día el scope del refresh sin rotarlo.
    expect(capturedBody).toEqual({ clienteId: "c2", refreshToken: "refresh_token_value" });

    const body = await res.json();
    expect(body.user).toMatchObject(newPayload);

    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    const atCookieStr = setCookies[0];
    expect(atCookieStr).toContain(`at=${newAccessToken}`);
    expect(atCookieStr).toMatch(/HttpOnly/i);
    expect(atCookieStr).toMatch(/Max-Age=900/i);
    // rt must NOT be touched by switch (no se rota, solo se reenvía)
    expect(setCookies.find((s) => s.startsWith("rt="))).toBeUndefined();
  });

  it("valid at SIN rt → forwards { clienteId } sin refreshToken (compat: nada que reenviar)", async () => {
    const newAccessToken = makeJwt(newPayload);
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BACKEND}/auth/switch`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ accessToken: newAccessToken });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/switch", {
      method: "POST",
      headers: { cookie: "at=old_access_token", "content-type": "application/json" },
      body: JSON.stringify({ clienteId: "c2" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ clienteId: "c2" });
  });

  /**
   * EL CAMINO QUE EL SPREAD DEJABA ABIERTO, y que ningún test ejercitaba.
   *
   * El body salía como `{ ...body, ...(rt ? { refreshToken: rt } : {}) }`.
   * Con la cookie presente, el overlay pisa lo que venga y todo bien. Pero
   * SIN cookie el overlay no corre, y un `refreshToken` puesto por el
   * llamador en el JSON viajaba al backend tal cual — mientras el docstring
   * afirmaba que ese campo solo puede salir de la cookie httpOnly.
   *
   * Los dos tests de abajo son gemelos sobre la misma frontera: sin cookie
   * el campo del cliente se descarta, y con cookie gana la cookie. El primero
   * es el que se pone rojo si alguien vuelve al spread directo.
   */
  it("SIN rt pero con refreshToken en el body → lo DESCARTA, no lo reenvía", async () => {
    const newAccessToken = makeJwt(newPayload);
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BACKEND}/auth/switch`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ accessToken: newAccessToken });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/switch", {
      method: "POST",
      headers: { cookie: "at=old_access_token", "content-type": "application/json" },
      body: JSON.stringify({ clienteId: "c2", refreshToken: "token-puesto-por-el-cliente" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ clienteId: "c2" });
  });

  it("CON rt y con refreshToken en el body → gana el de la cookie", async () => {
    const newAccessToken = makeJwt(newPayload);
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BACKEND}/auth/switch`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ accessToken: newAccessToken });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/switch", {
      method: "POST",
      headers: {
        cookie: "at=old_access_token; rt=el_de_la_cookie",
        "content-type": "application/json",
      },
      body: JSON.stringify({ clienteId: "c2", refreshToken: "token-puesto-por-el-cliente" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ clienteId: "c2", refreshToken: "el_de_la_cookie" });
  });

  it("no at cookie → 401 immediately, does NOT call the backend", async () => {
    let backendWasCalled = false;
    server.use(
      http.post(`${BACKEND}/auth/switch`, () => {
        backendWasCalled = true;
        return HttpResponse.json({ accessToken: "x" });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clienteId: "c2" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(backendWasCalled).toBe(false);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("backend 403 (sin membresía en ese cliente) → propagates 403, no cookies changed", async () => {
    server.use(
      http.post(`${BACKEND}/auth/switch`, () =>
        HttpResponse.json({ statusCode: 403, message: "Cliente no autorizado" }, { status: 403 }),
      ),
    );

    const req = new NextRequest("http://localhost/api/auth/switch", {
      method: "POST",
      headers: { cookie: "at=old_access_token", "content-type": "application/json" },
      body: JSON.stringify({ clienteId: "c3" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
