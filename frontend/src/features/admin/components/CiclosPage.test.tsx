/**
 * CiclosPage — T6.3 (admin-general PR6b)
 *
 * Pantalla de administración de ciclos de gestión del tenant resuelto.
 * Visible para operador global (con cliente seleccionado) y ADMINISTRADOR.
 *
 * Providers: cada test envuelve manualmente en <TenantContext.Provider value={...}>
 * (en vez de <TenantContextProvider>) para mantener el test atómico — evita el
 * efecto interno de auto-resolución de ciclo activo (ya cubierto por
 * tenant-context.test.tsx) y da control total sobre clienteId por escenario.
 *
 * Spec ref: admin-ui/Pantalla Ciclos
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { SessionProvider } from "@/shared/providers/session-provider";
import { TenantContext, type TenantContextValue } from "@/shared/providers/tenant-context";
import * as notifyModule from "@/shared/lib/notify";
import { CiclosPage } from "./CiclosPage";
import type { JwtPayload } from "@/shared/api/types";
import type { Ciclo } from "../types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ADMIN_CLIENTE: JwtPayload = {
  sub: "a1",
  cliente_id: "cliente-1",
  cliente_nombre: "Acme",
  email: "admin@test.com",
  roles: ["ADMINISTRADOR"],
  permisos: [],
  is_global_admin: false,
};

const OPERADOR: JwtPayload = {
  sub: "op1",
  cliente_id: "home",
  email: "op@test.com",
  roles: [],
  permisos: [],
  is_global_admin: true,
};

const CICLOS: Ciclo[] = [
  { id: "c1", nombre: "Ciclo 2025", fechaInicio: "2025-01-01", fechaFin: "2025-06-30", activo: false },
  { id: "c2", nombre: "Ciclo 2026", fechaInicio: "2026-01-01", fechaFin: "2026-06-30", activo: true },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(user: JwtPayload, tenant?: Partial<TenantContextValue>) {
  const qc = makeQC();
  const tenantValue: TenantContextValue = {
    clienteId: null,
    clienteNombre: null,
    cicloId: null,
    cicloNombre: null,
    setCliente: vi.fn(),
    setCiclo: vi.fn(),
    ...tenant,
  };
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider initialUser={user}>
        <TenantContext.Provider value={tenantValue}>
          <CiclosPage />
        </TenantContext.Provider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CiclosPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra skeleton mientras carga GET /ciclos", async () => {
    server.use(
      http.get("http://localhost/api/ciclos", async () => {
        await delay(50);
        return HttpResponse.json(CICLOS);
      }),
    );
    renderPage(ADMIN_CLIENTE);

    expect(screen.getAllByTestId("ciclos-page-skeleton").length).toBeGreaterThan(0);
    await screen.findByText("Ciclo 2025");
  });

  it("renderiza filas-tarjeta con nombre, fechas y badge de estado", async () => {
    server.use(http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS)));
    renderPage(ADMIN_CLIENTE);

    expect(await screen.findByText("Ciclo 2025")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ciclos" })).toBeInTheDocument();
    expect(screen.getByText("Ciclo 2026")).toBeInTheDocument();
    expect(screen.getByText("01/01/2025 – 30/06/2025")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it('muestra el botón "Activar" solo en ciclos inactivos', async () => {
    server.use(http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS)));
    renderPage(ADMIN_CLIENTE);

    await screen.findByText("Ciclo 2025");
    expect(screen.getByRole("button", { name: "Activar Ciclo 2025" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activar Ciclo 2026" })).toBeNull();
  });

  it('"Activar" llama PATCH /ciclos/:id/activar y entra en loading durante la request', async () => {
    let patchCalled = false;
    server.use(
      http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS)),
      http.patch("http://localhost/api/ciclos/c1/activar", async () => {
        patchCalled = true;
        await delay(50);
        return HttpResponse.json({ ...CICLOS[0], activo: true });
      }),
    );

    const user = userEvent.setup();
    renderPage(ADMIN_CLIENTE);
    await screen.findByText("Ciclo 2025");

    const activarBtn = screen.getByRole("button", { name: "Activar Ciclo 2025" });
    await user.click(activarBtn);

    await waitFor(() => expect(activarBtn).toBeDisabled());
    await waitFor(() => expect(patchCalled).toBe(true));
  });

  it("on success activa el ciclo y refetchea la lista (badges actualizados)", async () => {
    let getCount = 0;
    server.use(
      http.get("http://localhost/api/ciclos", () => {
        getCount += 1;
        if (getCount === 1) return HttpResponse.json(CICLOS);
        return HttpResponse.json([
          { ...CICLOS[0], activo: true },
          { ...CICLOS[1], activo: false },
        ]);
      }),
      http.patch("http://localhost/api/ciclos/c1/activar", () =>
        HttpResponse.json({ ...CICLOS[0], activo: true }),
      ),
    );

    const user = userEvent.setup();
    renderPage(ADMIN_CLIENTE);
    await screen.findByText("Ciclo 2025");

    await user.click(screen.getByRole("button", { name: "Activar Ciclo 2025" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Activar Ciclo 2025" })).toBeNull();
      expect(screen.getByRole("button", { name: "Activar Ciclo 2026" })).toBeInTheDocument();
    });
  });

  it("on error muestra un toast con el mensaje del servidor", async () => {
    server.use(
      http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS)),
      http.patch("http://localhost/api/ciclos/c1/activar", () =>
        HttpResponse.json({ statusCode: 500, message: "No se pudo activar el ciclo." }, { status: 500 }),
      ),
    );
    const notifyError = vi.spyOn(notifyModule.notify, "error");

    const user = userEvent.setup();
    renderPage(ADMIN_CLIENTE);
    await screen.findByText("Ciclo 2025");

    await user.click(screen.getByRole("button", { name: "Activar Ciclo 2025" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("No se pudo activar el ciclo."));
  });

  it('"Nuevo ciclo" abre un formulario con nombre, fecha de inicio y fecha de fin', async () => {
    server.use(http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS)));
    const user = userEvent.setup();
    renderPage(ADMIN_CLIENTE);

    await screen.findByText("Ciclo 2025");
    await user.click(screen.getByRole("button", { name: "Nuevo ciclo" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Nombre")).toBeInTheDocument();
    expect(dialog.getByLabelText("Fecha de inicio")).toBeInTheDocument();
    expect(dialog.getByLabelText("Fecha de fin")).toBeInTheDocument();
  });

  it('on overlap error (422) muestra "Las fechas solapan con un ciclo existente"', async () => {
    server.use(
      http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS)),
      http.post("http://localhost/api/ciclos", () =>
        HttpResponse.json(
          { statusCode: 422, message: "Las fechas solapan con un ciclo existente" },
          { status: 422 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderPage(ADMIN_CLIENTE);
    await screen.findByText("Ciclo 2025");

    await user.click(screen.getByRole("button", { name: "Nuevo ciclo" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Nombre"), "Ciclo solapado");
    await user.type(dialog.getByLabelText("Fecha de inicio"), "2025-02-01");
    await user.type(dialog.getByLabelText("Fecha de fin"), "2025-03-01");
    await user.click(dialog.getByRole("button", { name: "Crear" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Las fechas solapan con un ciclo existente",
    );
  });

  it("on success de creación agrega el ciclo nuevo a la lista (inactivo)", async () => {
    let ciclosCreados: Ciclo[] = [];
    server.use(
      http.get("http://localhost/api/ciclos", () => HttpResponse.json([...CICLOS, ...ciclosCreados])),
      http.post("http://localhost/api/ciclos", async ({ request }) => {
        const body = (await request.json()) as { nombre: string; fechaInicio: string; fechaFin: string };
        const nuevo: Ciclo = { id: "c3", nombre: body.nombre, fechaInicio: body.fechaInicio, fechaFin: body.fechaFin, activo: false };
        ciclosCreados = [nuevo];
        return HttpResponse.json(nuevo, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderPage(ADMIN_CLIENTE);
    await screen.findByText("Ciclo 2025");

    await user.click(screen.getByRole("button", { name: "Nuevo ciclo" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Nombre"), "Ciclo 2027");
    await user.type(dialog.getByLabelText("Fecha de inicio"), "2027-01-01");
    await user.type(dialog.getByLabelText("Fecha de fin"), "2027-06-30");
    await user.click(dialog.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Ciclo 2027")).toBeInTheDocument();
    const row = screen.getByText("Ciclo 2027").parentElement!.parentElement as HTMLElement;
    expect(within(row).getByText("Inactivo")).toBeInTheDocument();
  });

  it("operador ve los ciclos del cliente seleccionado en TenantContext (X-Tenant-Id en el request)", async () => {
    let capturedHeader: string | null = null;
    server.use(
      http.get("http://localhost/api/ciclos", ({ request }) => {
        capturedHeader = request.headers.get("x-tenant-id");
        return HttpResponse.json(CICLOS);
      }),
    );

    renderPage(OPERADOR, { clienteId: "cliente-x", clienteNombre: "Cliente X" });

    await screen.findByText("Ciclo 2025");
    expect(capturedHeader).toBe("cliente-x");
  });

  it("empty state: sin ciclos muestra mensaje amigable y acción para crear el primero", async () => {
    server.use(http.get("http://localhost/api/ciclos", () => HttpResponse.json([])));
    renderPage(ADMIN_CLIENTE);

    expect(await screen.findByText("No hay ciclos registrados")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Nuevo ciclo" }).length).toBeGreaterThan(0);
  });
});
