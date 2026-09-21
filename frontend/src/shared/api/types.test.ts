import { describe, it, expect } from "vitest";
import { decodeJwtPayload } from "./types";

/**
 * decodeJwtPayload — normalización defensiva de `cliente_logo_v`
 * (sdd/logo-por-cliente, WU3, tarea 3.7). Mismo criterio que `modulos`/
 * `nombre`: un token emitido antes de este campo no lo trae, y el decoder
 * lo normaliza a `null` en vez de dejarlo `undefined` — sin esto, un
 * consumidor tendría que repetir el `?? null` en cada lugar que lo lee.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

const basePayload = {
  sub: "u1",
  cliente_id: "c1",
  rol: "USUARIO",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
  nombre: "Juan",
  apellido: "Pérez",
};

describe("decodeJwtPayload — cliente_logo_v", () => {
  it("token sin el campo (emitido antes del rollout) → normaliza a null", () => {
    const decoded = decodeJwtPayload(fakeJwt(basePayload));
    expect(decoded.cliente_logo_v).toBeNull();
  });

  it("token con cliente_logo_v: null (sin logo o sesión MASTER) → se conserva null", () => {
    const decoded = decodeJwtPayload(fakeJwt({ ...basePayload, cliente_logo_v: null }));
    expect(decoded.cliente_logo_v).toBeNull();
  });

  it("token con cliente_logo_v numérico → se conserva tal cual", () => {
    const decoded = decodeJwtPayload(fakeJwt({ ...basePayload, cliente_logo_v: 1700000000000 }));
    expect(decoded.cliente_logo_v).toBe(1700000000000);
  });
});
