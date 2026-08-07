import { describe, expect, it } from "vitest";
import { puedeEntrarAdmin, PERMISOS_ADMIN } from "./admin-access";
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

describe("puedeEntrarAdmin (gate del área /admin, 5.1)", () => {
  it("null (token ausente/expirado) → false: el llamador delega en el gate client-side", () => {
    expect(puedeEntrarAdmin(null)).toBe(false);
  });

  it("ROOT (is_global_admin) entra aunque tenga permisos=[]", () => {
    expect(puedeEntrarAdmin(user({ permisos: [], is_global_admin: true }))).toBe(true);
  });

  it.each(PERMISOS_ADMIN)("con el permiso admin '%s' → entra", (permiso) => {
    expect(puedeEntrarAdmin(user({ permisos: [permiso] }))).toBe(true);
  });

  it("USUARIO común sin permisos de admin → NO entra (queda fuera de /admin)", () => {
    expect(puedeEntrarAdmin(user({ permisos: ["ticket:crear", "ticket:comentar"] }))).toBe(false);
  });
});
