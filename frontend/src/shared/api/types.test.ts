import { describe, expect, it } from "vitest";
import { decodeJwtPayload } from "./types";

/**
 * `decodeJwtPayload` corre en cada login, cada switch de tenant y cada
 * render de layout (7 call sites de producción), y normaliza los claims
 * que los tokens viejos no traen. Esa normalización es una rama de runtime,
 * no una declaración de tipos: sin test, un token emitido antes del claim
 * llega a los consumidores como `undefined` y nadie se entera.
 */

/** Arma un JWT falso: solo el segmento del payload importa para el decode. */
function tokenCon(payload: Record<string, unknown>): string {
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `encabezado.${cuerpo}.firma`;
}

const BASE = {
  sub: "u1",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: ["TICKETS"],
  nombre: "Ada",
  apellido: "Lovelace",
};

describe("decodeJwtPayload — zona_horaria", () => {
  it("normalizes a missing zona_horaria to null (pre-rollout token)", () => {
    // Un token emitido antes de `sdd/zona-horaria-por-tenant`: el claim no
    // existe en el payload. Sin la normalización llegaría como `undefined`.
    const { zona_horaria: sinClaim, ...sinZona } = { ...BASE, zona_horaria: undefined };
    void sinClaim;

    expect(decodeJwtPayload(tokenCon(sinZona)).zona_horaria).toBeNull();
  });

  it("keeps the zona_horaria the token carries", () => {
    // El caso hermano: sin esto, el test de arriba pasaría igual si el decode
    // devolviera `null` SIEMPRE, y no probaría nada sobre la normalización.
    // Zona distinta del DEFAULT de la columna a propósito.
    const conZona = { ...BASE, zona_horaria: "Europe/Madrid" };

    expect(decodeJwtPayload(tokenCon(conZona)).zona_horaria).toBe("Europe/Madrid");
  });

  it("keeps a null zona_horaria (master token, no cliente_id)", () => {
    const master = { ...BASE, cliente_id: null, cliente_nombre: null, zona_horaria: null };

    expect(decodeJwtPayload(tokenCon(master)).zona_horaria).toBeNull();
  });
});
