import { describe, expect, it } from "vitest";
import { puedeEntrarAdmin } from "./admin-access";
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

// ADR-P5 (sdd/matriz-permisos-por-usuario): ADMINISTRADOR-o-ROOT, mismo
// criterio que `AdminClienteGuard`/`esAdminDeCliente` del backend.
describe("puedeEntrarAdmin (gate del área /admin, ADR-P5)", () => {
  it("null (token ausente/expirado) → false: el llamador delega en el gate client-side", () => {
    expect(puedeEntrarAdmin(null)).toBe(false);
  });

  it("ROOT (is_global_admin) entra aunque rol sea USUARIO", () => {
    expect(puedeEntrarAdmin(user({ rol: "USUARIO", is_global_admin: true }))).toBe(true);
  });

  it("ADMINISTRADOR de su cliente entra", () => {
    expect(puedeEntrarAdmin(user({ rol: "ADMINISTRADOR" }))).toBe(true);
  });

  it("TECNICO/USUARIO/COLABORADOR (no ADMINISTRADOR, no ROOT) → NO entra", () => {
    expect(puedeEntrarAdmin(user({ rol: "TECNICO" }))).toBe(false);
    expect(puedeEntrarAdmin(user({ rol: "USUARIO" }))).toBe(false);
  });
});
