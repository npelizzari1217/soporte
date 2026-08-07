import { describe, expect, it } from "vitest";
import { tieneModulo, MODULOS } from "./modulo-access";
import type { JwtPayload } from "@/shared/api/types";

function user(overrides: Partial<JwtPayload>): JwtPayload {
  return {
    sub: "u1",
    cliente_id: "c1",
    rol: "USUARIO",
    permisos: [],
    is_global_admin: false,
    cliente_nombre: "Acme",
    membresias: [],
    modulos: [],
    ...overrides,
  };
}

describe("tieneModulo (gate por módulo, 5.2 CAPA 3)", () => {
  it("null (token ausente/expirado) → false: el llamador delega en el gate client-side", () => {
    expect(tieneModulo(null, "COMPRAS")).toBe(false);
  });

  it("ROOT (is_global_admin) tiene el módulo aunque modulos=[]", () => {
    expect(tieneModulo(user({ modulos: [], is_global_admin: true }), "COMPRAS")).toBe(true);
  });

  it("user con el módulo habilitado → true", () => {
    expect(tieneModulo(user({ modulos: ["COMPRAS"] }), "COMPRAS")).toBe(true);
  });

  it("user SIN el módulo → false (aunque tenga otros módulos)", () => {
    expect(tieneModulo(user({ modulos: ["EDILICIA"] }), "COMPRAS")).toBe(false);
  });

  it("MODULOS declara SOPORTE/COMPRAS/EDILICIA/EQUIPOS", () => {
    expect([...MODULOS]).toEqual(["SOPORTE", "COMPRAS", "EDILICIA", "EQUIPOS"]);
  });
});
