import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComprasListView } from "./compras-list-view";
import type { CompraListItem } from "../types";
import type { TipoTicket } from "@/features/tickets/types";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/compras",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const COMPRA: CompraListItem = {
  id: "c1",
  numero: "COM-2026-00001",
  fechaSolicitud: "2026-01-15",
  motivo: "Reposición de insumos",
  tipoTicket: { id: "11111111-1111-4111-8111-111111111111", nombre: "Soporte" },
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

  // Migrado de WU-30 ("destildar 'Solo en curso' -> soloEnCurso=false"): el
  // checkbox binario pasó a ser un select de cuatro grupos (WU-25), pero el
  // comportamiento protegido es el mismo — el filtro viaja en la URL, no en
  // estado local, y resetea la paginación.
  it("WU-25: elegir un grupo de estado viaja en la URL y resetea la paginación a 1", async () => {
    server.use(
      http.get("/api/compras", () =>
        HttpResponse.json({ items: [COMPRA], total: 1, pagina: 1, porPagina: 10 }),
      ),
      http.get("/api/sectores", () => HttpResponse.json([])),
    );
    currentSearch = "pagina=3";
    const user = userEvent.setup();
    renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });
    await screen.findByText(COMPRA.numero);

    await user.selectOptions(screen.getByLabelText(/estado/i), "COMPLETADAS");

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const calledWith = replaceMock.mock.calls.at(-1)?.[0] as string;
    const params = new URLSearchParams(calledWith.split("?")[1]);
    expect(params.get("estado")).toBe("COMPLETADAS");
    expect(params.get("pagina")).toBe("1");
  });

  it("sin `estado` en la URL el select muestra 'Activas' y ESO es lo que se le pide al servidor", async () => {
    let urlPedida = "";
    server.use(
      http.get("/api/compras", ({ request }) => {
        urlPedida = request.url;
        return HttpResponse.json({ items: [COMPRA], total: 1, pagina: 1, porPagina: 10 });
      }),
      http.get("/api/sectores", () => HttpResponse.json([])),
    );
    renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });
    await screen.findByText(COMPRA.numero);

    expect(screen.getByLabelText(/estado/i)).toHaveValue("ACTIVAS");
    expect(new URL(urlPedida).searchParams.get("estado")).toBe("ACTIVAS");
  });

  describe("vacío por filtro vs. vacío por falta de datos", () => {
    function mockVacio() {
      server.use(
        http.get("/api/compras", () =>
          HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 10 }),
        ),
        http.get("/api/sectores", () => HttpResponse.json([])),
      );
    }

    it.each([
      // `pagina > 1` cuenta como filtro: es el caso que mordió en producción
      // — pocas filas, una página vieja pegada en la URL, vacío para siempre.
      ["`pagina=3` fuera de rango", "pagina=3"],
      ["un grupo de estado distinto del default", "estado=CANCELADAS"],
      ["un sector elegido", "sectorId=s1"],
      ["un tipo elegido", "tipoTicketId=11111111-1111-4111-8111-111111111111"],
      ["un rango de fechas", "fechaDesde=2026-01-01"],
    ])("vacío con %s → se reporta como vacío POR FILTRO", async (_label, search) => {
      mockVacio();
      currentSearch = search;
      renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });

      expect(await screen.findByText(/sin resultados para los filtros aplicados/i)).toBeInTheDocument();
      expect(screen.queryByText(/todavía no hay solicitudes de compra/i)).not.toBeInTheDocument();
    });

    it("sin filtros (el estado por defecto NO cuenta) → vacío de siempre, sin botón de limpiar", async () => {
      mockVacio();
      currentSearch = "estado=ACTIVAS";
      renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });

      expect(await screen.findByText("Sin compras")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /limpiar filtros/i })).not.toBeInTheDocument();
    });

    it("«Limpiar filtros» deja la URL como recién entrado, incluida la página", async () => {
      mockVacio();
      currentSearch = "estado=TODAS&sectorId=s1&fechaDesde=2026-01-01&pagina=3";
      const user = userEvent.setup();
      renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });

      await user.click(await screen.findByRole("button", { name: /limpiar filtros/i }));

      expect(replaceMock.mock.calls.at(-1)?.[0]).toBe("/compras");
    });
  });

  it("la API falla -> ErrorState con retry, sin romper la vista", async () => {
    server.use(http.get("/api/compras", () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las compras.");
  });

  // render-fechas-frontend: `Compra.fechaSolicitud` es @db.Date. La columna
  // usaba `aFechaInput` (normalizador de INPUT) y mostraba el ISO crudo.
  // Literal fijo, NO derivado de `Intl` — y un caso explícito de que el día
  // no se corre (la trampa clásica de parsear con `Date` al oeste de UTC).
  it("la columna Fecha muestra dd/mm/yyyy, nunca el ISO crudo ni corre el día", async () => {
    server.use(
      http.get("/api/compras", () =>
        HttpResponse.json({
          items: [{ ...COMPRA, fechaSolicitud: "2026-08-17" }],
          total: 1,
          pagina: 1,
          porPagina: 10,
        }),
      ),
    );
    renderWithProviders(<ComprasListView />, { user: buildUser({ modulos: ["COMPRAS"] }) });

    expect(await screen.findByText("17/08/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-17")).not.toBeInTheDocument();
    expect(screen.queryByText("16/08/2026")).not.toBeInTheDocument();
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

  describe("tipo de ticket (odd/compras-por-tipo, S5)", () => {
    const TIPO_SOPORTE_ID = "11111111-1111-4111-8111-111111111111";
    const TIPO_EDILICIA_ID = "22222222-2222-4222-8222-222222222222";
    const TIPO_COMPRAS_ID = "33333333-3333-4333-8333-333333333333";

    function tipo(id: string, codigo: string, nombre: string, modulo: TipoTicket["modulo"]): TipoTicket {
      return { id, codigo, nombre, modulo, activo: true, createdAt: "", updatedAt: "" };
    }

    const TIPOS: TipoTicket[] = [
      tipo(TIPO_SOPORTE_ID, "SOPORTE", "Soporte", "TICKETS"),
      tipo(TIPO_EDILICIA_ID, "EDILICIA", "Edilicia", "EDILICIA"),
      tipo(TIPO_COMPRAS_ID, "COMPRA", "Compra general", "COMPRAS"),
    ];

    /** LECTURA en Soporte y Compra general; Edilicia sin ninguna acción. */
    const PERMISOS = permisosDeTest({
      [TIPO_SOPORTE_ID]: ["LECTURA", "ALTAS"],
      [TIPO_COMPRAS_ID]: ["LECTURA"],
    });

    const tecnico = buildUser({ rol: "TECNICO", modulos: ["COMPRAS"] });

    let urlsPedidas: string[];

    beforeEach(() => {
      urlsPedidas = [];
      server.use(
        http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json(TIPOS)),
        http.get("/api/sectores", () => HttpResponse.json([])),
        http.get("/api/compras", ({ request }) => {
          urlsPedidas.push(request.url);
          return HttpResponse.json({
            items: [
              COMPRA,
              { ...COMPRA, id: "c2", numero: "COM-2026-00002", motivo: "Sin clasificar", tipoTicket: null },
            ],
            total: 2,
            pagina: 1,
            porPagina: 10,
          });
        }),
      );
    });

    it("la columna Tipo muestra el nombre del tipo, o «Sin tipo» si la compra no tiene", async () => {
      renderConPermisos(<ComprasListView />, { user: tecnico, permisos: PERMISOS });

      const filaSinTipo = (await screen.findByText("COM-2026-00002")).closest("tr");
      const filaConTipo = screen.getByText(COMPRA.numero).closest("tr");
      expect(filaSinTipo).toHaveTextContent("Sin tipo");
      expect(filaConTipo).toHaveTextContent("Soporte");
      expect(filaConTipo).not.toHaveTextContent("Sin tipo");
    });

    it("el filtro ofrece solo los tipos con LECTURA para la sesión", async () => {
      renderConPermisos(<ComprasListView />, { user: tecnico, permisos: PERMISOS });

      const filtro = await screen.findByLabelText("Tipo");
      await within(filtro).findByRole("option", { name: "Soporte" });
      expect(within(filtro).getByRole("option", { name: "Compra general" })).toBeInTheDocument();
      expect(within(filtro).queryByRole("option", { name: "Edilicia" })).not.toBeInTheDocument();
    });

    it("elegir un tipo viaja en la URL y resetea la paginación a 1", async () => {
      currentSearch = "pagina=3";
      const user = userEvent.setup();
      renderConPermisos(<ComprasListView />, { user: tecnico, permisos: PERMISOS });

      const filtro = await screen.findByLabelText("Tipo");
      await within(filtro).findByRole("option", { name: "Soporte" });
      await user.selectOptions(filtro, TIPO_SOPORTE_ID);

      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      const calledWith = replaceMock.mock.calls.at(-1)?.[0] as string;
      const params = new URLSearchParams(calledWith.split("?")[1]);
      expect(params.get("tipoTicketId")).toBe(TIPO_SOPORTE_ID);
      expect(params.get("pagina")).toBe("1");
    });

    it("con un tipo en la URL, GET /compras lo manda como tipoTicketId y el filtro lo muestra", async () => {
      currentSearch = `tipoTicketId=${TIPO_SOPORTE_ID}`;
      renderConPermisos(<ComprasListView />, { user: tecnico, permisos: PERMISOS });

      await screen.findByText(COMPRA.numero);
      expect(new URL(urlsPedidas.at(-1) ?? "").searchParams.get("tipoTicketId")).toBe(TIPO_SOPORTE_ID);
      await within(screen.getByLabelText("Tipo")).findByRole("option", { name: "Soporte" });
      expect(screen.getByLabelText("Tipo")).toHaveValue(TIPO_SOPORTE_ID);
    });

    it("un tipo de la URL fuera del catálogo se muestra como no disponible, no como «Todos los tipos»", async () => {
      currentSearch = `tipoTicketId=${TIPO_EDILICIA_ID}`;
      renderConPermisos(<ComprasListView />, { user: tecnico, permisos: PERMISOS });

      const filtro = await screen.findByLabelText("Tipo");
      await within(filtro).findByRole("option", { name: "Tipo no disponible" });
      expect(filtro).toHaveValue(TIPO_EDILICIA_ID);
    });

    it("la exportación lleva el mismo filtro de tipo que el listado", async () => {
      let urlExportada = "";
      server.use(
        http.get("/api/compras/export", ({ request }) => {
          urlExportada = request.url;
          return new HttpResponse("numero,motivo\n", {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": 'attachment; filename="compras.csv"',
            },
          });
        }),
      );
      URL.createObjectURL = vi.fn(() => "blob:mock");
      URL.revokeObjectURL = vi.fn();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      currentSearch = `tipoTicketId=${TIPO_SOPORTE_ID}`;
      const user = userEvent.setup();
      renderConPermisos(<ComprasListView />, { user: tecnico, permisos: PERMISOS });

      await screen.findByText(COMPRA.numero);
      await user.click(screen.getByRole("button", { name: /^exportar$/i }));
      await user.click(await screen.findByRole("menuitem", { name: "CSV" }));

      await waitFor(() => expect(urlExportada).not.toBe(""));
      expect(new URL(urlExportada).searchParams.get("tipoTicketId")).toBe(TIPO_SOPORTE_ID);
      clickSpy.mockRestore();
    });
  });
});
