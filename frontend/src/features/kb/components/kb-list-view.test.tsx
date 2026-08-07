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
    ["con kb:gestionar", ["kb:gestionar"], true],
    ["sin kb:gestionar", [], false],
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
