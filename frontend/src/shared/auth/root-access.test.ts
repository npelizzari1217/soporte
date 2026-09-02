import { describe, expect, it } from "vitest";
import { puedeEntrarRoot } from "./root-access";
import type { JwtPayload } from "@/shared/api/types";

function user(overrides: Partial<JwtPayload>): JwtPayload {
  return {
    sub: "u1",
    cliente_id: "c1",
    rol: "USUARIO",
    permisos: [],
    is_global_admin: false,
    cliente_nombre: "Acme",
    zona_horaria: "Europe/Madrid",
    membresias: [],
    modulos: [],
    nombre: "Juan",
    apellido: "Pérez",
    ...overrides,
  };
}

describe("puedeEntrarRoot (gate de las áreas EXCLUSIVAS de ROOT: Clientes, Ciclos master, Tipos de componente)", () => {
  it("null (token ausente/expirado) → false: el llamador delega en el gate client-side", () => {
    expect(puedeEntrarRoot(null)).toBe(false);
  });

  it("ROOT (is_global_admin) entra", () => {
    expect(puedeEntrarRoot(user({ is_global_admin: true }))).toBe(true);
  });

  it("ADMINISTRADOR no-root (con permisos de admin del tenant) → NO entra", () => {
    expect(
      puedeEntrarRoot(
        user({ is_global_admin: false, permisos: ["catalogo:gestionar", "cliente:gestionar"] }),
      ),
    ).toBe(false);
  });

  it("USUARIO común sin permisos → NO entra", () => {
    expect(puedeEntrarRoot(user({ is_global_admin: false, permisos: [] }))).toBe(false);
  });
});
