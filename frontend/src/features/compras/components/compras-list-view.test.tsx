import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComprasListView } from "./compras-list-view";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/compras",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const COMPRA: {
  id: string;
  numero: string;
  fechaSolicitud: string;
  motivo: string;
  estado: "PENDIENTE" | "APROBADO" | "APROBADO_PARCIALMENTE" | "RECHAZADO" | "CANCELADO";
  comprado: boolean;
  cerrado: boolean;
  totalesPorMoneda: Record<string, number>;
} = {
  id: "c1",
  numero: "COM-2026-00001",
  fechaSolicitud: "2026-01-15",
  motivo: "Reposición de insumos",
  estado: "PENDIENTE",
  comprado: false,
  cerrado: false,
  totalesPorMoneda: { ARS: 1000 },
};

describe("ComprasListView", () => {
  beforeEach(() => {
    pushMock.mockClear();
    replaceMock.mockClear();
    currentSearch = "";
  });

  it("calcula la cantidad de páginas a partir de `total` de la respuesta, NO del largo de `items` (requisito duro)", async () => {
    // 1 item en la página, pero `total: 25` -> con porPagina=10 son 3 páginas.
    // Si el componente derivara la paginación de `items.length` (=1), mostraría "Página 1 de 1".
    server.use(
      http.get("/api/compras", () =>
        HttpResponse.json({ items: [COMPRA], total: 25, pagina: 1, porPagina: 10 }),
      ),
    );
    renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });

    expect(await screen.findByText("Página 1 de 3")).toBeInTheDocument();
  });

  it("ir a la página siguiente actualiza la URL (searchParams) con `pagina=2`", async () => {
    server.use(
      http.get("/api/compras", () =>
        HttpResponse.json({ items: [COMPRA], total: 25, pagina: 1, porPagina: 10 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });
    await screen.findByText(COMPRA.numero);

    await user.click(screen.getByRole("button", { name: /siguiente/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const calledWith = replaceMock.mock.calls.at(-1)?.[0] as string;
    const params = new URLSearchParams(calledWith.split("?")[1]);
    expect(params.get("pagina")).toBe("2");
  });

  it("la API falla -> ErrorState con retry, sin romper la vista", async () => {
    server.use(http.get("/api/compras", () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las compras.");
  });

  it("click en una fila navega al detalle de la compra", async () => {
    server.use(
      http.get("/api/compras", () =>
        HttpResponse.json({ items: [COMPRA], total: 1, pagina: 1, porPagina: 10 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });

    const row = await screen.findByText(COMPRA.numero);
    await user.click(row);

    expect(pushMock).toHaveBeenCalledWith("/compras/c1");
  });

  it.each([
    { permisos: ["COMPRAS:ALTAS"], visible: true },
    { permisos: [], visible: false },
  ])(
    "gate de permiso del alta: permisos=$permisos → trigger 'Nueva compra' visible=$visible",
    ({ permisos, visible }) => {
      server.use(
        http.get("/api/compras", () =>
          HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 10 }),
        ),
      );
      renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"], permisos }) });

      if (visible) {
        expect(screen.getByRole("button", { name: /nueva compra/i })).toBeInTheDocument();
      } else {
        expect(screen.queryByRole("button", { name: /nueva compra/i })).not.toBeInTheDocument();
      }
    },
  );
});
