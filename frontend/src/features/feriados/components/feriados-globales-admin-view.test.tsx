import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { FERIADO_DESCRIPCION_MAX_LENGTH } from "../limites";
import { FeriadosGlobalesAdminView } from "./feriados-globales-admin-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const FERIADO_ENERO = { id: "f1", fecha: "2026-01-01", descripcion: "Año Nuevo" };
const FERIADO_MAYO = { id: "f2", fecha: "2026-05-01", descripcion: "Día del Trabajador" };

function mockBackend() {
  // El backend ya ordena por fecha asc (D8, design.md); estos fixtures se
  // mandan fuera de orden para probar que la pantalla NO reordena — renderiza
  // tal cual llega.
  server.use(http.get("/api/feriados", () => HttpResponse.json([FERIADO_ENERO, FERIADO_MAYO])));
}

// El almanaque (WU3, sdd/feriados-almanaque) es la vista por defecto y abre
// en el mes de "hoy" (`hoyFechaCalendario`, offset fijo Argentina) — fijo el
// reloj en enero 2026 para todo el archivo, mismo mes que `FERIADO_ENERO`,
// mismo criterio que `feriados-list-view.test.tsx`.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Pasa de la vista por defecto (almanaque) a la tabla existente. */
async function irAListaView(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: /ver como lista/i }));
}

describe("FeriadosGlobalesAdminView (sdd/feriados-configurables)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it.each([
    ["ROOT (is_global_admin)", true, [], true],
    ["ADMINISTRADOR de tenant sin is_global_admin", false, [], false],
  ])("gate de acceso a /admin/feriados-globales es por is_global_admin, NUNCA por permisos — %s", async (_label, isGlobalAdmin, permisos, shouldShowContent) => {
    const user = userEvent.setup();
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ permisos, is_global_admin: isGlobalAdmin }) });

    if (shouldShowContent) {
      await irAListaView(user);
      await screen.findByText("Año Nuevo");
    } else {
      expect(await screen.findByText(/solo.*root/i)).toBeInTheDocument();
      expect(screen.queryByText("Año Nuevo")).not.toBeInTheDocument();
    }
  });

  it("renderiza la lista ordenada por fecha (tal cual la manda el backend), cada fila con el badge verde de origen", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await irAListaView(user);

    await screen.findByText("Año Nuevo");
    const filas = screen.getAllByRole("row").slice(1); // descarta el header
    expect(filas[0]).toHaveTextContent("Año Nuevo");
    expect(filas[1]).toHaveTextContent("Día del Trabajador");

    const badges = screen.getAllByTestId("origen-feriado-badge");
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge).toHaveTextContent("Nacional");
    }
  });

  it("muestra la fecha en formato dd/mm/yyyy, nunca el ISO crudo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await irAListaView(user);

    await screen.findByText("Año Nuevo");
    expect(screen.getByText("01/01/2026")).toBeInTheDocument();
    expect(screen.getByText("01/05/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-01-01")).not.toBeInTheDocument();
  });

  it("lista vacía muestra el estado vacío, no un error", async () => {
    server.use(http.get("/api/feriados", () => HttpResponse.json([])));
    const user = userEvent.setup();
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await irAListaView(user);

    expect(await screen.findByText("Sin feriados nacionales")).toBeInTheDocument();
  });

  // --- Escritura: crear/editar/eliminar ---

  it("crear feriado envía el DTO correcto a POST /feriados y muestra el toast de éxito", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/feriados", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "f3", ...capturedBody }, { status: 201 });
      }),
    );

    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByRole("grid", { name: /almanaque de feriados/i });

    await user.click(screen.getByRole("button", { name: /nuevo feriado/i }));
    await user.type(screen.getByLabelText(/^fecha$/i), "2026-12-25");
    await user.type(screen.getByLabelText(/^descripción$/i), "Navidad");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(capturedBody).toEqual({ fecha: "2026-12-25", descripcion: "Navidad" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Feriado creado."));
  });

  it("editar feriado confirma con PATCH /feriados/:id y muestra el toast de éxito", async () => {
    const user = userEvent.setup();
    let patchCalled = false;
    server.use(
      http.patch("/api/feriados/f1", async ({ request }) => {
        patchCalled = true;
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...FERIADO_ENERO, ...body });
      }),
    );

    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await irAListaView(user);
    await screen.findByText("Año Nuevo");

    const editarButtons = await screen.findAllByRole("button", { name: "Editar" });
    await user.click(editarButtons[0]!);
    const descripcionInput = await screen.findByLabelText(/^descripción$/i);
    await user.clear(descripcionInput);
    await user.type(descripcionInput, "Año Nuevo (renombrado)");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(patchCalled).toBe(true));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Feriado actualizado."));
  });

  it("eliminar feriado confirma en el diálogo, dispara el DELETE y muestra el toast de éxito", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;
    server.use(
      http.delete("/api/feriados/f1", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await irAListaView(user);
    await screen.findByText("Año Nuevo");

    const eliminarButtons = await screen.findAllByRole("button", { name: "Eliminar" });
    await user.click(eliminarButtons[0]!);
    const confirmButtons = await screen.findAllByRole("button", { name: "Eliminar" });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Feriado eliminado."));
  });

  it("el diálogo rechaza una descripción vacía y una que supera el tope, sin llamar al backend", async () => {
    const user = userEvent.setup();
    let postCalled = false;
    server.use(http.post("/api/feriados", () => {
      postCalled = true;
      return HttpResponse.json({}, { status: 201 });
    }));

    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByRole("grid", { name: /almanaque de feriados/i });

    await user.click(screen.getByRole("button", { name: /nuevo feriado/i }));
    await user.type(screen.getByLabelText(/^fecha$/i), "2026-12-25");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByText("La descripción es requerida")).toBeInTheDocument();

    const descripcionInput = screen.getByLabelText(/^descripción$/i);
    await user.type(descripcionInput, "a".repeat(FERIADO_DESCRIPCION_MAX_LENGTH + 1));
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(
      await screen.findByText(`La descripción no puede superar los ${FERIADO_DESCRIPCION_MAX_LENGTH} caracteres`),
    ).toBeInTheDocument();
    expect(postCalled).toBe(false);
  });

  // `<input type="date">` (HTML5) nunca deja pasar un formato inválido, así
  // que el regex de `feriadoSchema` ya está cubierto a nivel unitario
  // (`schemas.test.ts`); acá se prueba lo alcanzable desde este input: vacío.
  it("el diálogo rechaza una fecha vacía, sin llamar al backend", async () => {
    const user = userEvent.setup();
    let postCalled = false;
    server.use(http.post("/api/feriados", () => {
      postCalled = true;
      return HttpResponse.json({}, { status: 201 });
    }));

    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByRole("grid", { name: /almanaque de feriados/i });

    await user.click(screen.getByRole("button", { name: /nuevo feriado/i }));
    await user.type(screen.getByLabelText(/^descripción$/i), "Navidad");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByText("La fecha es requerida")).toBeInTheDocument();
    expect(postCalled).toBe(false);
  });

  it("un 422 de fecha duplicada muestra el mensaje EXACTO del backend en el toast de error", async () => {
    const user = userEvent.setup();
    const MENSAJE_BACKEND = 'Ya existe un feriado registrado para la fecha "2026-01-01".';
    server.use(
      http.post("/api/feriados", () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByRole("grid", { name: /almanaque de feriados/i });

    await user.click(screen.getByRole("button", { name: /nuevo feriado/i }));
    await user.type(screen.getByLabelText(/^fecha$/i), "2026-01-01");
    await user.type(screen.getByLabelText(/^descripción$/i), "Año Nuevo");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
  });

  // El 422 "fecha de calendario inválida" no es alcanzable desde este
  // diálogo (ver `use-feriados-globales-admin-mutations.test.tsx`).
});

// Almanaque (WU3, sdd/feriados-almanaque): vista por defecto de
// `/admin/feriados-globales`. A diferencia de `FeriadosListView`, acá TODAS
// las filas son GLOBAL — ROOT es el único usuario de esta pantalla, sin el
// filtro por origen que sí necesita la pantalla de cliente.
describe("FeriadosGlobalesAdminView — almanaque (WU3, sdd/feriados-almanaque)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("el almanaque es la vista por defecto; el toggle muestra la tabla y vuelve", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });

    expect(await screen.findByRole("grid", { name: /almanaque de feriados/i })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ver como lista/i }));
    expect(await screen.findByText("Año Nuevo")).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: /almanaque de feriados/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ver como almanaque/i }));
    expect(await screen.findByRole("grid", { name: /almanaque de feriados/i })).toBeInTheDocument();
  });

  it("el panel muestra Editar/Eliminar para un feriado global seleccionado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByRole("grid", { name: /almanaque de feriados/i });

    await user.click(screen.getByRole("gridcell", { name: "01/01/2026, feriado: Año Nuevo" }));
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  // WU3: un día LIBRE del almanaque abre el mismo alta que "Nuevo feriado",
  // con `fecha` precargada — nunca vía `new Date()`, el `YYYY-MM-DD`
  // clickeado llega tal cual desde `AlmanaqueFeriados`.
  it("clickear un día libre abre el alta con la fecha precargada, y crear dispara POST /feriados", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/feriados", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "f3", ...capturedBody }, { status: 201 });
      }),
    );

    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByRole("grid", { name: /almanaque de feriados/i });

    await user.click(screen.getByRole("gridcell", { name: "20/01/2026" })); // día libre
    expect(await screen.findByLabelText(/^fecha$/i)).toHaveValue("2026-01-20");

    await user.type(screen.getByLabelText(/^descripción$/i), "Feriado nuevo desde el almanaque");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({ fecha: "2026-01-20", descripcion: "Feriado nuevo desde el almanaque" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Feriado creado."));
    await waitFor(() => expect(screen.queryByLabelText(/^fecha$/i)).not.toBeInTheDocument());
  });
});
