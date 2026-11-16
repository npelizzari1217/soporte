import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { server } from "../../../test/msw/server";
import { TenantSwitcher } from "./tenant-switcher";
import { SessionProvider } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

// Spec: [R28] Switcher en el shell — desplegable con membresias[] del token,
// selecciona → POST /api/auth/switch → actualiza sesión sin reload.

const refreshMock = vi.fn();
const replaceMock = vi.fn();
let pathnameActual = "/tickets";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, replace: replaceMock }),
  usePathname: () => pathnameActual,
}));

const PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: [],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
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
    replaceMock.mockClear();
    pathnameActual = "/tickets";
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

// Un id de detalle pertenece a la base del cliente anterior: en el cliente nuevo no existe y la
// pantalla quedaba en un 404 que "Reintentar" nunca resuelve.
describe("TenantSwitcher — cambio de cliente desde una pantalla de detalle", () => {
  const TICKET_ID = "01a1b0f2-7959-74a9-ab43-18a0ebde4de0";

  beforeEach(() => {
    refreshMock.mockClear();
    replaceMock.mockClear();
  });

  async function cambiarAClienteDos(): Promise<void> {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole("button", { name: /cliente uno/i }));
    await user.click(await screen.findByRole("menuitem", { name: /cliente dos/i }));
  }

  it("desde el detalle de un ticket lleva al listado de tickets", async () => {
    pathnameActual = `/tickets/${TICKET_ID}`;
    server.use(
      http.post("/api/auth/switch", () =>
        HttpResponse.json({ user: { ...PAYLOAD, cliente_id: "c2", cliente_nombre: "Cliente Dos" } }),
      ),
    );

    await cambiarAClienteDos();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/tickets"));
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it("desde el detalle de cualquier otra sección lleva al listado de esa sección", async () => {
    pathnameActual = `/compras/${TICKET_ID}`;
    server.use(
      http.post("/api/auth/switch", () =>
        HttpResponse.json({ user: { ...PAYLOAD, cliente_id: "c2", cliente_nombre: "Cliente Dos" } }),
      ),
    );

    await cambiarAClienteDos();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/compras"));
  });

  it("en una pantalla sin id no navega: solo refresca", async () => {
    pathnameActual = "/admin/usuarios";
    server.use(
      http.post("/api/auth/switch", () =>
        HttpResponse.json({ user: { ...PAYLOAD, cliente_id: "c2", cliente_nombre: "Cliente Dos" } }),
      ),
    );

    await cambiarAClienteDos();

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("si el cambio falla, se queda en el detalle", async () => {
    pathnameActual = `/tickets/${TICKET_ID}`;
    server.use(http.post("/api/auth/switch", () => HttpResponse.json({ message: "x" }, { status: 403 })));

    const toastError = vi.spyOn(toast, "error");

    await cambiarAClienteDos();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("No se pudo cambiar de cliente. Intente de nuevo."));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
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

  it("trigger muestra fallback 'Elija un cliente' (cliente_nombre null en master)", () => {
    renderSwitcher(ROOT_PAYLOAD);
    expect(screen.getByRole("button", { name: /elija un cliente/i })).toBeInTheDocument();
  });

  it("lista TODOS los clientes de la plataforma vía GET /clientes, no membresias[] (vacío)", async () => {
    const user = userEvent.setup();
    renderSwitcher(ROOT_PAYLOAD);

    await user.click(screen.getByRole("button", { name: /elija un cliente/i }));

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

    await user.click(screen.getByRole("button", { name: /elija un cliente/i }));
    await user.click(await screen.findByRole("menuitem", { name: /cliente uno/i }));

    await waitFor(() => expect(capturedBody).toEqual({ clienteId: "c1" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });
});
