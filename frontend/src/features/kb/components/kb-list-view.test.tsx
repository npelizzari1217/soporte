import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { KbListView } from "./kb-list-view";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/kb",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const ARTICULO_PUBLICO = {
  id: "a1",
  titulo: "Cómo resetear tu contraseña",
  contenido: "Pasos...",
  tipoTicketId: null,
  autorId: "u1",
  visibleParaSolicitante: true,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ARTICULO_INTERNO = {
  ...ARTICULO_PUBLICO,
  id: "a2",
  titulo: "Runbook interno de incidentes",
  visibleParaSolicitante: false,
};

function mockBackend(items = [ARTICULO_PUBLICO, ARTICULO_INTERNO]) {
  server.use(
    http.get("/api/kb", () => HttpResponse.json({ items, total: items.length, page: 1, pageSize: 10 })),
  );
}

describe("KbListView", () => {
  beforeEach(() => {
    pushMock.mockClear();
    replaceMock.mockClear();
    currentSearch = "";
    mockBackend();
  });

  it("renderiza badge «Interno» solo en artículos no publicados", async () => {
    renderWithProviders(<KbListView />, { user: buildUser({ permisos: ["ticket:ver_todos"] }) });
    await screen.findByText("Runbook interno de incidentes");

    const row = screen.getByText("Runbook interno de incidentes").closest("tr");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("Interno");

    const publicRow = screen.getByText("Cómo resetear tu contraseña").closest("tr");
    expect(publicRow).not.toHaveTextContent("Interno");
  });

  it("click en una fila navega al detalle del artículo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KbListView />, { user: buildUser({ permisos: [] }) });
    const row = await screen.findByText("Cómo resetear tu contraseña");
    await user.click(row);
    expect(pushMock).toHaveBeenCalledWith("/kb/a1");
  });

  it.each([
    ["con KB:ALTAS", ["KB:ALTAS"], true],
    ["sin KB:ALTAS", [], false],
  ])("botón «Nuevo artículo» — %s", async (_label, permisos, shouldShow) => {
    renderWithProviders(<KbListView />, { user: buildUser({ permisos }) });
    await screen.findByText("Cómo resetear tu contraseña");
    const button = screen.queryByRole("button", { name: /nuevo artículo/i });
    if (shouldShow) {
      expect(button).toBeInTheDocument();
    } else {
      expect(button).not.toBeInTheDocument();
    }
  });

  // El incidente que originó esto: 5 artículos, 10 por página y un `page=2`
  // pegado en la URL de una sesión anterior. La Ayuda aparecía vacía, se leyó
  // como "los datos no cargaron" y mandó a revisar la base de producción.
  it.each([
    ["`page=2` fuera de rango", "page=2"],
    ["búsqueda sin resultados", "busqueda=zzz"],
  ])("vacío con %s → se reporta como vacío POR FILTRO, no como falta de datos", async (_label, search) => {
    mockBackend([]);
    currentSearch = search;
    renderWithProviders(<KbListView />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByText(/sin resultados para los filtros aplicados/i)).toBeInTheDocument();
    expect(screen.queryByText(/todavía no hay artículos cargados/i)).not.toBeInTheDocument();
  });

  it("sin filtros y sin artículos → sigue mostrando el vacío de siempre, sin botón de limpiar", async () => {
    mockBackend([]);
    renderWithProviders(<KbListView />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByText("Sin artículos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).not.toBeInTheDocument();
  });

  it("«Limpiar filtros» deja la URL como recién entrado, incluida la página", async () => {
    mockBackend([]);
    currentSearch = "busqueda=zzz&page=2";
    const user = userEvent.setup();
    renderWithProviders(<KbListView />, { user: buildUser({ permisos: [] }) });

    await user.click(await screen.findByRole("button", { name: /limpiar filtros/i }));

    const calledWith = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(calledWith).toBe("/kb");
  });

  it("buscar por título commitea en Enter y actualiza la URL (searchParams)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KbListView />, { user: buildUser({ permisos: [] }) });
    await screen.findByText("Cómo resetear tu contraseña");

    await user.type(screen.getByRole("searchbox"), "contraseña{Enter}");

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const calledWith = replaceMock.mock.calls.at(-1)?.[0] as string;
    const params = new URLSearchParams(calledWith.split("?")[1]);
    expect(params.get("busqueda")).toBe("contraseña");
  });
});
