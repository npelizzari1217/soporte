import { beforeEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../../test/msw/server";
import { NextRequest } from "next/server";
import { POST } from "./route";

const BACKEND = "http://testbackend/api";

function makeJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fakesig`;
}

function req(body: object): NextRequest {
  return new NextRequest("http://localhost/api/auth/login/continuar", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/login/continuar", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
  });

  it("con tokens → fija las cookies at/rt y devuelve { user } sin los tokens", async () => {
    const accessToken = makeJwt({ sub: "1", cliente_id: "c1", rol: "TECNICO" });
    server.use(
      http.post(`${BACKEND}/auth/login/continuar`, () =>
        HttpResponse.json({ accessToken, refreshToken: "rt-valor" }),
      ),
    );

    const res = await POST(req({ ticket: "tk", clienteId: "c1" }));

    const body = await res.json();
    expect(body.user).toMatchObject({ sub: "1" });
    expect(JSON.stringify(body)).not.toContain("rt-valor");
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((s) => s.startsWith("at="))).toContain(`at=${accessToken}`);
    expect(setCookies.find((s) => s.startsWith("rt="))).toContain("rt=rt-valor");
  });

  it("backend 401 → propaga el 401 sin cookies", async () => {
    server.use(
      http.post(`${BACKEND}/auth/login/continuar`, () =>
        HttpResponse.json({ statusCode: 401, message: "Ticket inválido" }, { status: 401 }),
      ),
    );

    const res = await POST(req({ ticket: "malo" }));

    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("sin cliente elegido → reenvía la selección con su ticket y sin cookies", async () => {
    server.use(
      http.post(`${BACKEND}/auth/login/continuar`, () =>
        HttpResponse.json({ needsClienteSelection: true, membresias: [], ticket: "tk2" }),
      ),
    );

    const res = await POST(req({ ticket: "tk" }));

    expect(await res.json()).toMatchObject({ needsClienteSelection: true, ticket: "tk2" });
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
