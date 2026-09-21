import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "./app-sidebar";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tickets",
}));

function sessionTree(user: JwtPayload | null) {
  return (
    <SessionContext.Provider value={{ user, isLoading: false, setUser: () => {} }}>
      <AppSidebar />
    </SessionContext.Provider>
  );
}

function renderWithUser(user: JwtPayload | null) {
  return render(sessionTree(user));
}

const usuario: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "USUARIO",
  permisos: ["TICKETS:ALTAS", "TICKETS:COMENTAR"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
  nombre: "Juan",
  apellido: "Pérez",
};

const administrador: JwtPayload = {
  sub: "2",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: ["DASHBOARD:LECTURA"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
  nombre: "Ana",
  apellido: "Gómez",
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
  nombre: "Root",
  apellido: "Master",
};

describe("AppSidebar", () => {
  it("USUARIO (sin DASHBOARD:LECTURA) → ve el link Tickets pero NO el link Dashboard", () => {
    renderWithUser(usuario);
    expect(screen.getByRole("link", { name: /tickets/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it("ADMINISTRADOR (con DASHBOARD:LECTURA, esAdminCliente por rol) → ve Dashboard y Admin", () => {
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

  describe("Bloque de identidad (nombre + tipo de usuario)", () => {
    it("expandido → muestra nombre completo y tipo de usuario derivado", () => {
      renderWithUser(usuario);
      expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
      expect(screen.getByText("Usuario")).toBeInTheDocument();
    });

    it("ADMINISTRADOR no-root → tipo de usuario es 'Administrador'", () => {
      renderWithUser(administrador);
      expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
      expect(screen.getByText("Administrador")).toBeInTheDocument();
    });

    it("ROOT (is_global_admin) → tipo de usuario es 'Root', sin importar el rol de la membresía", () => {
      renderWithUser(root);
      expect(screen.getByText("Root Master")).toBeInTheDocument();
      expect(screen.getAllByText("Root").length).toBeGreaterThan(0);
    });

    it("colapsado → oculta nombre/tipo, muestra solo el círculo de iniciales", async () => {
      const user = userEvent.setup();
      renderWithUser(usuario);
      const toggle = screen.getByRole("button", { name: /colapsar|expandir|menú/i });
      await user.click(toggle);

      expect(screen.queryByText("Juan Pérez")).not.toBeInTheDocument();
      expect(screen.queryByText("Usuario")).not.toBeInTheDocument();
      expect(screen.getByText("JP")).toBeInTheDocument();
    });

    it("sin usuario (sesión cargando) → no rompe, no renderiza el bloque de identidad", () => {
      renderWithUser(null);
      expect(screen.queryByText("Juan Pérez")).not.toBeInTheDocument();
    });
  });

  describe("Bloque de marca (logo del cliente, sdd/logo-por-cliente WU3)", () => {
    it("con cliente_logo_v → renderiza <img> apuntando al proxy con ?v=<version>", () => {
      const { container } = renderWithUser({ ...usuario, cliente_id: "c1", cliente_logo_v: 1700000000000 });
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "/api/clientes/c1/logo?v=1700000000000");
      expect(screen.queryByTestId("sidebar-brand-fallback")).not.toBeInTheDocument();
    });

    it("sin el campo cliente_logo_v (token pre-rollout) → Building2, sin <img>", () => {
      const { container } = renderWithUser(usuario);
      expect(container.querySelector("img")).not.toBeInTheDocument();
      expect(screen.getByTestId("sidebar-brand-fallback")).toBeInTheDocument();
    });

    it("con cliente_logo_v pero la carga del binario falla (401/404) → cae a Building2, sin imagen rota", () => {
      const { container } = renderWithUser({ ...usuario, cliente_id: "c1", cliente_logo_v: 1700000000000 });
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();

      fireEvent.error(img!);

      expect(container.querySelector("img")).not.toBeInTheDocument();
      expect(screen.getByTestId("sidebar-brand-fallback")).toBeInTheDocument();
    });

    it("sesión MASTER (cliente_id: null) → Building2, aunque cliente_logo_v viniera seteado", () => {
      const { container } = renderWithUser({ ...root, cliente_id: null, cliente_logo_v: 1700000000000 });
      expect(container.querySelector("img")).not.toBeInTheDocument();
      expect(screen.getByTestId("sidebar-brand-fallback")).toBeInTheDocument();
    });

    it("cambiar de cliente (switch, sin recargar) actualiza el <img> al logo del cliente nuevo", () => {
      const { container, rerender } = render(sessionTree({ ...usuario, cliente_id: "c1", cliente_logo_v: 111 }));
      expect(container.querySelector("img")).toHaveAttribute("src", "/api/clientes/c1/logo?v=111");

      rerender(sessionTree({ ...usuario, cliente_id: "c2", cliente_logo_v: 222 }));

      expect(container.querySelector("img")).toHaveAttribute("src", "/api/clientes/c2/logo?v=222");
    });

    it("nunca deja un hueco de layout: el contenedor del logo está presente con o sin imagen", () => {
      const { container: sinLogo } = renderWithUser(usuario);
      const bloqueSinLogo = sinLogo.querySelector('[data-testid="sidebar-brand"]');
      expect(bloqueSinLogo).toBeInTheDocument();

      const { container: conLogo } = renderWithUser({ ...usuario, cliente_id: "c1", cliente_logo_v: 1 });
      const bloqueConLogo = conLogo.querySelector('[data-testid="sidebar-brand"]');
      expect(bloqueConLogo).toBeInTheDocument();
    });
  });
});
