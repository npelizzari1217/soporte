import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: [SPEC:frontend-auth/login-exitoso] — refresh rotates cookies

const BACKEND = "http://testbackend";

function makeJwt(payload: object): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fakesig`;
}

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  // ─── Token rotation ──────────────────────────────────────────────────────────

  it("valid rt cookie → rotates both cookies with new tokens", async () => {
    const newAccessToken = makeJwt({
      sub: "1",
      email: "test@example.com",
      roles: [],
      permisos: [],
      cliente_id: "c1",
    });
    const newRefreshToken = "new_refresh_token";

    server.use(
      http.post(`${BACKEND}/api/auth/refresh`, () =>
        HttpResponse.json({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        }),
      ),
    );

    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "rt=old_refresh_token; at=old_access_token" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);

    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);

    const atCookieStr = setCookies.find((s) => s.startsWith("at="));
    expect(atCookieStr).toBeDefined();
    expect(atCookieStr).toContain(`at=${newAccessToken}`);
    expect(atCookieStr).toMatch(/HttpOnly/i);
    expect(atCookieStr).toMatch(/Max-Age=900/i);

    const rtCookieStr = setCookies.find((s) => s.startsWith("rt="));
    expect(rtCookieStr).toBeDefined();
    expect(rtCookieStr).toContain(`rt=${newRefreshToken}`);
    expect(rtCookieStr).toMatch(/HttpOnly/i);
    expect(rtCookieStr).toMatch(/Max-Age=604800/i);
  });

  // ─── Refresh failure → clear cookies ─────────────────────────────────────────

  it("backend 401 (revoked/expired rt) → clears both cookies (maxAge=0) + returns 401", async () => {
    server.use(
      http.post(`${BACKEND}/api/auth/refresh`, () =>
        new HttpResponse(null, { status: 401 }),
      ),
    );

    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "rt=expired_token" },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);

    const setCookies = res.headers.getSetCookie();
    // Both cookies must be cleared (maxAge=0)
    const atCookieStr = setCookies.find((s) => s.startsWith("at="));
    expect(atCookieStr).toBeDefined();
    expect(atCookieStr).toMatch(/Max-Age=0/i);

    const rtCookieStr = setCookies.find((s) => s.startsWith("rt="));
    expect(rtCookieStr).toBeDefined();
    expect(rtCookieStr).toMatch(/Max-Age=0/i);
  });
});
