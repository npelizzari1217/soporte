import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: [SPEC:frontend-auth/login-exitoso], [SPEC:frontend-auth/creds-invalidas]
// Spec: [SPEC:frontend-auth/usuario-inactivo], [SPEC:frontend-auth/tenant-inactivo]

const BACKEND = "http://testbackend";

/** Create a minimal JWT with a base64url-encoded JSON payload (no real signature). */
function makeJwt(payload: object): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fakesig`;
}

const testPayload = {
  sub: "1",
  email: "test@example.com",
  roles: ["ADMIN"],
  permisos: ["ticket:crear"],
  cliente_id: "c1",
};

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  // ─── Happy path ─────────────────────────────────────────────────────────────

  it("valid credentials → sets at cookie (httpOnly, SameSite=Lax, Max-Age=900) and rt cookie (Max-Age=604800), returns { user }", async () => {
    const accessToken = makeJwt(testPayload);
    const refreshToken = "refresh_token_value";

    server.use(
      http.post(`${BACKEND}/api/auth/login`, () =>
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

    // Verify Set-Cookie headers for at and rt
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);

    const atCookieStr = setCookies.find((s) => s.startsWith("at="));
    expect(atCookieStr).toBeDefined();
    expect(atCookieStr).toContain(`at=${accessToken}`);
    expect(atCookieStr).toMatch(/HttpOnly/i);
    expect(atCookieStr).toMatch(/SameSite=Lax/i);
    expect(atCookieStr).toMatch(/Max-Age=900/i);
    expect(atCookieStr).toMatch(/Path=\//i);

    const rtCookieStr = setCookies.find((s) => s.startsWith("rt="));
    expect(rtCookieStr).toBeDefined();
    expect(rtCookieStr).toContain(`rt=${refreshToken}`);
    expect(rtCookieStr).toMatch(/HttpOnly/i);
    expect(rtCookieStr).toMatch(/SameSite=Lax/i);
    expect(rtCookieStr).toMatch(/Max-Age=604800/i);
    expect(rtCookieStr).toMatch(/Path=\//i);
  });

  // ─── Error propagation ───────────────────────────────────────────────────────

  it("backend 401 → propagates 401, no Set-Cookie headers", async () => {
    server.use(
      http.post(`${BACKEND}/api/auth/login`, () =>
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
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(0);
  });

  it("backend 403 → propagates 403, no Set-Cookie headers", async () => {
    server.use(
      http.post(`${BACKEND}/api/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 403, message: "Tenant inactivo" },
          { status: 403 },
        ),
      ),
    );

    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@inactive.com", password: "password" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(0);
  });
});
