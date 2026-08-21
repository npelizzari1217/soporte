import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Spec: sdd/cambio-de-contrasena — WU3, BFF proxy transparente. Limpia
// cookies SOLO ante 204; cualquier otro status vuelve verbatim con las
// cookies intactas (reconciliación #2409 punto 4).

const BACKEND = "http://testbackend/api";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: {
      cookie: "at=access_token_value; rt=refresh_token_value",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("204 del backend → reenvía con Authorization: Bearer <at>, devuelve 204 y limpia AMBAS cookies", async () => {
    let capturedAuthHeader: string | null = null;
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BACKEND}/auth/change-password`, async ({ request }) => {
        capturedAuthHeader = request.headers.get("authorization");
        capturedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const req = makeRequest({ passwordActual: "actual123", passwordNueva: "nueva1234" });
    const res = await POST(req);

    expect(res.status).toBe(204);
    expect(capturedAuthHeader).toBe("Bearer access_token_value");
    expect(capturedBody).toEqual({ passwordActual: "actual123", passwordNueva: "nueva1234" });

    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((s) => s.startsWith("at="))).toMatch(/Max-Age=0/i);
    expect(setCookies.find((s) => s.startsWith("rt="))).toMatch(/Max-Age=0/i);
  });

  it("422 (contraseña actual incorrecta) → propaga status y body TAL CUAL, NO toca las cookies", async () => {
    const backendBody = {
      statusCode: 422,
      message: "La contraseña actual no es correcta",
      error: "AUTH_PASSWORD_ACTUAL_INCORRECTA",
    };

    server.use(
      http.post(`${BACKEND}/auth/change-password`, () =>
        HttpResponse.json(backendBody, { status: 422 }),
      ),
    );

    const req = makeRequest({ passwordActual: "incorrecta", passwordNueva: "nueva1234" });
    const res = await POST(req);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual(backendBody);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("403 (usuario no disponible) → propaga status y body, cookies intactas", async () => {
    const backendBody = { statusCode: 403, message: "Forbidden" };

    server.use(
      http.post(`${BACKEND}/auth/change-password`, () =>
        HttpResponse.json(backendBody, { status: 403 }),
      ),
    );

    const req = makeRequest({ passwordActual: "actual123", passwordNueva: "nueva1234" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(backendBody);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("400 del ValidationPipe (passwordNueva corta) → propaga status y body, cookies intactas", async () => {
    const backendBody = { statusCode: 400, message: ["passwordNueva must be longer than 8"] };

    server.use(
      http.post(`${BACKEND}/auth/change-password`, () =>
        HttpResponse.json(backendBody, { status: 400 }),
      ),
    );

    const req = makeRequest({ passwordActual: "actual123", passwordNueva: "corta" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(backendBody);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("backend inalcanzable → 502, sin tocar cookies (no es un 204, no hay certeza del cambio)", async () => {
    server.use(
      http.post(`${BACKEND}/auth/change-password`, () => HttpResponse.error()),
    );

    const req = makeRequest({ passwordActual: "actual123", passwordNueva: "nueva1234" });
    const res = await POST(req);

    expect(res.status).toBe(502);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("body que no es JSON → 400 explícito, sin explotar y sin tocar las cookies", async () => {
    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: "at=access_token_value; rt=refresh_token_value",
        "content-type": "application/json",
      },
      body: "esto no es json",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
