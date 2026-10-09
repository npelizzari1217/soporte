import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ReglasAsignacionAdminView } from "./reglas-asignacion-admin-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/admin/reglas-asignacion") }));

/**
 * ReglasAsignacionAdminView — R4/R5/R6: una fila por tipo con su estado, vacía
 * = sin regla (envía `null`), regla rota visible, solo candidatos del módulo,
 * fila deshabilitada durante el PUT y 422 que conserva la regla anterior.
 */
const ANA = { id: "u-ana", nombre: "Ana", apellido: "Gómez" };
const EVA = { id: "u-eva", nombre: "Eva", apellido: "Sosa" };
const LUIS = { id: "u-luis", nombre: "Luis", apellido: "Paz" };

function fila(over: Record<string, unknown>) {
  return {
    tipoId: "t-1",
    codigo: "INC",
    nombre: "Incidente",
    modulo: "SOPORTE",
    responsableId: null,
    responsableNombre: null,
    estado: "SIN_REGLA",
    ...over,
  };
}

function mockLista(reglas: unknown[]) {
  server.use(
    http.get("/api/reglas-asignacion", () =>
      HttpResponse.json({ reglas, candidatosPorModulo: { SOPORTE: [ANA, EVA], INSUMOS: [LUIS] } }),
    ),
  );
}

const admin = () => ({ user: buildUser({ rol: "ADMINISTRADOR" }) });

describe("ReglasAsignacionAdminView", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("un no administrador no ve la pantalla (R5)", async () => {
    mockLista([fila({})]);
    renderWithProviders(<ReglasAsignacionAdminView />, { user: buildUser({ rol: "TECNICO" }) });
    expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
    expect(screen.queryByText("Incidente")).not.toBeInTheDocument();
  });

  it("una fila por tipo con nombre, código, módulo y badge; vacía = Sin regla", async () => {
    mockLista([
      fila({}),
      fila({ tipoId: "t-2", codigo: "REQ", nombre: "Requerimiento", modulo: "INSUMOS", responsableId: LUIS.id, responsableNombre: "Luis Paz", estado: "VALIDA" }),
    ]);
    renderWithProviders(<ReglasAsignacionAdminView />, admin());

    await screen.findByText("Incidente");
    expect(screen.getByText("INC")).toBeInTheDocument();
    expect(screen.getByText("INSUMOS")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText(/nacen sin asignar/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Responsable de Incidente")).toHaveValue("");
    expect(screen.getByLabelText("Responsable de Requerimiento")).toHaveValue(LUIS.id);
  });

  it("solo ofrece los candidatos del módulo del tipo", async () => {
    mockLista([fila({})]);
    renderWithProviders(<ReglasAsignacionAdminView />, admin());
    const select = await screen.findByLabelText("Responsable de Incidente");
    expect(within(select).getByRole("option", { name: "Ana Gómez" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Luis Paz" })).not.toBeInTheDocument();
  });

  it.each([
    ["con nombre", "Marta Ríos", "Marta Ríos"],
    ["sin nombre", null, "Usuario no disponible"],
  ])("regla rota %s: badge, ayuda y responsable actual como opción deshabilitada", async (_l, nombre, esperado) => {
    mockLista([fila({ responsableId: "u-baja", responsableNombre: nombre, estado: "ROTA" })]);
    renderWithProviders(<ReglasAsignacionAdminView />, admin());
    await screen.findByText("Rota");
    expect(screen.getByText(/ya no es válido/i)).toBeInTheDocument();
    expect(within(screen.getByLabelText("Responsable de Incidente")).getByRole("option", { name: esperado })).toBeDisabled();
  });

  it("elegir un responsable envía el PUT y vaciar la fila envía null", async () => {
    const user = userEvent.setup();
    const cuerpos: unknown[] = [];
    mockLista([fila({ responsableId: ANA.id, responsableNombre: "Ana Gómez", estado: "VALIDA" })]);
    server.use(
      http.put("/api/reglas-asignacion/t-1", async ({ request }) => {
        cuerpos.push(await request.json());
        return HttpResponse.json(fila({}));
      }),
    );
    renderWithProviders(<ReglasAsignacionAdminView />, admin());
    const select = await screen.findByLabelText("Responsable de Incidente");
    await user.selectOptions(select, "Sin regla");
    await waitFor(() => expect(cuerpos).toEqual([{ responsableId: null }]));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("deshabilita la fila mientras corre el PUT", async () => {
    const user = userEvent.setup();
    let liberar: () => void = () => {};
    const espera = new Promise<void>((r) => (liberar = r));
    mockLista([fila({})]);
    server.use(
      http.put("/api/reglas-asignacion/t-1", async () => {
        await espera;
        return HttpResponse.json(fila({ responsableId: ANA.id, estado: "VALIDA" }));
      }),
    );
    renderWithProviders(<ReglasAsignacionAdminView />, admin());
    const select = await screen.findByLabelText("Responsable de Incidente");
    await user.selectOptions(select, "Ana Gómez");
    await waitFor(() => expect(select).toBeDisabled());
    liberar();
    await waitFor(() => expect(select).toBeEnabled());
  });

  it("un 422 muestra el toast y el selector vuelve a la regla anterior", async () => {
    const user = userEvent.setup();
    mockLista([fila({ responsableId: ANA.id, responsableNombre: "Ana Gómez", estado: "VALIDA" })]);
    server.use(
      http.put("/api/reglas-asignacion/t-1", () =>
        HttpResponse.json({ statusCode: 422, message: "El responsable no es elegible." }, { status: 422 }),
      ),
    );
    renderWithProviders(<ReglasAsignacionAdminView />, admin());
    const select = await screen.findByLabelText("Responsable de Incidente");
    await user.selectOptions(select, "Eva Sosa");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("El responsable no es elegible."));
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue(ANA.id);
  });
});
