import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { FeriadosListView } from "./feriados-list-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const GLOBAL_ENERO = { id: "g1", fecha: "2026-01-01", descripcion: "Año Nuevo" };
const GLOBAL_MAYO = { id: "g2", fecha: "2026-05-01", descripcion: "Día del Trabajador" };
const CLIENTE_MARZO = { id: "c1", fecha: "2026-03-15", descripcion: "Aniversario del cliente" };

function mockBackendOk() {
  // Fuera de orden a propósito, en ambos endpoints — prueba que la pantalla
  // ordena el resultado combinado, no que confía en el orden de cada fetch.
  server.use(
    http.get("/api/feriados", () => HttpResponse.json([GLOBAL_MAYO, GLOBAL_ENERO])),
    http.get("/api/feriados-cliente", () => HttpResponse.json([CLIENTE_MARZO])),
  );
}

describe("FeriadosListView (/feriados, task 8.1, WU8a)", () => {
  beforeEach(() => {
    mockBackendOk();
  });

  // spec.md "Per-client admin manages its own holidays; other roles read":
  // esta pantalla NO gatea por esAdminCliente — cualquier autenticado del
  // tenant ve la lista combinada.
  it.each([
    ["TECNICO sin permisos", buildUser({ rol: "TECNICO", permisos: [] })],
    ["ADMINISTRADOR", buildUser({ rol: "ADMINISTRADOR" })],
  ])("%s ve la lista combinada, sin gate de admin", async (_label, user) => {
    renderWithProviders(<FeriadosListView />, { user });

    await screen.findByText("Año Nuevo");
    expect(screen.getByText("Aniversario del cliente")).toBeInTheDocument();
    expect(screen.getByText("Día del Trabajador")).toBeInTheDocument();
  });

  it("combina ambas listas ordenadas por fecha, con el badge de origen correcto por fila", async () => {
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    await screen.findByText("Año Nuevo");
    const filas = screen.getAllByRole("row").slice(1); // descarta el header
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent("Año Nuevo");
    expect(filas[1]).toHaveTextContent("Aniversario del cliente");
    expect(filas[2]).toHaveTextContent("Día del Trabajador");

    expect(filas[0]).toHaveTextContent("Nacional");
    expect(filas[1]).toHaveTextContent("Del cliente");
    expect(filas[2]).toHaveTextContent("Nacional");
  });

  it("muestra la fecha en formato dd/mm/yyyy, nunca el ISO crudo", async () => {
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    await screen.findByText("Año Nuevo");
    expect(screen.getByText("15/03/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-03-15")).not.toBeInTheDocument();
  });

  it("sin filas GLOBAL sin filas CLIENTE (ninguna de las dos tiene datos) → estado vacío, no error", async () => {
    server.use(
      http.get("/api/feriados", () => HttpResponse.json([])),
      http.get("/api/feriados-cliente", () => HttpResponse.json([])),
    );
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    expect(await screen.findByText("Sin feriados")).toBeInTheDocument();
  });

  it("no muestra ninguna columna de Acciones (WU8a es solo lectura)", async () => {
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    await screen.findByText("Año Nuevo");
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  // TenantGuard responde 403 cuando el JWT no trae `cliente_id`
  // (`tenant.guard.ts:55-57`) — el caso de un ROOT en sesión MASTER
  // (`cliente_id: null`) que todavía no eligió un tenant. Sin gate propio
  // para ese caso: se sigue el mismo camino de error genérico que cualquier
  // otra pantalla scopeada a tenant (ej. `/compras`, `/ciclos`) — ni crashea
  // ni banner especial, DataTable muestra el ErrorState reutilizable.
  it("ROOT sin tenant elegido (cliente_id: null) → falla feriados-cliente con 403 y la pantalla muestra el error genérico, sin crashear", async () => {
    server.use(
      http.get("/api/feriados", () => HttpResponse.json([GLOBAL_ENERO])),
      http.get("/api/feriados-cliente", () =>
        HttpResponse.json({ statusCode: 403, message: "Acceso denegado: tenant no identificado" }, { status: 403 }),
      ),
    );

    renderWithProviders(<FeriadosListView />, {
      user: buildUser({ is_global_admin: true, cliente_id: null, rol: "TECNICO" }),
    });

    expect(await screen.findByText("No se pudieron cargar los feriados.")).toBeInTheDocument();
    expect(screen.queryByText("Año Nuevo")).not.toBeInTheDocument();
  });
});

// Escritura (task 8.1/8.2 remainder, WU8b): create/editar/eliminar SOLO
// sobre filas CLIENTE, gateado por `esAdminCliente`. Filas GLOBAL nunca
// llevan acciones acá, para nadie (spec.md: "el cliente ve los globales read-only").
describe("FeriadosListView — escritura (task 8.1/8.2, WU8b)", () => {
  beforeEach(() => {
    mockBackendOk();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("ADMINISTRADOR ve Acciones solo en la fila CLIENTE, nunca en las filas GLOBAL", async () => {
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    await screen.findByText("Año Nuevo");
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas).toHaveLength(3);
    // fila 0 = Año Nuevo (GLOBAL), fila 1 = Aniversario del cliente (CLIENTE), fila 2 = Día del Trabajador (GLOBAL)
    expect(within(filas[0]!).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(within(filas[1]!).getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(within(filas[1]!).getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(within(filas[2]!).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("un rol no admin (TECNICO) no ve ninguna acción de escritura, ni siquiera sobre la fila CLIENTE", async () => {
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    await screen.findByText("Aniversario del cliente");
    expect(screen.queryByRole("button", { name: /nuevo feriado/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it("crear feriado propio envía el DTO correcto a POST /feriados-cliente y muestra el toast de éxito", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/feriados-cliente", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "c2", ...capturedBody }, { status: 201 });
      }),
    );

    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Aniversario del cliente");

    await user.click(screen.getByRole("button", { name: /nuevo feriado/i }));
    await user.type(screen.getByLabelText(/^fecha$/i), "2026-07-09");
    await user.type(screen.getByLabelText(/^descripción$/i), "Aniversario 2 (propio)");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({ fecha: "2026-07-09", descripcion: "Aniversario 2 (propio)" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Feriado creado."));
  });

  it("una fecha ya global (422 FeriadoFechaEsGlobalError) muestra el mensaje EXACTO del backend en el toast de error", async () => {
    const user = userEvent.setup();
    const MENSAJE_BACKEND =
      'La fecha "2026-12-25" ya es un feriado del calendario global. No se puede agregar como feriado propio del cliente.';
    server.use(
      http.post("/api/feriados-cliente", () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Aniversario del cliente");

    await user.click(screen.getByRole("button", { name: /nuevo feriado/i }));
    await user.type(screen.getByLabelText(/^fecha$/i), "2026-12-25");
    await user.type(screen.getByLabelText(/^descripción$/i), "Navidad (propia)");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });

  it("editar el feriado propio confirma con PATCH /feriados-cliente/:id y muestra el toast de éxito", async () => {
    const user = userEvent.setup();
    let patchCalled = false;
    server.use(
      http.patch("/api/feriados-cliente/c1", async ({ request }) => {
        patchCalled = true;
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...CLIENTE_MARZO, ...body });
      }),
    );

    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Aniversario del cliente");

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const descripcionInput = await screen.findByLabelText(/^descripción$/i);
    await user.clear(descripcionInput);
    await user.type(descripcionInput, "Aniversario del cliente (renombrado)");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(patchCalled).toBe(true));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Feriado actualizado."));
  });

  it("eliminar el feriado propio confirma en el diálogo, dispara el DELETE y muestra el toast de éxito", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;
    server.use(
      http.delete("/api/feriados-cliente/c1", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Aniversario del cliente");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Eliminar" });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Feriado eliminado."));
  });
});
