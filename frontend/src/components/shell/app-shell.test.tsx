import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./app-shell";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tickets",
  useRouter: () => ({ push: vi.fn() }),
}));

const usuario: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "USUARIO",
  permisos: ["ticket:crear"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  zona_horaria: "Europe/Madrid",
  membresias: [],
  modulos: [],
  nombre: "Juan",
  apellido: "Pérez",
};

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ user: usuario, isLoading: false, setUser: () => {} }}>
        <AppShell>
          <p>Contenido de la página</p>
        </AppShell>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("AppShell", () => {
  it("renders the sidebar nav, breadcrumbs AND the page children together", () => {
    renderShell();
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByText("Contenido de la página")).toBeInTheDocument();
  });

  it("USUARIO sin ticket:ver_todos → Dashboard NO aparece en el sidebar dentro del shell", () => {
    renderShell();
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
  });
});
