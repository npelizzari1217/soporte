import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { server } from "../../../../../../../test/msw/server";
import { GET } from "./route";

// Spec: SL10, SL13, SL14 — BFF `callback`: cookie `sso_st` de un solo uso, `td` solo por cookie,
// resultado en `sso_paso` y mensaje de falla único.

const BACKEND = "http://testbackend/api";
const ERROR = "http://localhost/login?motivo=sso-error";

interface Cuerpo {
  code: string;
  state: string;
  binding: string;
  dispositivoConfiable?: string;
}

function pedir(query: string, cookies = "sso_st=binding-1", cabeceras: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost/api/auth/sso/google/callback${query}`, {
    headers: { ...(cookies ? { cookie: cookies } : {}), ...cabeceras },
  });
  return GET(req, { params: Promise.resolve({ proveedor: "google" }) });
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

function cookie(res: Response, nombre: string): string {
  return setCookies(res).find((c) => c.startsWith(`${nombre}=`)) ?? "";
}

describe("GET /api/auth/sso/[proveedor]/callback", () => {
  let cuerpo: Cuerpo | undefined;
  let cabeceras: Headers | undefined;

  function backendResponde(respuesta: () => Response) {
    server.use(
      http.post<never, Cuerpo>(`${BACKEND}/auth/sso/:proveedor/callback`, async ({ request }) => {
        cuerpo = await request.json();
        cabeceras = request.headers;
        return respuesta();
      }),
    );
  }

  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
    cuerpo = undefined;
    cabeceras = undefined;
    backendResponde(() => HttpResponse.json({ kind: "needs2fa", desafio: "des-1", siguiente: null }));
  });

  it("error=access_denied → /login sin mensaje, sin llamar al backend y borrando sso_st", async () => {
    const res = await pedir("?error=access_denied&state=s");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(cuerpo).toBeUndefined();
    expect(cookie(res, "sso_st")).toContain("Max-Age=0");
  });

  it.each([
    ["otro error", "?error=server_error&code=c&state=s", "sso_st=b"],
    ["sin code", "?state=s", "sso_st=b"],
    ["sin state", "?code=c", "sso_st=b"],
    ["sin cookie sso_st", "?code=c&state=s", ""],
  ])("%s → sso-error sin llamar al backend", async (_n, query, cookies) => {
    const res = await pedir(query, cookies);
    expect(res.headers.get("location")).toBe(ERROR);
    expect(cuerpo).toBeUndefined();
    expect(cookie(res, "sso_st")).toContain("Max-Age=0");
    expect(cookie(res, "sso_paso")).toBe("");
  });

  it("backend 401, 500, red o forma inválida → sso-error idéntico y sso_st borrada", async () => {
    for (const respuesta of [
      () => new HttpResponse(null, { status: 401 }),
      () => new HttpResponse(null, { status: 500 }),
      () => HttpResponse.error(),
      () => HttpResponse.json({ kind: "ticket" }),
    ]) {
      server.use(http.post(`${BACKEND}/auth/sso/:proveedor/callback`, respuesta));
      const res = await pedir("?code=c&state=s");
      expect(res.headers.get("location")).toBe(ERROR);
      expect(cookie(res, "sso_st")).toContain("Max-Age=0");
      expect(cookie(res, "sso_paso")).toBe("");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("envía code, state y binding (de sso_st), con la IP del navegador", async () => {
    await pedir("?code=c1&state=s1", "sso_st=binding-9", { "x-forwarded-for": "9.9.9.9, 1.2.3.4" });
    expect(cuerpo).toEqual({ code: "c1", state: "s1", binding: "binding-9" });
    expect(cabeceras?.get("x-soporte-ip-navegador")).toBe("1.2.3.4");
  });

  it("dispositivoConfiable de la URL se ignora; se usa solo el de la cookie td", async () => {
    await pedir("?code=c&state=s&dispositivoConfiable=url-malo");
    expect(cuerpo?.dispositivoConfiable).toBeUndefined();

    await pedir("?code=c&state=s&dispositivoConfiable=url-malo", "sso_st=b; td=cookie-td");
    expect(cuerpo?.dispositivoConfiable).toBe("cookie-td");
  });

  it("segundo paso → sso_paso {k,t} httpOnly de 120 s y 302 a /login?sso=1 con cabeceras", async () => {
    const res = await pedir("?code=c&state=s");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/login?sso=1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const paso = cookie(res, "sso_paso");
    expect(decodeURIComponent(paso)).toContain('sso_paso={"k":"2fa","t":"des-1"}');
    expect(paso).toContain("HttpOnly");
    expect(paso).toContain("Max-Age=120");
    expect(paso).toContain("Path=/");
    expect(cookie(res, "sso_st")).toContain("Max-Age=0");
    expect(cookie(res, "td")).toBe("");
  });

  it("enrolamiento y ticket mapean a enrol y ticket; el ticket renovado re-fija td", async () => {
    backendResponde(() => HttpResponse.json({ kind: "needsEnrolamiento2fa", desafio: "des-2", siguiente: null }));
    const enrol = await pedir("?code=c&state=s");
    expect(decodeURIComponent(cookie(enrol, "sso_paso"))).toContain('{"k":"enrol","t":"des-2"}');

    backendResponde(() =>
      HttpResponse.json({ kind: "ticket", ticket: "tk-1", dispositivoConfiable: "td-nuevo", siguiente: null }),
    );
    const ticket = await pedir("?code=c&state=s");
    const paso = decodeURIComponent(cookie(ticket, "sso_paso"));
    expect(paso).toContain('{"k":"ticket","t":"tk-1"}');
    expect(paso).not.toContain("td-nuevo");
    expect(cookie(ticket, "td")).toContain("td=td-nuevo");
    expect(cookie(ticket, "td")).toContain("Max-Age=2592000");
    expect(cookie(ticket, "td")).toContain("HttpOnly");
  });

  it("siguiente se vuelve a sanear: permitido viaja, externo se omite", async () => {
    backendResponde(() =>
      HttpResponse.json({ kind: "needs2fa", desafio: "d", siguiente: "/pedido-qr?x=1" }),
    );
    const ok = await pedir("?code=c&state=s");
    expect(ok.headers.get("location")).toBe("http://localhost/login?sso=1&siguiente=%2Fpedido-qr%3Fx%3D1");

    backendResponde(() =>
      HttpResponse.json({ kind: "needs2fa", desafio: "d", siguiente: "https://evil.example/" }),
    );
    const malo = await pedir("?code=c&state=s");
    expect(malo.headers.get("location")).toBe("http://localhost/login?sso=1");
  });
});
