import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { InsumosListView } from "./insumos-list-view";
import type { FamiliaInsumo, Insumo, UnidadMedida } from "../types";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  pushMock.mockClear();
});

/**
 * El fixture trae los DOS estados a propósito: un insumo habilitado y uno
 * deshabilitado. Con un solo estado, el assert de "el deshabilitado se
 * distingue" pasaría por construcción — es la forma 2 de verde falso que
 * documenta el `AGENTS.md` (assert de ausencia sobre un fixture que no
 * contiene el caso).
 */
const INSUMO_HABILITADO: Insumo = {
  id: "11111111-1111-1111-1111-111111111111",
  codigo: "TON-001",
  nombre: "Tóner negro HP 26A",
  familiaId: "fam-1",
  unidadMedidaId: "um-1",
  stockMinimo: 5,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const INSUMO_DESHABILITADO: Insumo = {
  id: "22222222-2222-2222-2222-222222222222",
  codigo: "CAB-009",
  nombre: "Cable de red categoría 5",
  familiaId: "fam-2",
  unidadMedidaId: "um-2",
  stockMinimo: null,
  activo: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const FAMILIAS: FamiliaInsumo[] = [
  {
    id: "fam-1",
    codigo: "CONSUMIBLES",
    nombre: "Consumibles de impresión",
    activo: true,
    esRepuesto: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "fam-2",
    codigo: "CABLEADO",
    nombre: "Cableado de red",
    activo: true,
    esRepuesto: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const UNIDADES: UnidadMedida[] = [
  {
    id: "um-1",
    codigo: "UN",
    nombre: "Unidad",
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "um-2",
    codigo: "M",
    nombre: "Metro",
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/** Los tres endpoints resuelven bien: el caso normal. */
function mockCatalogos(insumos: Insumo[]): void {
  server.use(
    http.get("/api/insumos", () => HttpResponse.json(insumos)),
    http.get("/api/familias-insumo", () => HttpResponse.json(FAMILIAS)),
    http.get("/api/unidades-medida", () => HttpResponse.json(UNIDADES)),
  );
}

const LECTOR = buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] });

describe("InsumosListView — listado del catálogo", () => {
  it("muestra el código y el nombre de cada insumo que devuelve el endpoint", async () => {
    mockCatalogos([INSUMO_HABILITADO, INSUMO_DESHABILITADO]);
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    expect(await screen.findByText("TON-001")).toBeInTheDocument();
    expect(screen.getByText("Tóner negro HP 26A")).toBeInTheDocument();
    expect(screen.getByText("CAB-009")).toBeInTheDocument();
    expect(screen.getByText("Cable de red categoría 5")).toBeInTheDocument();
  });

  it("sin insumos en el catálogo → muestra el estado vacío", async () => {
    mockCatalogos([]);
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    expect(await screen.findByText(/sin insumos/i)).toBeInTheDocument();
  });

  it("el endpoint falla → muestra el error, no un catálogo vacío", async () => {
    server.use(
      http.get("/api/insumos", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/familias-insumo", () => HttpResponse.json(FAMILIAS)),
      http.get("/api/unidades-medida", () => HttpResponse.json(UNIDADES)),
    );
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    expect(await screen.findByText(/no se pudieron cargar los insumos/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin insumos/i)).not.toBeInTheDocument();
  });

  it("el insumo deshabilitado se distingue del habilitado en la misma tabla", async () => {
    mockCatalogos([INSUMO_HABILITADO, INSUMO_DESHABILITADO]);
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    await screen.findByText("TON-001");
    // Un estado por fila, y distintos entre sí: si el render ignorara `activo`
    // las dos filas dirían lo mismo y estos conteos no cerrarían.
    expect(screen.getAllByText("Habilitado")).toHaveLength(1);
    expect(screen.getAllByText("Deshabilitado")).toHaveLength(1);
  });
});

/**
 * Las columnas Familia y Unidad de medida resuelven un id contra otro catálogo,
 * y ahí vale la lección de la clase "select con valor fuera de catálogo" del
 * `AGENTS.md`: la AUSENCIA del id solo prueba algo cuando la lista YA resolvió.
 * Los tres estados tienen que verse DISTINTO, o la pantalla acusa de eliminado
 * a un valor que está sano y todavía no llegó.
 */
describe("InsumosListView — resolución de familia y unidad de medida", () => {
  it("catálogos resueltos y el id está → muestra el nombre, no el id", async () => {
    mockCatalogos([INSUMO_HABILITADO]);
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    expect(await screen.findByText("Consumibles de impresión")).toBeInTheDocument();
    expect(screen.getByText("Unidad")).toBeInTheDocument();
    expect(screen.queryByText("fam-1")).not.toBeInTheDocument();
    expect(screen.queryByText("um-1")).not.toBeInTheDocument();
  });

  /**
   * El catálogo responde BIEN y aun así no trae el id: es la única forma de
   * probar la ausencia sin disfrazar un error de red de "no encontrado".
   */
  it("catálogos resueltos y el id NO está → dice que quedó fuera del catálogo", async () => {
    const huerfano: Insumo = { ...INSUMO_HABILITADO, familiaId: "fam-borrada", unidadMedidaId: "um-borrada" };
    mockCatalogos([huerfano]);
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    await screen.findByText("TON-001");
    await waitFor(() => expect(screen.getAllByText(/fuera del catálogo/i)).toHaveLength(2));
    expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument();
  });

  /**
   * Caso hermano invertido del anterior, y el que de verdad importa: con los
   * catálogos EN VUELO, la celda no puede leerse como "no tiene familia". El
   * insumo del fixture apunta a una familia que existe y llega más tarde.
   */
  it("catálogos todavía cargando → muestra un placeholder de carga, NO ausencia", async () => {
    server.use(
      http.get("/api/insumos", () => HttpResponse.json([INSUMO_HABILITADO])),
      http.get("/api/familias-insumo", async () => {
        await delay("infinite");
        return HttpResponse.json(FAMILIAS);
      }),
      http.get("/api/unidades-medida", async () => {
        await delay("infinite");
        return HttpResponse.json(UNIDADES);
      }),
    );
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    await screen.findByText("TON-001");
    expect(screen.getAllByText(/cargando/i)).toHaveLength(2);
    expect(screen.queryByText(/fuera del catálogo/i)).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("los catálogos fallan → lo dice, sin acusar al insumo de estar fuera del catálogo", async () => {
    server.use(
      http.get("/api/insumos", () => HttpResponse.json([INSUMO_HABILITADO])),
      http.get("/api/familias-insumo", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/unidades-medida", () => new HttpResponse(null, { status: 500 })),
    );
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    await screen.findByText("TON-001");
    await waitFor(() => expect(screen.getAllByText(/sin datos del catálogo/i)).toHaveLength(2));
    expect(screen.queryByText(/fuera del catálogo/i)).not.toBeInTheDocument();
    // El listado de insumos SÍ cargó: un catálogo auxiliar caído no puede
    // tumbar la pantalla entera.
    expect(screen.getByText("Tóner negro HP 26A")).toBeInTheDocument();
  });
});

// El gate de la vista es UI, no autorización: el backend sigue siendo la
// autoridad (ADR-4). Los dos casos van juntos a propósito — sin el hermano
// invertido, "no ve el listado" pasaría también si el componente estuviera roto.
describe("InsumosListView — gate INSUMOS:LECTURA", () => {
  it("sin INSUMOS:LECTURA → no ve el catálogo", async () => {
    mockCatalogos([INSUMO_HABILITADO, INSUMO_DESHABILITADO]);
    renderWithProviders(<InsumosListView />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByText(/no tiene permiso/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("TON-001")).not.toBeInTheDocument());
  });

  it("con INSUMOS:LECTURA → sí ve el catálogo", async () => {
    mockCatalogos([INSUMO_HABILITADO, INSUMO_DESHABILITADO]);
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    expect(await screen.findByText("TON-001")).toBeInTheDocument();
    expect(screen.queryByText(/no tiene permiso/i)).not.toBeInTheDocument();
  });
});

/**
 * Hasta esta entrega el listado se veía pero no llevaba a ningún lado: la
 * `DataTable` se renderizaba sin `onRowClick`, así que la ficha del insumo era
 * inalcanzable desde la UI. El assert mira el destino EXACTO, no que se haya
 * navegado: un `push` a `/insumos` dejaría al usuario donde ya estaba.
 */
describe("InsumosListView — navegación a la ficha del insumo", () => {
  it("al hacer click en una fila navega a la ficha de ESE insumo", async () => {
    mockCatalogos([INSUMO_HABILITADO, INSUMO_DESHABILITADO]);
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    await userEvent.click(await screen.findByText("CAB-009"));

    expect(pushMock).toHaveBeenCalledWith(`/insumos/${INSUMO_DESHABILITADO.id}`);
  });
});

/**
 * Gate `AdminClienteGuard` (ADMINISTRADOR-o-ROOT), no la matriz de permisos:
 * `LECTOR` (rol ADMINISTRADOR por default de `buildUser`) ve el trigger
 * aunque su fixture solo declare `INSUMOS:LECTURA` — es un chequeo de
 * IDENTIDAD (`esAdminCliente`), no una celda `MODULO:ACCION`.
 */
describe("InsumosListView — trigger «Nuevo insumo» (gate AdminClienteGuard)", () => {
  it("admin ve el botón «Nuevo insumo»", async () => {
    mockCatalogos([INSUMO_HABILITADO]);
    renderWithProviders(<InsumosListView />, { user: LECTOR });

    expect(await screen.findByRole("button", { name: /nuevo insumo/i })).toBeInTheDocument();
  });

  it("no-admin (TECNICO) sigue viendo el listado, pero sin el botón «Nuevo insumo»", async () => {
    mockCatalogos([INSUMO_HABILITADO]);
    renderWithProviders(<InsumosListView />, {
      user: buildUser({ rol: "TECNICO", permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] }),
    });

    expect(await screen.findByText("TON-001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nuevo insumo/i })).not.toBeInTheDocument();
  });
});
