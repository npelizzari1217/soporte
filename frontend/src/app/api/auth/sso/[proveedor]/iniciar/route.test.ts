import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { server } from "../../../../../../../test/msw/server";
import { GET } from "./route";

// Spec: SL9, SL10, SL14 — BFF `iniciar`: allowlist de slug, `siguiente` saneado, cookie `sso_st`.

const BACKEND = "http://testbackend/api";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=abc";

function pedir(proveedor: string, query = ""): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/auth/sso/${proveedor}/iniciar${query}`);
  return GET(req, { params: Promise.resolve({ proveedor }) });
}

describe("GET /api/auth/sso/[proveedor]/iniciar", () => {
  let cuerpoBackend: unknown;

  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
    cuerpoBackend = undefined;
    server.use(
      http.post(`${BACKEND}/auth/sso/:proveedor/iniciar`, async ({ request }) => {
        cuerpoBackend = await request.json();
        return HttpResponse.json({ authorizeUrl: AUTHORIZE_URL, bindingToken: "binding-1" });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("slug fuera de google|microsoft → sso-error sin llamar al backend", async () => {
    const res = await pedir("github");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/login?motivo=sso-error");
    expect(cuerpoBackend).toBeUndefined();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("éxito → 302 a authorizeUrl con sso_st httpOnly, Lax, Path=/, 600 s", async () => {
    const res = await pedir("google");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(AUTHORIZE_URL);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sso_st=binding-1");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=600");
    expect(cookie).not.toContain("__Host-");
  });

  it("en producción la cookie lleva __Host- y Secure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await pedir("microsoft");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-sso_st=binding-1");
    expect(cookie).toContain("Secure");
  });

  it("siguiente permitido se reenvía; uno externo se descarta", async () => {
    await pedir("google", "?siguiente=%2Fpedido-qr%3Fx%3D1");
    expect(cuerpoBackend).toEqual({ siguiente: "/pedido-qr?x=1" });

    await pedir("google", "?siguiente=https%3A%2F%2Fevil.example%2F");
    expect(cuerpoBackend).toEqual({ siguiente: "/" });
  });

  it("backend 404 → sso-error sin cookie", async () => {
    server.use(http.post(`${BACKEND}/auth/sso/:proveedor/iniciar`, () => new HttpResponse(null, { status: 404 })));
    const res = await pedir("google");
    expect(res.headers.get("location")).toBe("http://localhost/login?motivo=sso-error");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("error de red o respuesta con forma inválida → sso-error", async () => {
    server.use(http.post(`${BACKEND}/auth/sso/:proveedor/iniciar`, () => HttpResponse.error()));
    expect((await pedir("google")).headers.get("location")).toBe("http://localhost/login?motivo=sso-error");

    server.use(http.post(`${BACKEND}/auth/sso/:proveedor/iniciar`, () => HttpResponse.json({ authorizeUrl: AUTHORIZE_URL })));
    expect((await pedir("google")).headers.get("location")).toBe("http://localhost/login?motivo=sso-error");
  });
});
