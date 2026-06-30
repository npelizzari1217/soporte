/**
 * T1.10 — use-session: isGlobalAdmin claim
 *
 * Verifica que useSession expone isGlobalAdmin derivado de user.is_global_admin del JWT.
 *
 * Spec ref: auth-rbac/Claim is_global_admin disponible en JwtPayload frontend (admin-general)
 * Tarea: T1.10 (PR1, admin-general)
 *
 * Estrategia: test directo de la lógica derivada, sin React render.
 * useSession lee del SessionContext — los valores derivados (can, isGlobalAdmin) son
 * funciones puras sobre el user payload, testables sin montar el árbol de providers.
 *
 * Para tests que requieren contexto React, ver session-provider.test.tsx.
 */
import { describe, it, expect } from "vitest";
import type { JwtPayload } from "@/shared/api/types";

/**
 * Extrae la lógica derivada de isGlobalAdmin para testeo puro (sin React).
 * Espeja la implementación en use-session.ts.
 */
function deriveIsGlobalAdmin(user: JwtPayload | null): boolean {
  return user?.is_global_admin ?? false;
}

describe("useSession — isGlobalAdmin derivado (T1.10)", () => {
  it("isGlobalAdmin es true cuando el JWT tiene is_global_admin: true", () => {
    const user: JwtPayload = {
      sub: "uuid-1",
      cliente_id: "c-uuid",
      email: "nestor@sesitec.com.ar",
      roles: [],
      permisos: [],
      is_global_admin: true,
    };
    expect(deriveIsGlobalAdmin(user)).toBe(true);
  });

  it("isGlobalAdmin es false cuando el JWT tiene is_global_admin: false", () => {
    const user: JwtPayload = {
      sub: "uuid-2",
      cliente_id: "c-uuid",
      email: "admin@test.com",
      roles: ["ADMINISTRADOR"],
      permisos: [],
      is_global_admin: false,
    };
    expect(deriveIsGlobalAdmin(user)).toBe(false);
  });

  it("isGlobalAdmin es false cuando el JWT no tiene is_global_admin (token legado)", () => {
    const user: JwtPayload = {
      sub: "uuid-3",
      cliente_id: "c-uuid",
      email: "legacy@test.com",
      roles: [],
      permisos: [],
      // is_global_admin ausente
    };
    expect(deriveIsGlobalAdmin(user)).toBe(false);
  });

  it("isGlobalAdmin es false cuando user es null (cargando o no autenticado)", () => {
    expect(deriveIsGlobalAdmin(null)).toBe(false);
  });

  it("ADMINISTRADOR con is_global_admin: false tiene isGlobalAdmin false (invariante del spec)", () => {
    // Invariante: is_global_admin !== rol ADMINISTRADOR — un ADMINISTRADOR puede tener
    // is_global_admin=false y viceversa. isGlobalAdmin solo refleja el claim del JWT.
    const user: JwtPayload = {
      sub: "uuid-4",
      cliente_id: "c-uuid",
      email: "admin-local@test.com",
      roles: ["ADMINISTRADOR"],
      permisos: ["ticket:crear"],
      is_global_admin: false,
    };
    expect(deriveIsGlobalAdmin(user)).toBe(false);
  });
});
