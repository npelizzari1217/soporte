import { describe, it, expect } from "vitest";
import { NAV_ITEMS, visibleNavItems } from "./nav-config";
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

  it("is_global_admin=true con permisos=[] → ve TODOS los ítems del menú (ROOT puede TODO)", () => {
    const user = makeUser({ permisos: [], is_global_admin: true });
    const items = visibleNavItems(user);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(NAV_ITEMS.map((i) => i.href)));
  });

  it("null user (no logueado) → no revienta, devuelve solo ítems públicos (ninguno gated)", () => {
    const items = visibleNavItems(null);
    expect(items.every((i) => i.href !== "/dashboard" && i.href !== "/admin/clientes")).toBe(true);
  });

  it("NAV_ITEMS declara al menos Tickets, Dashboard, KB y Admin", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/tickets", "/dashboard", "/kb", "/admin/catalogos"]));
  });
});
