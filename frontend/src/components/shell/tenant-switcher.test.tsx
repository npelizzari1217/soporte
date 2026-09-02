import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../test/msw/server";
import { TenantSwitcher } from "./tenant-switcher";
import { SessionProvider } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

// Spec: [R28] Switcher en el shell — desplegable con membresias[] del token,
// selecciona → POST /api/auth/switch → actualiza sesión sin reload.

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  zona_horaria: "Europe/Madrid",
  membresias: [
    { cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" },
    { cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" },
  ],
  modulos: [],
  nombre: "Juan",
  apellido: "Pérez",
};

function renderSwitcher(user: JwtPayload | null = PAYLOAD) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider initialUser={user}>
        <TenantSwitcher />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("TenantSwitcher", () => {
  beforeEach(() => {
    refreshMock.mockClear();
  });

  it("no user → renders nothing", () => {
    const { container } = renderSwitcher(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current cliente_nombre as the trigger label", () => {
    renderSwitcher();
    expect(screen.getByRole("button", { name: /cliente uno/i })).toBeInTheDocument();
  });

  it("opening the menu lists every membresía from the token", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: /cliente uno/i }));

    expect(await screen.findByRole("menuitem", { name: /cliente dos/i })).toBeInTheDocument();
  });

  it("selecting a different membresía calls POST /api/auth/switch with { clienteId } and refreshes the router", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("/api/auth/switch", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          user: { ...PAYLOAD, cliente_id: "c2", cliente_nombre: "Cliente Dos" },
        });
      }),
    );

    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: /cliente uno/i }));
    await user.click(await screen.findByRole("menuitem", { name: /cliente dos/i }));

    await waitFor(() => expect(capturedBody).toEqual({ clienteId: "c2" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("tras el switch aplica la sesión nueva client-side: el trigger pasa a mostrar el cliente elegido", async () => {
    // Fix: el switch debe llamar setUser(user) para actualizar la sesión en el
    // cliente (SessionProvider inicializa con useState(initialUser) una sola vez,
    // por lo que router.refresh() solo no basta). Verificamos que el label del
    // trigger cambie de "Cliente Uno" a "Cliente Dos".
    server.use(
      http.post("/api/auth/switch", () =>
        HttpResponse.json({ user: { ...PAYLOAD, cliente_id: "c2", cliente_nombre: "Cliente Dos" } }),
      ),
    );

    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: /cliente uno/i }));
    await user.click(await screen.findByRole("menuitem", { name: /cliente dos/i }));

    expect(await screen.findByRole("button", { name: /cliente dos/i })).toBeInTheDocument();
  });

  it("usuario con UNA sola membresía → el trigger sigue mostrando el cliente prominente (no se oculta)", async () => {
    const singleMembershipUser: JwtPayload = {
      ...PAYLOAD,
      membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" }],
    };
    const user = userEvent.setup();
    renderSwitcher(singleMembershipUser);

    const trigger = screen.getByRole("button", { name: /cliente uno/i });
    expect(trigger).toBeInTheDocument();

    // La única opción del menú (el propio cliente) queda deshabilitada — no
    // hay a dónde saltar, pero el trigger en sí NO se oculta (R28 + prominencia).
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /cliente uno/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

// ROOT (is_global_admin): sin membresías propias — el switcher debe listar
// TODOS los clientes de la plataforma vía GET /clientes en vez de membresias[].
const ROOT_PAYLOAD: JwtPayload = {
  sub: "root-1",
  cliente_id: null,
  rol: null,
  permisos: [],
  is_global_admin: true,
  cliente_nombre: null,
  zona_horaria: null,
  membresias: [],
  modulos: [],
  nombre: "Root",
  apellido: "Master",
};

describe("TenantSwitcher — ROOT (is_global_admin, sin membresias)", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    server.use(
      http.get("/api/clientes", () =>
        HttpResponse.json([
          { id: "c1", nombre: "Cliente Uno", razonSocial: null, cuit: null, dbName: "t1", activo: true },
          { id: "c2", nombre: "Cliente Dos", razonSocial: null, cuit: null, dbName: "t2", activo: true },
        ]),
      ),
    );
  });

  it("trigger muestra fallback 'Elegí un cliente' (cliente_nombre null en master)", () => {
    renderSwitcher(ROOT_PAYLOAD);
    expect(screen.getByRole("button", { name: /elegí un cliente/i })).toBeInTheDocument();
  });

  it("lista TODOS los clientes de la plataforma vía GET /clientes, no membresias[] (vacío)", async () => {
    const user = userEvent.setup();
    renderSwitcher(ROOT_PAYLOAD);

    await user.click(screen.getByRole("button", { name: /elegí un cliente/i }));

    expect(await screen.findByRole("menuitem", { name: /cliente uno/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /cliente dos/i })).toBeInTheDocument();
  });

  it("seleccionar un cliente llama POST /api/auth/switch con { clienteId } y refresca", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("/api/auth/switch", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          user: { ...ROOT_PAYLOAD, cliente_id: "c1", cliente_nombre: "Cliente Uno" },
        });
      }),
    );

    const user = userEvent.setup();
    renderSwitcher(ROOT_PAYLOAD);

    await user.click(screen.getByRole("button", { name: /elegí un cliente/i }));
    await user.click(await screen.findByRole("menuitem", { name: /cliente uno/i }));

    await waitFor(() => expect(capturedBody).toEqual({ clienteId: "c1" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });
});
