// @vitest-environment node
// Motivo: los tokens se firman con jose, que en jsdom choca con el Uint8Array de otro realm
// (mismo criterio que verify.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { mintToken, type TestTokenPayload } from "../../../test/helpers/jwt";
import { permisosPorTipoDelServidor } from "./permisos-por-tipo-servidor";

const BACKEND = "http://testbackend/api";

let cookieAt: string | undefined;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (nombre: string) => (nombre === "at" && cookieAt !== undefined ? { value: cookieAt } : undefined),
  })),
}));

const TECNICO: TestTokenPayload = {
  sub: "u1",
  cliente_id: "c1",
  rol: "TECNICO",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
};

const RESPUESTA = {
  sinRestriccion: false,
  porTipo: { "tipo-soporte": ["LECTURA"] },
  porModulo: { TICKETS: ["LECTURA"] },
};

describe("permisosPorTipoDelServidor (odd/permisos-por-tipo-ticket, T6)", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = BACKEND;
    cookieAt = undefined;
  });

  it("pide GET /tickets/permisos-por-tipo con el access token de la cookie y devuelve la respuesta", async () => {
    cookieAt = await mintToken(TECNICO);
    let autorizacion: string | null = null;
    server.use(
      http.get(`${BACKEND}/tickets/permisos-por-tipo`, ({ request }) => {
        autorizacion = request.headers.get("authorization");
        return HttpResponse.json(RESPUESTA);
      }),
    );

    await expect(permisosPorTipoDelServidor()).resolves.toEqual(RESPUESTA);
    expect(autorizacion).toBe(`Bearer ${cookieAt}`);
  });

  it("ADMINISTRADOR y ROOT quedan sin restricción sin consultar al backend", async () => {
    let consultas = 0;
    server.use(
      http.get(`${BACKEND}/tickets/permisos-por-tipo`, () => {
        consultas += 1;
        return HttpResponse.json(RESPUESTA);
      }),
    );
    for (const payload of [
      { ...TECNICO, rol: "ADMINISTRADOR" },
      { ...TECNICO, rol: null, is_global_admin: true },
    ]) {
      cookieAt = await mintToken(payload);
      await expect(permisosPorTipoDelServidor()).resolves.toEqual({
        sinRestriccion: true,
        porTipo: {},
        porModulo: {},
      });
    }
    expect(consultas).toBe(0);
  });

  it("sin cookie, con token ilegible, con error del backend o con respuesta inválida → null", async () => {
    await expect(permisosPorTipoDelServidor()).resolves.toBeNull();

    cookieAt = "no-es-un-jwt";
    await expect(permisosPorTipoDelServidor()).resolves.toBeNull();

    cookieAt = await mintToken(TECNICO);
    server.use(http.get(`${BACKEND}/tickets/permisos-por-tipo`, () => HttpResponse.json({}, { status: 401 })));
    await expect(permisosPorTipoDelServidor()).resolves.toBeNull();

    server.use(
      http.get(`${BACKEND}/tickets/permisos-por-tipo`, () =>
        HttpResponse.json({ ...RESPUESTA, porTipo: { t: ["INVENTADA"] } }),
      ),
    );
    await expect(permisosPorTipoDelServidor()).resolves.toBeNull();
  });
});
