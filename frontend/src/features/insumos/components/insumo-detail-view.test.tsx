import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { InsumoDetailView } from "./insumo-detail-view";
import type { FamiliaInsumo, Insumo, StockInsumo, UnidadMedida } from "../types";

const INSUMO: Insumo = {
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

/**
 * Segundo insumo del catálogo, y no un catálogo de uno: el caso "el id no está"
 * tiene que probarse sobre una lista que SÍ trae elementos. Con el catálogo
 * vacío, "no lo encontró" pasaría también si el componente ignorara la lista —
 * es la forma 2 de verde falso del `AGENTS.md`.
 */
const OTRO_INSUMO: Insumo = {
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
  { id: "fam-1", nombre: "Consumibles de impresión" },
  { id: "fam-2", nombre: "Cableado de red" },
];

const UNIDADES: UnidadMedida[] = [
  { id: "um-1", nombre: "Unidad" },
  { id: "um-2", nombre: "Metro" },
];

const STOCK_SUFICIENTE: StockInsumo = {
  insumoId: INSUMO.id,
  stock: 12,
  stockMinimo: 5,
  estadoReposicion: "SUFICIENTE",
};

const LECTOR = buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] });

/** Los cuatro endpoints resuelven bien: el caso normal. */
function mockFicha(insumos: Insumo[], stock: StockInsumo): void {
  server.use(
    http.get("/api/insumos", () => HttpResponse.json(insumos)),
    http.get("/api/familias-insumo", () => HttpResponse.json(FAMILIAS)),
    http.get("/api/unidades-medida", () => HttpResponse.json(UNIDADES)),
    http.get("/api/insumos/:insumoId/stock", () => HttpResponse.json(stock)),
  );
}

describe("InsumoDetailView — identificación y existencia", () => {
  it("muestra el código, el nombre, la familia, la unidad y el estado del insumo", async () => {
    mockFicha([INSUMO, OTRO_INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Tóner negro HP 26A")).toBeInTheDocument();
    expect(screen.getByText("TON-001")).toBeInTheDocument();
    expect(screen.getByText("Consumibles de impresión")).toBeInTheDocument();
    expect(screen.getByText("Unidad")).toBeInTheDocument();
    expect(screen.getByText("Habilitado")).toBeInTheDocument();
    // El insumo pedido y NADA más: el otro del catálogo no se cuela en la ficha.
    expect(screen.queryByText("Cable de red categoría 5")).not.toBeInTheDocument();
  });

  it("el insumo deshabilitado lo dice en la ficha, no se muestra igual que el habilitado", async () => {
    mockFicha([INSUMO, OTRO_INSUMO], { ...STOCK_SUFICIENTE, insumoId: OTRO_INSUMO.id });
    renderWithProviders(<InsumoDetailView insumoId={OTRO_INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Cable de red categoría 5")).toBeInTheDocument();
    expect(screen.getByText("Deshabilitado")).toBeInTheDocument();
    expect(screen.queryByText("Habilitado")).not.toBeInTheDocument();
  });

  it("muestra el saldo y el punto de reposición que devuelve el endpoint de stock", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("12,00")).toBeInTheDocument();
    expect(screen.getByText("5,00")).toBeInTheDocument();
  });
});

/**
 * El `estadoReposicion` viaja RESUELTO del backend y la ficha SOLO lo traduce:
 * la regla de cuándo hay que reponer es de negocio (`evaluarReposicion`), y una
 * segunda comparación acá sería una segunda definición de "bajo el mínimo".
 * Por eso los tres casos se prueban por lo que el endpoint DICE, no por los
 * números — el de `BAJO_MINIMO` incluso llega con un saldo por encima del punto
 * para que un `stock <= stockMinimo` escrito en el frontend lo contradiga.
 */
describe("InsumoDetailView — estado de reposición", () => {
  it("SUFICIENTE → lo dice, y no muestra las otras dos lecturas", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Existencia suficiente")).toBeInTheDocument();
    expect(screen.queryByText("Hay que reponer")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin punto de reposición definido")).not.toBeInTheDocument();
  });

  it("BAJO_MINIMO → lo dice tal como llegó, sin recalcularlo a partir de los números", async () => {
    mockFicha([INSUMO], {
      insumoId: INSUMO.id,
      // Saldo POR ENCIMA del punto: si la ficha recalculara, diría "suficiente".
      stock: 40,
      stockMinimo: 5,
      estadoReposicion: "BAJO_MINIMO",
    });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Hay que reponer")).toBeInTheDocument();
    expect(screen.queryByText("Existencia suficiente")).not.toBeInTheDocument();
  });

  it("SIN_PUNTO_DEFINIDO con stockMinimo null → lo distingue de «suficiente»", async () => {
    mockFicha([INSUMO], {
      insumoId: INSUMO.id,
      stock: 3,
      stockMinimo: null,
      estadoReposicion: "SIN_PUNTO_DEFINIDO",
    });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Sin punto de reposición definido")).toBeInTheDocument();
    expect(screen.queryByText("Existencia suficiente")).not.toBeInTheDocument();
    expect(screen.queryByText("Hay que reponer")).not.toBeInTheDocument();
    // El punto no configurado sí es una afirmación sobre el dato: no hay número.
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

/**
 * No hay `GET /insumos/:id`: la ficha resuelve el insumo contra el catálogo que
 * `useInsumos()` ya trae. Eso arrastra la trampa de la clase "select con valor
 * fuera de catálogo" del `AGENTS.md` a la pantalla ENTERA: "este insumo no
 * existe" solo se puede concluir cuando la lista YA resolvió. Cargando, caída e
 * inexistente son tres pantallas distintas.
 */
describe("InsumoDetailView — resolución del insumo contra el catálogo", () => {
  it("el catálogo todavía cargando → muestra el esqueleto, NO «no se encontró»", async () => {
    server.use(
      http.get("/api/insumos", async () => {
        await delay("infinite");
        return HttpResponse.json([INSUMO]);
      }),
      http.get("/api/familias-insumo", () => HttpResponse.json(FAMILIAS)),
      http.get("/api/unidades-medida", () => HttpResponse.json(UNIDADES)),
      http.get("/api/insumos/:insumoId/stock", () => HttpResponse.json(STOCK_SUFICIENTE)),
    );
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByRole("status", { name: /cargando detalle/i })).toBeInTheDocument();
    expect(screen.queryByText(/no se encontró/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no se pudo cargar el insumo/i)).not.toBeInTheDocument();
  });

  /**
   * Hermano invertido del anterior, y el que le da sentido: el catálogo
   * responde BIEN, trae otro insumo y no trae este. Recién ahí la ausencia
   * prueba que el insumo no existe.
   */
  it("el catálogo resolvió y NO trae el id → concluye que el insumo no existe", async () => {
    mockFicha([OTRO_INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText(/no se encontró el insumo/i)).toBeInTheDocument();
    expect(screen.queryByText("Tóner negro HP 26A")).not.toBeInTheDocument();
  });

  it("el catálogo falla → lo dice, sin acusar al insumo de no existir", async () => {
    server.use(
      http.get("/api/insumos", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/familias-insumo", () => HttpResponse.json(FAMILIAS)),
      http.get("/api/unidades-medida", () => HttpResponse.json(UNIDADES)),
      http.get("/api/insumos/:insumoId/stock", () => HttpResponse.json(STOCK_SUFICIENTE)),
    );
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText(/no se pudo cargar el insumo/i)).toBeInTheDocument();
    expect(screen.queryByText(/no se encontró/i)).not.toBeInTheDocument();
  });
});

/**
 * El insumo y su existencia son dos queries independientes: el catálogo y
 * `GET /insumos/:insumoId/stock`. Que la segunda falle no puede tumbar la
 * ficha — el usuario tiene que poder ver DE QUÉ insumo se trata igual, y el
 * fallo queda acotado al bloque que no pudo cargar.
 */
describe("InsumoDetailView — fallo independiente del stock", () => {
  it("el stock falla → la identificación del insumo se ve igual, y el bloque de existencia avisa", async () => {
    server.use(
      http.get("/api/insumos", () => HttpResponse.json([INSUMO])),
      http.get("/api/familias-insumo", () => HttpResponse.json(FAMILIAS)),
      http.get("/api/unidades-medida", () => HttpResponse.json(UNIDADES)),
      http.get("/api/insumos/:insumoId/stock", () => new HttpResponse(null, { status: 500 })),
    );
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Tóner negro HP 26A")).toBeInTheDocument();
    expect(screen.getByText("TON-001")).toBeInTheDocument();
    expect(screen.getByText("Consumibles de impresión")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/no se pudo cargar la existencia/i)).toBeInTheDocument(),
    );
    // Y NO se cae en el error de la ficha entera.
    expect(screen.queryByText(/no se pudo cargar el insumo/i)).not.toBeInTheDocument();
    // Tampoco inventa un saldo: sin dato no hay número ni lectura de reposición.
    expect(screen.queryByText("Existencia suficiente")).not.toBeInTheDocument();
  });
});

// El gate de la vista es UI, no autorización: el backend sigue siendo la
// autoridad (ADR-4) — y acá SÍ espeja al servidor, porque
// `GET /insumos/:insumoId/stock` exige `INSUMOS:LECTURA`. Los dos casos van
// juntos: sin el hermano invertido, "no ve la ficha" pasaría también si el
// componente estuviera roto.
describe("InsumoDetailView — gate INSUMOS:LECTURA", () => {
  it("sin INSUMOS:LECTURA → no ve la ficha", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: [] }),
    });

    expect(await screen.findByText(/no tiene permiso/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("TON-001")).not.toBeInTheDocument());
  });

  it("con INSUMOS:LECTURA → sí ve la ficha", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("TON-001")).toBeInTheDocument();
    expect(screen.queryByText(/no tiene permiso/i)).not.toBeInTheDocument();
  });
});
