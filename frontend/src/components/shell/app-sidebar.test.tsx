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
};

const administrador: JwtPayload = {
  sub: "2",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: ["ticket:ver_todos", "catalogo:gestionar", "usuario:gestionar"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
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
});
