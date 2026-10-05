import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../test/msw/server";
import { DashboardHeader } from "./dashboard-header";
import { SessionProvider } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

// Spec: PR11 — shell mínimo: TenantSwitcher + ThemeToggle + logout.

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" }],
  modulos: [],
  nombre: "Juan",
  apellido: "Pérez",
};

function renderHeader() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider initialUser={PAYLOAD}>
        <DashboardHeader />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("DashboardHeader", () => {
  beforeEach(() => pushMock.mockClear());

  it("renders the tenant switcher trigger and the theme toggle", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /cliente uno/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cambiar a modo/i })).toBeInTheDocument();
  });

  it("clicking 'Cerrar sesión' calls POST /api/auth/logout then navigates to /login", async () => {
    let logoutCalled = false;
    server.use(
      http.post("/api/auth/logout", () => {
        logoutCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    await waitFor(() => expect(logoutCalled).toBe(true));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("muestra el botón 'Cambiar contraseña' y abre el diálogo al hacer clic", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    expect(await screen.findByRole("dialog", { name: /cambiar contraseña/i })).toBeInTheDocument();
  });

  it("muestra 'Link de soporte' en el header cuando el cliente tiene link vigente", async () => {
    server.use(
      http.get("/api/clientes/actual/link-soporte", () =>
        HttpResponse.json({ url: "https://soporte.example.com/c/acme/pedido" }),
      ),
    );
    renderHeader();

    expect(await screen.findByRole("button", { name: /link de soporte/i })).toBeInTheDocument();
  });

  it("no muestra 'Link de soporte' si el cliente no tiene link", async () => {
    renderHeader();

    await screen.findByRole("button", { name: /cambiar contraseña/i });
    expect(screen.queryByRole("button", { name: /link de soporte/i })).not.toBeInTheDocument();
  });
});
