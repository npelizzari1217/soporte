import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: [R25] BFF logout route — proxyea y limpia cookies (sesión actual).

const BACKEND = "http://testbackend/api";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("POST → calls backend with Authorization: Bearer <at> and { refreshToken }, clears both cookies, returns 200", async () => {
    let capturedBody: unknown = null;
    let capturedAuthHeader: string | null = null;

    server.use(
      http.post(`${BACKEND}/auth/logout`, async ({ request }) => {
        capturedBody = await request.json();
        capturedAuthHeader = request.headers.get("authorization");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "at=access_token_value; rt=refresh_token_value" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(capturedAuthHeader).toBe("Bearer access_token_value");
    expect(capturedBody).toMatchObject({ refreshToken: "refresh_token_value" });

    const setCookies = res.headers.getSetCookie();
    const atCookieStr = setCookies.find((s) => s.startsWith("at="));
    const rtCookieStr = setCookies.find((s) => s.startsWith("rt="));
    expect(atCookieStr).toMatch(/Max-Age=0/i);
    expect(rtCookieStr).toMatch(/Max-Age=0/i);
  });

  it("expired/absent at cookie → still clears both cookies (logout always clears)", async () => {
    server.use(
      http.post(`${BACKEND}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );

    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "rt=refresh_token_value" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((s) => s.startsWith("at="))).toMatch(/Max-Age=0/i);
    expect(setCookies.find((s) => s.startsWith("rt="))).toMatch(/Max-Age=0/i);
  });

  it("backend unreachable → still clears both cookies (never leaves a stuck session)", async () => {
    server.use(
      http.post(`${BACKEND}/auth/logout`, () => HttpResponse.error()),
    );

    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "at=access_token_value; rt=refresh_token_value" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((s) => s.startsWith("at="))).toMatch(/Max-Age=0/i);
    expect(setCookies.find((s) => s.startsWith("rt="))).toMatch(/Max-Age=0/i);
  });
});
