import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "./app-sidebar";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tickets",
}));

function renderWithUser(user: JwtPayload | null) {
  return render(
    <SessionContext.Provider value={{ user, isLoading: false, setUser: () => {} }}>
      <AppSidebar />
    </SessionContext.Provider>,
  );
}

const usuario: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "USUARIO",
  permisos: ["ticket:crear", "ticket:comentar"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
};

const administrador: JwtPayload = {
  sub: "2",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: ["ticket:ver_todos", "catalogo:gestionar", "usuario:gestionar"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
};

const root: JwtPayload = {
  sub: "3",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: [],
  is_global_admin: true,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
};

describe("AppSidebar", () => {
  it("USUARIO (sin ticket:ver_todos) → ve el link Tickets pero NO el link Dashboard", () => {
    renderWithUser(usuario);
    expect(screen.getByRole("link", { name: /tickets/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it("ADMINISTRADOR (con ticket:ver_todos + catalogo:gestionar) → ve Dashboard y Admin", () => {
    renderWithUser(administrador);
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument();
  });

  it("ruta activa (/tickets) → el link correspondiente tiene aria-current='page'", () => {
    renderWithUser(usuario);
    expect(screen.getByRole("link", { name: /tickets/i })).toHaveAttribute("aria-current", "page");
  });

  it("nav es colapsable: botón toggle cambia aria-expanded", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderWithUser(usuario);
    const toggle = getByRole("button", { name: /colapsar|expandir|menú/i });
    const before = toggle.getAttribute("aria-expanded");
    await user.click(toggle);
    const after = toggle.getAttribute("aria-expanded");
    expect(after).not.toBe(before);
  });

  it("ROOT (is_global_admin) → ve el header 'ROOT' y sus 3 ítems (Clientes, Ciclos, Tipos de componente)", () => {
    renderWithUser(root);
    expect(screen.getByText("ROOT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /clientes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^ciclos$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tipos de componente/i })).toBeInTheDocument();
  });

  it("ADMINISTRADOR no-root → NO ve el header 'ROOT' ni sus ítems", () => {
    renderWithUser(administrador);
    expect(screen.queryByText("ROOT")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /clientes/i })).not.toBeInTheDocument();
  });

  it("colapsado + ROOT → oculta el texto del header (rail angosto) pero conserva el link por href", async () => {
    const user = userEvent.setup();
    const { container } = renderWithUser(root);
    const toggle = screen.getByRole("button", { name: /colapsar|expandir|menú/i });
    await user.click(toggle);
    expect(screen.queryByText("ROOT")).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/admin/clientes"]')).toBeInTheDocument();
  });
});
