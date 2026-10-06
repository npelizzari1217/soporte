import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ReporteStockView } from "./reporte-stock-view";
import ReporteStockPage from "../../../app/(dashboard)/insumos/reporte-stock/page";
import { formatearInstante } from "@/shared/lib/formato-fecha";

const replaceMock = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  usePathname: () => "/insumos/reporte-stock",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const FAMILIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GENERADO = "2026-10-01T12:00:00.000Z";
const LECTOR = buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] });

function fila(over: Record<string, unknown>) {
  return {
    insumoId: "i-1",
    codigo: "R-1",
    nombre: "Toner",
    activo: true,
    seguimiento: "NINGUNO",
    familia: { id: FAMILIA_ID, nombre: "Toners", esRepuesto: false },
    unidadMedida: { codigo: "UN", nombre: "Unidad", entera: true },
    saldos: { NUEVO: 3, USADO: 2, total: 5 },
    stockMinimo: 5,
    estadoReposicion: "BAJO_MINIMO",
    ...over,
  };
}

const FAMILIAS = [
  {
    id: FAMILIA_ID,
    codigo: "TON",
    nombre: "Toners",
    activo: true,
    esRepuesto: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

let queriesReporte: string[];
let filas: unknown[];

beforeEach(() => {
  replaceMock.mockClear();
  currentSearch = "";
  queriesReporte = [];
  filas = [fila({})];
  server.use(
    http.get("/api/insumos/reporte-stock", ({ request }) => {
      queriesReporte.push(new URL(request.url).search.replace(/^\?/, ""));
      return HttpResponse.json({ generadoEn: GENERADO, filas });
    }),
    http.get("/api/familias-insumo", () => HttpResponse.json(FAMILIAS)),
  );
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("ReporteStockView", () => {
  it("renderiza la tabla con las columnas del CSV y el instante de generación (R1, R2)", async () => {
    renderWithProviders(<ReporteStockView />, { user: LECTOR });

    expect(await screen.findByText("R-1")).toBeInTheDocument();
    expect(screen.getByText(`Generado el ${formatearInstante(GENERADO)}`)).toBeInTheDocument();
    for (const encabezado of [
      "Código",
      "Nombre",
      "Familia",
      "Tipo",
      "Unidad de medida",
      "Stock nuevo",
      "Stock usado",
      "Stock total",
      "Punto de reposición",
      "Estado de reposición",
      "Estado",
    ]) {
      expect(screen.getByRole("columnheader", { name: encabezado })).toBeInTheDocument();
    }
    expect(screen.getByText("Consumible")).toBeInTheDocument();
    expect(screen.getByText("Habilitado")).toBeInTheDocument();
  });

  it("no tiene ninguna columna ni texto de costo, precio o valor (R4)", async () => {
    renderWithProviders(<ReporteStockView />, { user: LECTOR });
    await screen.findByText("R-1");

    expect(screen.queryByText(/costo|precio|valor|monto|moneda/i)).not.toBeInTheDocument();
  });

  it("una recarga con la URL conserva familia y solo bajo mínimo, y los manda al backend (R7)", async () => {
    currentSearch = `familiaId=${FAMILIA_ID}&soloBajoMinimo=true`;
    renderWithProviders(<ReporteStockView />, { user: LECTOR });

    await screen.findByText("R-1");
    expect(queriesReporte).toContain(`familiaId=${FAMILIA_ID}&soloBajoMinimo=true`);
    expect(screen.getByLabelText("Solo bajo mínimo")).toBeChecked();
    expect(screen.getByLabelText("Ocultar sin stock")).not.toBeChecked();
    await waitFor(() => expect(screen.getByLabelText("Familia")).toHaveValue(FAMILIA_ID));
  });

  it("cambiar un filtro escribe la URL con el serializador compartido (R3, R7)", async () => {
    currentSearch = "soloBajoMinimo=true";
    const user = userEvent.setup();
    renderWithProviders(<ReporteStockView />, { user: LECTOR });
    await screen.findByText("R-1");

    await user.click(screen.getByLabelText("Ocultar sin stock"));
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/insumos/reporte-stock?soloBajoMinimo=true&ocultarSinStock=true",
    );

    await user.selectOptions(screen.getByLabelText("Tipo"), "true");
    expect(replaceMock).toHaveBeenLastCalledWith("/insumos/reporte-stock?esRepuesto=true&soloBajoMinimo=true");
  });

  it('"Exportar → CSV" pide el mismo query string que la consulta (R3, R6)', async () => {
    currentSearch = `familiaId=${FAMILIA_ID}&esRepuesto=false&ocultarSinStock=true`;
    let urlExport = "";
    server.use(
      http.get("/api/insumos/reporte-stock/export", ({ request }) => {
        urlExport = request.url;
        return new HttpResponse("Codigo\n", {
          headers: { "content-type": "text/csv; charset=utf-8" },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReporteStockView />, { user: LECTOR });
    await screen.findByText("R-1");

    await user.click(screen.getByRole("button", { name: "Exportar" }));
    await user.click(await screen.findByRole("menuitem", { name: "CSV" }));

    await waitFor(() => expect(urlExport).not.toBe(""));
    const qsExport = new URL(urlExport).search.replace(/^\?/, "");
    expect(qsExport).toBe(`familiaId=${FAMILIA_ID}&esRepuesto=false&ocultarSinStock=true`);
    expect(queriesReporte).toContain(qsExport);
  });

  it("un saldo negativo se resalta y la fila sigue presente (R8)", async () => {
    filas = [
      fila({
        insumoId: "i-2",
        codigo: "NEG-1",
        saldos: { NUEVO: -3, USADO: 0, total: -3 },
        stockMinimo: null,
        estadoReposicion: "SIN_PUNTO_DEFINIDO",
      }),
    ];
    renderWithProviders(<ReporteStockView />, { user: LECTOR });

    const celdaFila = (await screen.findByText("NEG-1")).closest("tr") as HTMLElement;
    const negativos = within(celdaFila).getAllByText("-3");
    expect(negativos).toHaveLength(2);
    for (const negativo of negativos) expect(negativo).toHaveClass("text-destructive");
    expect(within(celdaFila).getByText("0")).not.toHaveClass("text-destructive");
  });

  it("unidad entera sin decimales y fraccionaria con dos (R8)", async () => {
    filas = [
      fila({ insumoId: "i-3", codigo: "ENT-1", saldos: { NUEVO: 3, USADO: 0, total: 3 } }),
      fila({
        insumoId: "i-4",
        codigo: "FRA-1",
        unidadMedida: { codigo: "M", nombre: "Metro", entera: false },
        saldos: { NUEVO: 2.5, USADO: 0, total: 2.5 },
      }),
    ];
    renderWithProviders(<ReporteStockView />, { user: LECTOR });

    const entera = (await screen.findByText("ENT-1")).closest("tr") as HTMLElement;
    const fraccionaria = screen.getByText("FRA-1").closest("tr") as HTMLElement;
    expect(within(entera).getAllByText("3").length).toBeGreaterThan(0);
    expect(within(entera).queryByText("3,00")).not.toBeInTheDocument();
    expect(within(fraccionaria).getAllByText("2,50").length).toBeGreaterThan(0);
  });

  it("BAJO_MINIMO se resalta con badge destructivo (R2)", async () => {
    renderWithProviders(<ReporteStockView />, { user: LECTOR });

    const badge = await screen.findByText("Hay que reponer");
    expect(badge.className).toMatch(/destructive/);
  });

  it("sin punto de reposición muestra guion y su estado (R2)", async () => {
    filas = [fila({ stockMinimo: null, estadoReposicion: "SIN_PUNTO_DEFINIDO" })];
    renderWithProviders(<ReporteStockView />, { user: LECTOR });

    expect(await screen.findByText("Sin punto de reposición definido")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("ReporteStockPage — acceso por URL", () => {
  it("sin INSUMOS:LECTURA muestra el fallback y no pide el reporte (R7)", async () => {
    renderWithProviders(<ReporteStockPage />, { user: buildUser({ permisos: [], modulos: ["INSUMOS"] }) });

    expect(await screen.findByText(/no tenés permiso para ver el reporte de stock/i)).toBeInTheDocument();
    expect(queriesReporte).toHaveLength(0);
  });

  it("con INSUMOS:LECTURA renderiza el reporte (R7)", async () => {
    renderWithProviders(<ReporteStockPage />, { user: LECTOR });

    expect(await screen.findByText("R-1")).toBeInTheDocument();
  });
});
