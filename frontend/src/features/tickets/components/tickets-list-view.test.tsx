import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketsListView } from "./tickets-list-view";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/tickets",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const TICKET = {
  id: "t1",
  numero: "SOP-2026-0001",
  titulo: "Impresora rota",
  descripcion: null,
  tipoId: "ti1",
  estadoId: "e-nuevo",
  prioridadId: "p-alta",
  cicloId: null,
  ticketReferenciaId: null,
  solicitanteId: "u1",
  asignadoId: null,
  fechaCierre: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend() {
  server.use(
    http.get("/api/tickets", () =>
      HttpResponse.json({ items: [TICKET], total: 1, pagina: 1, porPagina: 10 }),
    ),
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([{ id: "ti1", codigo: "SOPORTE", nombre: "Soporte", activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([
        { id: "p-alta", codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" },
      ]),
    ),
    http.get("/api/catalogos/estados", () =>
      HttpResponse.json([
        { id: "e-nuevo", codigo: "NUEVO", nombre: "Nuevo", color: null, orden: 1, activo: true },
      ]),
    ),
    http.get("/api/usuarios", () => HttpResponse.json([])),
  );
}

describe("TicketsListView", () => {
  beforeEach(() => {
    pushMock.mockClear();
    replaceMock.mockClear();
    currentSearch = "";
    mockBackend();
  });

  it("resuelve estadoId/prioridadId a códigos vía catálogos y los renderiza como badges (G1)", async () => {
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["ticket:ver_todos"] }) });
    expect(await screen.findByText("Impresora rota")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Nuevo");
    expect(screen.getByTestId("priority-badge")).toHaveTextContent("Alta");
  });

  it("click en una fila navega al detalle del ticket", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["ticket:ver_todos"] }) });
    const row = await screen.findByText("Impresora rota");
    await user.click(row);
    expect(pushMock).toHaveBeenCalledWith("/tickets/t1");
  });

  it("elegir un filtro de estado actualiza la URL (searchParams) con el estado elegido y resetea a página 1", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos: ["ticket:ver_todos"] }) });
    await screen.findByText("Impresora rota");

    await user.selectOptions(screen.getByLabelText(/estado/i), "e-nuevo");

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const calledWith = replaceMock.mock.calls.at(-1)?.[0] as string;
    const params = new URLSearchParams(calledWith.split("?")[1]);
    expect(params.get("estado")).toBe("e-nuevo");
    expect(params.get("pagina")).toBe("1");
  });

  it.each([
    ["con ticket:crear", ["ticket:crear"], true],
    ["sin ticket:crear", [], false],
  ])("botón «Nuevo ticket» — %s", async (_label, permisos, shouldShow) => {
    renderWithProviders(<TicketsListView />, { user: buildUser({ permisos }) });
    await screen.findByText("Impresora rota");
    const button = screen.queryByRole("button", { name: /nuevo ticket/i });
    if (shouldShow) {
      expect(button).toBeInTheDocument();
    } else {
      expect(button).not.toBeInTheDocument();
    }
  });
});
