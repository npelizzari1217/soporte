import { describe, it, expect } from "vitest";
import { NAV_ITEMS, visibleNavItems, visibleNavSections } from "./nav-config";
import type { JwtPayload } from "@/shared/api/types";

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
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
    ...overrides,
  };
}

// ADR-P1/ADR-P5 (sdd/matriz-permisos-por-usuario): vocabulario MODULO:ACCION
// en vez de los permisos RBAC viejos; Admin gatea por identidad
// (esAdminCliente), no por permiso de la matriz.
describe("nav-config", () => {
  it("USUARIO (sin TICKETS:VER_TODOS) → ve Tickets pero NO ve Dashboard", () => {
    const user = makeUser({ permisos: ["TICKETS:ALTAS", "TICKETS:COMENTAR"] });
    const items = visibleNavItems(user);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/tickets");
    expect(hrefs).not.toContain("/dashboard");
  });

  it("con DASHBOARD:LECTURA → SÍ ve Dashboard", () => {
    const user = makeUser({ permisos: ["DASHBOARD:LECTURA"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/dashboard");
  });

  it("TECNICO (no ADMINISTRADOR, no ROOT) → NO ve Admin", () => {
    const user = makeUser({ rol: "TECNICO", permisos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/admin/catalogos");
  });

  it("ADMINISTRADOR → SÍ ve Admin (esAdminCliente, ADR-P5)", () => {
    const user = makeUser({ rol: "ADMINISTRADOR" });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/admin/catalogos");
  });

  it("is_global_admin=true → ve Clientes (ROOT) aunque el rol no sea ADMINISTRADOR", () => {
    const user = makeUser({ rol: "TECNICO", is_global_admin: true });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/admin/clientes");
  });

  it("is_global_admin=false → NO ve Clientes (ROOT) aunque sea ADMINISTRADOR de su cliente", () => {
    const user = makeUser({ rol: "ADMINISTRADOR", is_global_admin: false });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/admin/clientes");
  });

  it("is_global_admin=true → ve Ciclos (catálogo master ROOT, sdd/ciclos-abm-root)", () => {
    const user = makeUser({ permisos: [], is_global_admin: true });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/ciclos");
  });

  it("is_global_admin=false → NO ve Ciclos (catálogo master ROOT) aunque sea ADMINISTRADOR", () => {
    const user = makeUser({ rol: "ADMINISTRADOR", is_global_admin: false });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/ciclos");
  });

  it("is_global_admin=true con permisos=[] → ve TODOS los ítems del menú (ROOT puede TODO)", () => {
    const user = makeUser({ permisos: [], is_global_admin: true });
    const items = visibleNavItems(user);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(NAV_ITEMS.map((i) => i.href)));
  });

  it("con COMPRAS:LECTURA → ve /compras (R2: tener la celda ya implica tener el módulo, sin AND aparte)", () => {
    const user = makeUser({ permisos: ["COMPRAS:LECTURA"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/compras");
  });

  it("sin COMPRAS:LECTURA → NO ve /compras", () => {
    const user = makeUser({ permisos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/compras");
  });

  it("ROOT (is_global_admin) → ve /compras aunque permisos=[] (bypass total)", () => {
    const user = makeUser({ permisos: [], is_global_admin: true });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/compras");
  });

  it("null user (no logueado) → no revienta, devuelve solo ítems públicos (ninguno gated)", () => {
    const items = visibleNavItems(null);
    expect(items.every((i) => i.href !== "/dashboard" && i.href !== "/admin/clientes")).toBe(true);
  });

  it("NAV_ITEMS declara al menos Tickets, Dashboard, KB y Admin", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/tickets", "/dashboard", "/kb", "/admin/catalogos"]));
  });

  describe("visibleNavSections", () => {
    it("ROOT (is_global_admin) → ve la sección 'ROOT' con Clientes, Ciclos y Tipos de componente", () => {
      const user = makeUser({ permisos: [], is_global_admin: true });
      const sections = visibleNavSections(user);
      const rootSection = sections.find((s) => s.title === "ROOT");
      expect(rootSection).toBeDefined();
      expect(rootSection?.items.map((i) => i.href)).toEqual(
        expect.arrayContaining(["/admin/clientes", "/ciclos", "/admin/tipos-componente"]),
      );
    });

    it("ADMINISTRADOR no-root → ve Admin pero NO la sección 'ROOT'", () => {
      const user = makeUser({ rol: "ADMINISTRADOR", is_global_admin: false });
      const sections = visibleNavSections(user);
      expect(sections.find((s) => s.title === "ROOT")).toBeUndefined();
      const defaultSection = sections.find((s) => s.title === null);
      expect(defaultSection?.items.map((i) => i.href)).toContain("/admin/catalogos");
    });

    it("usuario plano (TECNICO, sin permisos) → no ve la sección 'ROOT' ni Admin", () => {
      const user = makeUser({ rol: "TECNICO", permisos: [], is_global_admin: false });
      const sections = visibleNavSections(user);
      expect(sections.find((s) => s.title === "ROOT")).toBeUndefined();
      const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
      expect(allHrefs).not.toContain("/admin/catalogos");
    });
  });
});
