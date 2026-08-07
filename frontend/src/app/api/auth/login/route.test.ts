import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: [R23] BFF login route — proxy al backend; en éxito setear cookies
// httpOnly at/rt; si needsClienteSelection, reenviar SIN setear cookies.

const BACKEND = "http://testbackend/api";

const testPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: ["ticket:crear"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" }],
};

/** Minimal unsigned JWT with a base64url-encoded JSON payload (decoding only, no verify). */
function makeJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fakesig`;
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("valid credentials → sets at cookie (httpOnly, SameSite=Lax, Max-Age=900) and rt cookie (Max-Age=604800), returns { user }", async () => {
    const accessToken = makeJwt(testPayload);
    const refreshToken = "refresh_token_value";

    server.use(
      http.post(`${BACKEND}/auth/login`, () =>
        HttpResponse.json({ accessToken, refreshToken }),
      ),
    );

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject(testPayload);

    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);

    const atCookieStr = setCookies.find((s) => s.startsWith("at="));
    expect(atCookieStr).toContain(`at=${accessToken}`);
    expect(atCookieStr).toMatch(/HttpOnly/i);
    expect(atCookieStr).toMatch(/SameSite=Lax/i);
    expect(atCookieStr).toMatch(/Max-Age=900/i);

    const rtCookieStr = setCookies.find((s) => s.startsWith("rt="));
    expect(rtCookieStr).toContain(`rt=${refreshToken}`);
    expect(rtCookieStr).toMatch(/Max-Age=604800/i);
  });

  it("needsClienteSelection (multi-membresía) → passes through membresias[], sets NO cookies", async () => {
    server.use(
      http.post(`${BACKEND}/auth/login`, () =>
        HttpResponse.json({
          needsClienteSelection: true,
          membresias: [
            { cliente_id: "c1", nombre: "Cliente Uno", rol: "TECNICO" },
            { cliente_id: "c2", nombre: "Cliente Dos", rol: "USUARIO" },
          ],
        }),
      ),
    );

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "multi@example.com", password: "password123" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.needsClienteSelection).toBe(true);
    expect(body.membresias).toHaveLength(2);

    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("backend 401 (credenciales inválidas) → propagates 401, no Set-Cookie headers", async () => {
    server.use(
      http.post(`${BACKEND}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 401, message: "Credenciales inválidas" },
          { status: 401 },
        ),
      ),
    );

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "wrong@example.com", password: "bad" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
