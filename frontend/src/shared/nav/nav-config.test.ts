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

describe("nav-config", () => {
  it("USUARIO (sin ticket:ver_todos) → ve Tickets pero NO ve Dashboard", () => {
    const user = makeUser({ permisos: ["ticket:crear", "ticket:comentar"] });
    const items = visibleNavItems(user);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/tickets");
    expect(hrefs).not.toContain("/dashboard");
  });

  it("COLABORADOR (con ticket:ver_todos) → SÍ ve Dashboard", () => {
    const user = makeUser({ permisos: ["ticket:ver_todos"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/dashboard");
  });

  it("usuario sin cliente:gestionar/catalogo:gestionar → NO ve Admin", () => {
    const user = makeUser({ permisos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/admin/catalogos");
  });

  it("ADMINISTRADOR (con catalogo:gestionar) → SÍ ve Admin", () => {
    const user = makeUser({ permisos: ["catalogo:gestionar"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/admin/catalogos");
  });

  it("is_global_admin=true → ve Clientes (ROOT) aunque no tenga permisos de rol", () => {
    const user = makeUser({ permisos: [], is_global_admin: true });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/admin/clientes");
  });

  it("is_global_admin=false → NO ve Clientes (ROOT) aunque tenga otros permisos", () => {
    const user = makeUser({ permisos: ["catalogo:gestionar"], is_global_admin: false });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/admin/clientes");
  });

  it("is_global_admin=true → ve Ciclos (catálogo master ROOT, sdd/ciclos-abm-root)", () => {
    const user = makeUser({ permisos: [], is_global_admin: true });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/ciclos");
  });

  it("is_global_admin=false → NO ve Ciclos (catálogo master ROOT) aunque tenga otros permisos", () => {
    const user = makeUser({ permisos: ["ciclo:gestionar"], is_global_admin: false });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/ciclos");
  });

  it("is_global_admin=true con permisos=[] → ve TODOS los ítems del menú (ROOT puede TODO)", () => {
    const user = makeUser({ permisos: [], is_global_admin: true });
    const items = visibleNavItems(user);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(NAV_ITEMS.map((i) => i.href)));
  });

  it("con permiso compra:gestionar pero SIN módulo COMPRAS → NO ve /compras (5.2 CAPA 3)", () => {
    const user = makeUser({ permisos: ["compra:gestionar"], modulos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/compras");
  });

  it("con permiso compra:gestionar Y módulo COMPRAS → SÍ ve /compras", () => {
    const user = makeUser({ permisos: ["compra:gestionar"], modulos: ["COMPRAS"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/compras");
  });

  it("con módulo COMPRAS pero SIN permiso compra:gestionar → NO ve /compras (AND, no OR)", () => {
    const user = makeUser({ permisos: [], modulos: ["COMPRAS"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/compras");
  });

  it("ROOT (is_global_admin) → ve /compras aunque modulos=[] (ve todos los módulos)", () => {
    const user = makeUser({ permisos: [], modulos: [], is_global_admin: true });
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

    it("ADMINISTRADOR no-root (con catalogo:gestionar) → ve Admin pero NO la sección 'ROOT'", () => {
      const user = makeUser({ permisos: ["catalogo:gestionar"], is_global_admin: false });
      const sections = visibleNavSections(user);
      expect(sections.find((s) => s.title === "ROOT")).toBeUndefined();
      const defaultSection = sections.find((s) => s.title === null);
      expect(defaultSection?.items.map((i) => i.href)).toContain("/admin/catalogos");
    });

    it("usuario plano (sin permisos) → no ve la sección 'ROOT' ni Admin", () => {
      const user = makeUser({ permisos: [], is_global_admin: false });
      const sections = visibleNavSections(user);
      expect(sections.find((s) => s.title === "ROOT")).toBeUndefined();
      const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
      expect(allHrefs).not.toContain("/admin/catalogos");
    });
  });
});
