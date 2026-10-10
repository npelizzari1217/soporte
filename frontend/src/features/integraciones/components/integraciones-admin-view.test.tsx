import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { SessionContext } from "@/shared/providers/session-provider";
import { IntegracionesAdminView } from "./integraciones-admin-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/admin/integraciones") }));

/**
 * IntegracionesAdminView — api-publica T9 (CA3, CA4, CA8, CA9): lista con
 * último uso y revocadas visibles, alta con la clave mostrada una sola vez,
 * revocación con confirmación, 422 informado y gate `esAdminCliente`.
 */
const CLAVE_EN_CLARO = "sop_nuevo123_valor-secreto-de-un-solo-uso";

function clave(over: Record<string, unknown>) {
  return {
    id: "k-1",
    nombre: "ERP",
    prefijo: "sop_abcd1234",
    permisos: ["TICKETS:LECTURA", "TICKETS:ALTAS"],
    creadaAt: "2026-10-01T12:00:00.000Z",
    ultimoUsoAt: null,
    revocadaAt: null,
    ...over,
  };
}

function mockLista(claves: unknown[]) {
  server.use(http.get("/api/integraciones/claves", () => HttpResponse.json(claves)));
}

/** Render con un `QueryClient` propio, para poder revisar el cache después del alta. */
function renderAdmin() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ user: buildUser({ rol: "ADMINISTRADOR" }), isLoading: false, setUser: () => {} }}>
        <IntegracionesAdminView />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("IntegracionesAdminView", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("un no administrador no ve la pantalla", async () => {
    mockLista([clave({})]);
    renderWithProviders(<IntegracionesAdminView />, { user: buildUser({ rol: "TECNICO" }) });
    expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
    expect(screen.queryByText("ERP")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nueva clave/i })).not.toBeInTheDocument();
  });

  it("ROOT sin rol de ADMINISTRADOR ve la pantalla", async () => {
    mockLista([clave({})]);
    renderWithProviders(<IntegracionesAdminView />, { user: buildUser({ rol: null, is_global_admin: true }) });
    expect(await screen.findByText("ERP")).toBeInTheDocument();
  });

  it("lista prefijo, permisos, último uso y estado; la revocada queda visible y sin acción", async () => {
    mockLista([
      clave({}),
      clave({
        id: "k-2",
        nombre: "CRM viejo",
        prefijo: "sop_zzzz9999",
        permisos: ["TICKETS:COMENTAR"],
        ultimoUsoAt: "2026-10-05T15:30:00.000Z",
        revocadaAt: "2026-10-06T10:00:00.000Z",
      }),
    ]);
    renderAdmin();

    const filaActiva = (await screen.findByText("ERP")).closest("tr") as HTMLElement;
    expect(within(filaActiva).getByText("sop_abcd1234…")).toBeInTheDocument();
    expect(within(filaActiva).getByText("Ver tickets")).toBeInTheDocument();
    expect(within(filaActiva).getByText("Crear tickets")).toBeInTheDocument();
    expect(within(filaActiva).getByText("Nunca")).toBeInTheDocument();
    expect(within(filaActiva).getByText("Activa")).toBeInTheDocument();
    expect(within(filaActiva).getByRole("button", { name: "Revocar ERP" })).toBeInTheDocument();

    const filaRevocada = screen.getByText("CRM viejo").closest("tr") as HTMLElement;
    expect(within(filaRevocada).getByText("Comentar tickets")).toBeInTheDocument();
    expect(within(filaRevocada).queryByText("Nunca")).not.toBeInTheDocument();
    expect(within(filaRevocada).getByText("Revocada")).toBeInTheDocument();
    expect(within(filaRevocada).getByText(/^el \d{2}\/\d{2}\/2026/)).toBeInTheDocument();
    expect(within(filaRevocada).queryByRole("button", { name: /revocar/i })).not.toBeInTheDocument();
  });

  it("crear envía nombre y permisos, muestra la clave una vez y la descarta al cerrar", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    let body: unknown;
    let lecturas = 0;
    server.use(
      http.get("/api/integraciones/claves", () => {
        lecturas += 1;
        return HttpResponse.json([clave({})]);
      }),
      http.post("/api/integraciones/claves", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { id: "k-9", nombre: "Mesa", prefijo: "sop_nuevo123", permisos: ["TICKETS:COMENTAR"], creadaAt: "2026-10-10T12:00:00.000Z", clave: CLAVE_EN_CLARO },
          { status: 201 },
        );
      }),
    );
    const queryClient = renderAdmin();
    await screen.findByText("ERP");

    await user.click(screen.getByRole("button", { name: /nueva clave/i }));
    await user.type(screen.getByLabelText("Nombre"), "  Mesa  ");
    await user.click(screen.getByRole("checkbox", { name: "Comentar tickets" }));
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText(CLAVE_EN_CLARO)).toBeInTheDocument();
    expect(body).toEqual({ nombre: "Mesa", permisos: ["TICKETS:COMENTAR"] });
    expect(screen.getByText(/única vez que la vas a ver/i)).toBeInTheDocument();
    await waitFor(() => expect(lecturas).toBe(2));

    await user.click(screen.getByRole("button", { name: "Copiar clave" }));
    expect(writeText).toHaveBeenCalledWith(CLAVE_EN_CLARO);

    await user.click(screen.getByRole("button", { name: "Ya la guardé" }));
    await waitFor(() => expect(screen.queryByText(CLAVE_EN_CLARO)).not.toBeInTheDocument());

    const cache = JSON.stringify([
      queryClient.getQueryCache().getAll().map((q) => q.state),
      queryClient.getMutationCache().getAll().map((m) => m.state),
    ]);
    expect(cache).not.toContain(CLAVE_EN_CLARO);
    expect(JSON.stringify({ ...localStorage })).not.toContain(CLAVE_EN_CLARO);
  });

  it("crear sin nombre ni permisos no llama al backend", async () => {
    const user = userEvent.setup();
    const alta = vi.fn();
    mockLista([]);
    server.use(http.post("/api/integraciones/claves", () => {
      alta();
      return HttpResponse.json({}, { status: 201 });
    }));
    renderAdmin();
    await user.click(await screen.findByRole("button", { name: /nueva clave/i }));
    await user.click(screen.getByRole("button", { name: "Crear" }));
    expect(await screen.findByText("Ingresá un nombre para la clave.")).toBeInTheDocument();
    expect(screen.getByText("Elegí al menos un permiso.")).toBeInTheDocument();
    expect(alta).not.toHaveBeenCalled();
  });

  it("un 422 (API deshabilitada) muestra el mensaje del backend y deja el formulario abierto", async () => {
    const user = userEvent.setup();
    mockLista([]);
    server.use(
      http.post("/api/integraciones/claves", () =>
        HttpResponse.json({ statusCode: 422, message: "La API del cliente no está habilitada." }, { status: 422 }),
      ),
    );
    renderAdmin();
    await user.click(await screen.findByRole("button", { name: /nueva clave/i }));
    await user.type(screen.getByLabelText("Nombre"), "ERP");
    await user.click(screen.getByRole("checkbox", { name: "Ver tickets" }));
    await user.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("La API del cliente no está habilitada."));
    expect(screen.getByRole("heading", { name: "Nueva clave de API" })).toBeInTheDocument();
    expect(screen.queryByText("Clave creada")).not.toBeInTheDocument();
  });

  it("revocar pide confirmación y envía el DELETE con el id de la clave", async () => {
    const user = userEvent.setup();
    const revocadas: unknown[] = [];
    mockLista([clave({}), clave({ id: "k-2", nombre: "CRM" })]);
    server.use(
      http.delete("/api/integraciones/claves/:id", ({ params }) => {
        revocadas.push(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAdmin();
    await user.click(await screen.findByRole("button", { name: "Revocar CRM" }));

    expect(screen.getByText(/dejan de funcionar en el acto, y no se puede deshacer/i)).toBeInTheDocument();
    expect(revocadas).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Revocar" }));

    await waitFor(() => expect(revocadas).toEqual(["k-2"]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Clave revocada."));
  });

  it("si la lista falla, muestra el error", async () => {
    server.use(
      http.get("/api/integraciones/claves", () =>
        HttpResponse.json({ statusCode: 500, message: "boom" }, { status: 500 }),
      ),
    );
    renderAdmin();
    expect(await screen.findByText("No se pudieron cargar las claves.")).toBeInTheDocument();
  });
});
