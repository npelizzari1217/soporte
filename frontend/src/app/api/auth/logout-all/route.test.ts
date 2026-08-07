import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: [R25] BFF logout-all route — proxyea y limpia cookies (todas las sesiones).

const BACKEND = "http://testbackend/api";

describe("POST /api/auth/logout-all", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("POST → calls backend with Authorization: Bearer <at>, clears both cookies, returns 200", async () => {
    let capturedAuthHeader: string | null = null;

    server.use(
      http.post(`${BACKEND}/auth/logout-all`, ({ request }) => {
        capturedAuthHeader = request.headers.get("authorization");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/logout-all", {
      method: "POST",
      headers: { cookie: "at=access_token_value; rt=refresh_token_value" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(capturedAuthHeader).toBe("Bearer access_token_value");

    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((s) => s.startsWith("at="))).toMatch(/Max-Age=0/i);
    expect(setCookies.find((s) => s.startsWith("rt="))).toMatch(/Max-Age=0/i);
  });

  it("backend unreachable → still clears both cookies", async () => {
    server.use(
      http.post(`${BACKEND}/auth/logout-all`, () => HttpResponse.error()),
    );

    const req = new NextRequest("http://localhost/api/auth/logout-all", {
      method: "POST",
      headers: { cookie: "at=access_token_value" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((s) => s.startsWith("at="))).toMatch(/Max-Age=0/i);
    expect(setCookies.find((s) => s.startsWith("rt="))).toMatch(/Max-Age=0/i);
  });
});
