import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: [R24] BFF refresh route — lee rt, proxyea, rota AMBAS cookies en éxito,
// limpia ambas en 401.
//
// DESVIACIÓN vs redacción original de T10.4 ("decodifica at expirado para
// pista clienteId"): esa pista era ADR-2, REEMPLAZADO por Opción B (decisión
// #2025) — `refresh_tokens.cliente_id` ya viaja persistido en el backend, el
// BFF no necesita derivar ni enviar ningún hint. Confirmado en el contrato
// real: `RefreshRequestDto` (`backend/src/auth/interface/dtos/auth.dto.ts`)
// solo acepta `{ refreshToken }`.

const BACKEND = "http://testbackend/api";

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("valid rt cookie → sends { refreshToken } (no clienteId hint) and rotates both cookies", async () => {
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BACKEND}/auth/refresh`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          accessToken: "new_access_token",
          refreshToken: "new_refresh_token",
        });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "rt=old_refresh_token; at=old_access_token" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ refreshToken: "old_refresh_token" });

    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);

    const atCookieStr = setCookies.find((s) => s.startsWith("at="));
    expect(atCookieStr).toContain("at=new_access_token");
    expect(atCookieStr).toMatch(/HttpOnly/i);
    expect(atCookieStr).toMatch(/Max-Age=900/i);

    const rtCookieStr = setCookies.find((s) => s.startsWith("rt="));
    expect(rtCookieStr).toContain("rt=new_refresh_token");
    expect(rtCookieStr).toMatch(/Max-Age=604800/i);
  });

  it("backend 401 (revoked/expired rt) → clears both cookies (maxAge=0) + returns 401", async () => {
    server.use(
      http.post(`${BACKEND}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    );

    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "rt=expired_token" },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);

    const setCookies = res.headers.getSetCookie();
    const atCookieStr = setCookies.find((s) => s.startsWith("at="));
    const rtCookieStr = setCookies.find((s) => s.startsWith("rt="));
    expect(atCookieStr).toMatch(/Max-Age=0/i);
    expect(rtCookieStr).toMatch(/Max-Age=0/i);
  });

  it("no rt cookie at all → 401 immediately, clears both cookies, does NOT call the backend", async () => {
    let backendWasCalled = false;
    server.use(
      http.post(`${BACKEND}/auth/refresh`, () => {
        backendWasCalled = true;
        return HttpResponse.json({ accessToken: "x", refreshToken: "y" });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(backendWasCalled).toBe(false);

    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((s) => s.startsWith("at="))).toMatch(/Max-Age=0/i);
    expect(setCookies.find((s) => s.startsWith("rt="))).toMatch(/Max-Age=0/i);
  });
});
