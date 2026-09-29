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

  it("is_global_admin=true → ve Feriados nacionales (catálogo master ROOT, sdd/feriados-configurables)", () => {
    const user = makeUser({ permisos: [], is_global_admin: true });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/admin/feriados-globales");
  });

  it("is_global_admin=false → NO ve Feriados nacionales (catálogo master ROOT) aunque sea ADMINISTRADOR", () => {
    const user = makeUser({ rol: "ADMINISTRADOR", is_global_admin: false });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/admin/feriados-globales");
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

  // WU-7 (sdd/preventivo): ítem de nav gateado por PREVENTIVO:LECTURA, mismo
  // criterio que COMPRAS/EDILICIA/EQUIPOS.
  it("con PREVENTIVO:LECTURA → ve /preventivo", () => {
    const user = makeUser({ permisos: ["PREVENTIVO:LECTURA"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/preventivo");
  });

  it("sin el módulo PREVENTIVO → /preventivo queda oculto", () => {
    const user = makeUser({ permisos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/preventivo");
  });

  // Entrega 1 (sdd/insumos-entrega-2): ítem de nav gateado por
  // INSUMOS:LECTURA, mismo criterio que COMPRAS/EDILICIA/EQUIPOS/PREVENTIVO.
  it("con INSUMOS:LECTURA → ve /insumos", () => {
    const user = makeUser({ permisos: ["INSUMOS:LECTURA"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/insumos");
  });

  it("sin INSUMOS:LECTURA → /insumos queda oculto", () => {
    const user = makeUser({ permisos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/insumos");
  });

  // WU-2 (sdd/repuestos-seccion): "Repuestos" gatea con el MISMO
  // INSUMOS:LECTURA que "Insumos" — no hay permiso REPUESTOS propio.
  /**
   * GEMELO INVERTIDO del renombre de `Admin > Insumos` a "Familia de Catálogos"
   * (#163). Ese ABM administra las familias de las DOS clases, pero esta
   * sección del sidebar principal lista SOLO consumibles desde el #149.
   * Renombrarla también sería el error simétrico: prometería repuestos en una
   * pantalla que los excluye a propósito.
   */
  it("la sección principal sigue llamándose Insumos, y no toma el nombre del ABM", () => {
    const user = makeUser({ permisos: ["INSUMOS:LECTURA"] });
    const items = visibleNavItems(user);
    const insumos = items.find((i) => i.href === "/insumos");
    expect(insumos?.label).toBe("Insumos");
    expect(items.map((i) => i.label)).not.toContain("Familia de Catálogos");
  });

  it("con INSUMOS:LECTURA → ve /repuestos", () => {
    const user = makeUser({ permisos: ["INSUMOS:LECTURA"] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/repuestos");
  });

  it("sin INSUMOS:LECTURA → /repuestos queda oculto", () => {
    const user = makeUser({ permisos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).not.toContain("/repuestos");
  });

  // WU8a (sdd/feriados-configurables): lectura abierta a CUALQUIER
  // autenticado del tenant (spec.md), no gateada por permiso ni por
  // esAdminCliente — mismo criterio que Tickets/KB.
  it("TECNICO sin permisos → ve /feriados igual (lectura abierta a cualquier autenticado)", () => {
    const user = makeUser({ rol: "TECNICO", permisos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/feriados");
  });

  it("ADMINISTRADOR → también ve /feriados (no depende de esAdminCliente)", () => {
    const user = makeUser({ rol: "ADMINISTRADOR" });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/feriados");
  });

  it("ROOT sin cliente (cliente_id: null) → /feriados sigue visible (bypass total)", () => {
    const user = makeUser({ is_global_admin: true, cliente_id: null });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/feriados");
  });

  // WU-7 (sdd/horario-laboral-por-cliente): lectura abierta a CUALQUIER
  // autenticado del tenant (spec.md), no gateada por permiso ni por
  // esAdminCliente — mismo criterio que /feriados.
  it("TECNICO sin permisos → ve /horario-laboral igual (lectura abierta a cualquier autenticado)", () => {
    const user = makeUser({ rol: "TECNICO", permisos: [] });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/horario-laboral");
  });

  it("ADMINISTRADOR → también ve /horario-laboral (no depende de esAdminCliente)", () => {
    const user = makeUser({ rol: "ADMINISTRADOR" });
    const items = visibleNavItems(user);
    expect(items.map((i) => i.href)).toContain("/horario-laboral");
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
    it("ROOT (is_global_admin) → ve la sección 'ROOT' con Clientes, Ciclos, Tipos de componente y Feriados nacionales", () => {
      const user = makeUser({ permisos: [], is_global_admin: true });
      const sections = visibleNavSections(user);
      const rootSection = sections.find((s) => s.title === "ROOT");
      expect(rootSection).toBeDefined();
      expect(rootSection?.items.map((i) => i.href)).toEqual(
        expect.arrayContaining(["/admin/clientes", "/ciclos", "/admin/tipos-componente", "/admin/feriados-globales"]),
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
