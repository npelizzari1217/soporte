import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: [SPEC:frontend-auth/logout-all]

const BACKEND = "http://testbackend";

describe("POST /api/auth/logout-all", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("POST → calls backend with Authorization: Bearer <at>, clears both cookies, returns 200", async () => {
    let capturedAuthHeader: string | null = null;

    server.use(
      http.post(`${BACKEND}/api/auth/logout-all`, ({ request }) => {
        capturedAuthHeader = request.headers.get("authorization");
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const req = new NextRequest("http://localhost/api/auth/logout-all", {
      method: "POST",
      headers: { cookie: "at=access_token_value; rt=refresh_token_value" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(capturedAuthHeader).toBe("Bearer access_token_value");

    // Both cookies must be cleared
    const setCookies = res.headers.getSetCookie();
    const atCookieStr = setCookies.find((s) => s.startsWith("at="));
    const rtCookieStr = setCookies.find((s) => s.startsWith("rt="));
    expect(atCookieStr).toMatch(/Max-Age=0/i);
    expect(rtCookieStr).toMatch(/Max-Age=0/i);
  });
});
