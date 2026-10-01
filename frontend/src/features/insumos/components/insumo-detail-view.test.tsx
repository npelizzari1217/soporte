import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { InsumoDetailView } from "./insumo-detail-view";
import type {
  FamiliaInsumo,
  Insumo,
  ListarMovimientosInsumoResponse,
  MovimientoInsumo,
  StockInsumo,
  UnidadMedida,
} from "../types";
import type { UsuarioTenant } from "@/features/usuarios/types";

const INSUMO: Insumo = {
  id: "11111111-1111-1111-1111-111111111111",
  codigo: "TON-001",
  nombre: "Tóner negro HP 26A",
  familiaId: "fam-1",
  unidadMedidaId: "um-1",
  stockMinimo: 5,
  activo: true,
  seguimiento: "NINGUNO",
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
  seguimiento: "NINGUNO",
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
    entera: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "um-2",
    codigo: "M",
    nombre: "Metro",
    activo: true,
    entera: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const STOCK_SUFICIENTE: StockInsumo = {
  insumoId: INSUMO.id,
  stock: 12,
  saldos: { NUEVO: 12, USADO: 0 },
  admiteUsado: false,
  stockMinimo: 5,
  estadoReposicion: "SUFICIENTE",
  seguimiento: "NINGUNO",
  pendientesDeSerie: 0,
};

const LECTOR = buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] });

/**
 * Los `usuarioId` son UUID a propósito, y no `"usr-1"`: el test que verifica
 * que la celda de «quién» NUNCA muestre el identificador crudo afirma la
 * ausencia de ESTE texto en el DOM, y un id corto y amistoso volvería esa
 * afirmación menos representativa de lo que llega del servidor.
 */
const USUARIO_ANA: UsuarioTenant = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  nombre: "Ana",
  apellido: "Gómez",
  rol: "TECNICO",
};

const USUARIO_LUIS: UsuarioTenant = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  nombre: "Luis",
  apellido: "Paz",
  rol: "ADMINISTRADOR",
};

const USUARIOS: UsuarioTenant[] = [USUARIO_ANA, USUARIO_LUIS];

/** Base de un asiento: cada fixture pisa solo lo que su caso necesita. */
const MOVIMIENTO_BASE: MovimientoInsumo = {
  id: "mov-base",
  insumoId: INSUMO.id,
  tipo: "ENTRADA",
  condicion: "NUEVO",
  cantidad: 10,
  usuarioId: USUARIO_ANA.id,
  motivo: null,
  equipoId: null,
  sectorId: null,
  itemCompraId: null,
  unidadId: null,
  numeroSerie: null,
  createdAt: "2026-03-01T13:30:00.000Z",
};

/** Bitácora vacía: es lo que ve cualquier test que no venga a mirar la bitácora. */
const BITACORA_VACIA: ListarMovimientosInsumoResponse = {
  items: [],
  total: 0,
  pagina: 1,
  porPagina: 10,
};

/** Los seis endpoints de la ficha resuelven bien: el caso normal. */
function mockFicha(
  insumos: Insumo[],
  stock: StockInsumo,
  movimientos: ListarMovimientosInsumoResponse = BITACORA_VACIA,
): void {
  server.use(
    http.get("/api/insumos", () => HttpResponse.json(insumos)),
    http.get("/api/familias-insumo", () => HttpResponse.json(FAMILIAS)),
    http.get("/api/unidades-medida", () => HttpResponse.json(UNIDADES)),
    http.get("/api/insumos/:insumoId/stock", () => HttpResponse.json(stock)),
    http.get("/api/insumos/:insumoId/movimientos", () => HttpResponse.json(movimientos)),
    http.get("/api/usuarios", () => HttpResponse.json(USUARIOS)),
  );
}

/** El contenedor rótulo + valor de un dato de la ficha. */
function valorDe(rotulo: string): HTMLElement {
  return screen.getByText(rotulo).parentElement as HTMLElement;
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

    expect(await screen.findByText("Stock nuevo")).toBeInTheDocument();
    expect(valorDe("Stock nuevo")).toHaveTextContent("12,00");
    expect(valorDe("Stock total")).toHaveTextContent("12,00");
    expect(valorDe("Stock mínimo")).toHaveTextContent("5,00");
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
      saldos: { NUEVO: 40, USADO: 0 },
      admiteUsado: false,
      stockMinimo: 5,
      estadoReposicion: "BAJO_MINIMO",
      seguimiento: "NINGUNO",
      pendientesDeSerie: 0,
    });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Hay que reponer")).toBeInTheDocument();
    expect(screen.queryByText("Existencia suficiente")).not.toBeInTheDocument();
  });

  it("SIN_PUNTO_DEFINIDO con stockMinimo null → lo distingue de «suficiente»", async () => {
    mockFicha([INSUMO], {
      insumoId: INSUMO.id,
      stock: 3,
      saldos: { NUEVO: 3, USADO: 0 },
      admiteUsado: false,
      stockMinimo: null,
      estadoReposicion: "SIN_PUNTO_DEFINIDO",
      seguimiento: "NINGUNO",
      pendientesDeSerie: 0,
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
 * Saldos por condición: el backend devuelve el total, el saldo NUEVO y el USADO,
 * y la ficha los muestra sin recalcular nada. La reposición llega resuelta sobre
 * NUEVO: un USADO alto no puede esconder la falta de nuevos.
 */
describe("InsumoDetailView — saldos nuevo y usado", () => {
  it("con NUEVO 4 y USADO 2 muestra ambos saldos y el total 6", async () => {
    mockFicha([INSUMO], {
      ...STOCK_SUFICIENTE,
      stock: 6,
      saldos: { NUEVO: 4, USADO: 2 },
      admiteUsado: true,
    });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Stock usado")).toBeInTheDocument();
    expect(valorDe("Stock nuevo")).toHaveTextContent("4,00");
    expect(valorDe("Stock usado")).toHaveTextContent("2,00");
    expect(valorDe("Stock total")).toHaveTextContent("6,00");
  });

  it("insumo que no admite usado y sin usados: no muestra el saldo usado", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Stock nuevo")).toBeInTheDocument();
    expect(screen.queryByText("Stock usado")).not.toBeInTheDocument();
  });

  it("si admite usado y el saldo es cero, igual lo muestra en cero", async () => {
    mockFicha([INSUMO], { ...STOCK_SUFICIENTE, admiteUsado: true });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Stock usado")).toBeInTheDocument();
    expect(valorDe("Stock usado")).toHaveTextContent("0,00");
  });

  it("sin admitir usado pero con saldo usado mayor que cero, lo muestra", async () => {
    mockFicha([INSUMO], {
      ...STOCK_SUFICIENTE,
      stock: 14,
      saldos: { NUEVO: 12, USADO: 2 },
      admiteUsado: false,
    });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Stock usado")).toBeInTheDocument();
    expect(valorDe("Stock usado")).toHaveTextContent("2,00");
  });

  it("USADO alto con NUEVO en cero: la reposición sigue diciendo que hay que reponer", async () => {
    mockFicha([INSUMO], {
      insumoId: INSUMO.id,
      stock: 20,
      saldos: { NUEVO: 0, USADO: 20 },
      admiteUsado: true,
      stockMinimo: 5,
      estadoReposicion: "BAJO_MINIMO",
      seguimiento: "NINGUNO",
      pendientesDeSerie: 0,
    });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Hay que reponer")).toBeInTheDocument();
    expect(valorDe("Stock total")).toHaveTextContent("20,00");
  });

  it("la bitácora muestra la condición de cada movimiento", async () => {
    mockFicha(
      [INSUMO],
      STOCK_SUFICIENTE,
      {
        items: [
          { ...MOVIMIENTO_BASE, id: "mov-n", condicion: "NUEVO", cantidad: 3 },
          { ...MOVIMIENTO_BASE, id: "mov-u", condicion: "USADO", cantidad: 1 },
        ],
        total: 2,
        pagina: 1,
        porPagina: 10,
      },
    );
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByRole("columnheader", { name: "Condición" })).toBeInTheDocument();
    const filas = screen.getAllByRole("row");
    expect(within(filas[1]).getByText("Nuevo")).toBeInTheDocument();
    expect(within(filas[2]).getByText("Usado")).toBeInTheDocument();
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
      http.get("/api/insumos/:insumoId/movimientos", () => HttpResponse.json(BITACORA_VACIA)),
      http.get("/api/usuarios", () => HttpResponse.json(USUARIOS)),
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
      http.get("/api/insumos/:insumoId/movimientos", () => HttpResponse.json(BITACORA_VACIA)),
      http.get("/api/usuarios", () => HttpResponse.json(USUARIOS)),
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
      http.get("/api/insumos/:insumoId/movimientos", () => HttpResponse.json(BITACORA_VACIA)),
      http.get("/api/usuarios", () => HttpResponse.json(USUARIOS)),
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

/**
 * La bitácora es la razón de esta entrega: sin ella, un asiento nacido de la
 * recepción de una compra se ve exactamente igual que una carga manual.
 *
 * Tres reglas se prueban acá y ninguna es de presentación:
 *
 * 1. **El signo lo da el TIPO, nunca el número.** `cantidad` SIEMPRE llega
 *    positiva —el backend lo garantiza con un CHECK—, así que los dos ajustes
 *    del fixture traen la MISMA cantidad: si el signo saliera del número, los
 *    dos se verían iguales.
 * 2. **`total` es el universo del insumo, no el tamaño de la página.** Un
 *    paginador derivado de `items.length` se pone rojo con el fixture de abajo.
 * 3. **El nombre de quien movió es un dato ACCESORIO.** `GET /usuarios` exige
 *    `TICKETS:ASIGNAR`, `TICKETS:VER_TODOS` o ser ADMINISTRADOR/ROOT: un
 *    técnico con solo `INSUMOS:LECTURA` recibe 403, y la bitácora tiene que
 *    verse igual — sin toast y sin mostrar nunca el UUID.
 */
describe("InsumoDetailView — bitácora de movimientos", () => {
  /** Fixture del asiento de RECEPCION, no un `undefined` que un cast tendría que forzar a `string`. */
  const ITEM_COMPRA_ID_RECEPCION = "1c1c1c1c-1c1c-1c1c-1c1c-1c1c1c1c1c1c";

  const RECEPCION: MovimientoInsumo = {
    ...MOVIMIENTO_BASE,
    id: "mov-recepcion",
    tipo: "ENTRADA",
    cantidad: 10,
    usuarioId: USUARIO_ANA.id,
    motivo: null,
    itemCompraId: ITEM_COMPRA_ID_RECEPCION,
    createdAt: "2026-03-01T13:30:00.000Z",
  };

  const CARGA_MANUAL: MovimientoInsumo = {
    ...MOVIMIENTO_BASE,
    id: "mov-manual",
    tipo: "SALIDA",
    cantidad: 4,
    usuarioId: USUARIO_LUIS.id,
    motivo: "Recambio en la impresora de Ventas",
    itemCompraId: null,
    createdAt: "2026-03-02T09:05:00.000Z",
  };

  /** Envuelve una lista de asientos en la respuesta paginada del endpoint. */
  function bitacora(
    items: MovimientoInsumo[],
    total = items.length,
  ): ListarMovimientosInsumoResponse {
    return { items, total, pagina: 1, porPagina: 10 };
  }

  it("lista los asientos con su fecha, tipo, cantidad, quién los hizo y su motivo", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE, bitacora([RECEPCION, CARGA_MANUAL]));
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("01/03/2026 10:30")).toBeInTheDocument();
    expect(screen.getByText("02/03/2026 06:05")).toBeInTheDocument();
    expect(screen.getByText("Entrada")).toBeInTheDocument();
    expect(screen.getByText("Salida")).toBeInTheDocument();
    expect(screen.getByText("+10,00")).toBeInTheDocument();
    expect(screen.getByText("-4,00")).toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    expect(screen.getByText("Luis Paz")).toBeInTheDocument();
    expect(screen.getByText("Recambio en la impresora de Ventas")).toBeInTheDocument();
  });

  it("los cuatro tipos se distinguen entre sí, y el signo sale del tipo y no del número", async () => {
    // Los dos ajustes traen la MISMA cantidad a propósito: con el signo
    // derivado del número, "+7,00" y "-7,00" no podrían coexistir.
    mockFicha(
      [INSUMO],
      STOCK_SUFICIENTE,
      bitacora([
        { ...MOVIMIENTO_BASE, id: "m1", tipo: "ENTRADA", cantidad: 10 },
        { ...MOVIMIENTO_BASE, id: "m2", tipo: "SALIDA", cantidad: 4 },
        { ...MOVIMIENTO_BASE, id: "m3", tipo: "AJUSTE_POSITIVO", cantidad: 7 },
        { ...MOVIMIENTO_BASE, id: "m4", tipo: "AJUSTE_NEGATIVO", cantidad: 7 },
      ]),
    );
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Entrada")).toBeInTheDocument();
    expect(screen.getByText("Salida")).toBeInTheDocument();
    expect(screen.getByText("Ajuste positivo")).toBeInTheDocument();
    expect(screen.getByText("Ajuste negativo")).toBeInTheDocument();
    expect(screen.getByText("+7,00")).toBeInTheDocument();
    expect(screen.getByText("-7,00")).toBeInTheDocument();
  });

  it("el paginador cuenta el universo del insumo (`total`), NO las filas de la página", async () => {
    // Una sola fila en la página y 47 asientos en el insumo: con `porPagina`
    // 10 son 5 páginas. Un paginador derivado de `items.length` diría 1.
    mockFicha([INSUMO], STOCK_SUFICIENTE, bitacora([RECEPCION], 47));
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Página 1 de 5")).toBeInTheDocument();
  });

  it("ir a la página siguiente le PIDE esa página al endpoint", async () => {
    const paginasPedidas: string[] = [];
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    server.use(
      http.get("/api/insumos/:insumoId/movimientos", ({ request }) => {
        const pagina = new URL(request.url).searchParams.get("pagina") ?? "sin-pagina";
        paginasPedidas.push(pagina);
        return HttpResponse.json({
          items: [RECEPCION],
          total: 47,
          pagina: Number(pagina),
          porPagina: 10,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });
    await screen.findByText("Página 1 de 5");

    await user.click(screen.getByRole("button", { name: /siguiente/i }));

    // El assert es sobre la REQUEST: repintar la fila 2 sin pedirla sería
    // paginar del lado del cliente sobre una página que el servidor recortó.
    await waitFor(() => expect(paginasPedidas).toContain("2"));
  });

  it("distingue el asiento nacido de una recepción de compra de la carga manual", async () => {
    // Los dos casos en el MISMO fixture: sin el hermano, "dice recepción"
    // pasaría también con un componente que lo dijera siempre.
    mockFicha([INSUMO], STOCK_SUFICIENTE, bitacora([RECEPCION, CARGA_MANUAL]));
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Recepción de compra")).toBeInTheDocument();
    expect(screen.getByText("Carga manual")).toBeInTheDocument();
    // El `itemCompraId` es la trazabilidad, no algo que el usuario tenga que
    // leer: no hay endpoint que lo traduzca a un número de compra.
    expect(screen.queryByText(ITEM_COMPRA_ID_RECEPCION)).not.toBeInTheDocument();
  });

  it("sin movimientos → lo dice, y no se confunde con la bitácora caída", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE, bitacora([]));
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText(/sin movimientos/i)).toBeInTheDocument();
    expect(screen.queryByText(/no se pudieron cargar los movimientos/i)).not.toBeInTheDocument();
  });

  it("la bitácora falla → lo dice, y no se confunde con un insumo sin movimientos", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    server.use(
      http.get("/api/insumos/:insumoId/movimientos", () => new HttpResponse(null, { status: 500 })),
    );
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText(/no se pudieron cargar los movimientos/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin movimientos/i)).not.toBeInTheDocument();
    // Y el fallo queda acotado: la identificación del insumo se ve igual.
    expect(screen.getByText("Tóner negro HP 26A")).toBeInTheDocument();
  });
});

/**
 * `GET /usuarios` NO es lectura abierta: exige `TICKETS:ASIGNAR`,
 * `TICKETS:VER_TODOS` o ser ADMINISTRADOR/ROOT
 * (`backend/src/auth/interface/controllers/usuarios.controller.ts`). El técnico
 * que entra a la ficha con solo `INSUMOS:LECTURA` se come un 403 en esa
 * consulta, y ese 403 no puede degradar nada más que la columna que depende de
 * ella.
 */
describe("InsumoDetailView — la bitácora sobrevive al 403 de usuarios", () => {
  const ASIENTO: MovimientoInsumo = {
    ...MOVIMIENTO_BASE,
    id: "mov-403",
    tipo: "SALIDA",
    cantidad: 4,
    usuarioId: USUARIO_ANA.id,
    motivo: "Recambio en la impresora de Ventas",
  };

  function mockUsuariosProhibido(): void {
    mockFicha([INSUMO], STOCK_SUFICIENTE, {
      items: [ASIENTO],
      total: 1,
      pagina: 1,
      porPagina: 10,
    });
    server.use(http.get("/api/usuarios", () => new HttpResponse(null, { status: 403 })));
  }

  it("la bitácora se ve igual: el asiento, su tipo, su cantidad y su motivo siguen ahí", async () => {
    mockUsuariosProhibido();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Salida")).toBeInTheDocument();
    expect(screen.getByText("-4,00")).toBeInTheDocument();
    expect(screen.getByText("Recambio en la impresora de Ventas")).toBeInTheDocument();
    expect(screen.getByText("01/03/2026 10:30")).toBeInTheDocument();
    // El 403 es de una consulta accesoria: no se propaga al bloque.
    expect(screen.queryByText(/no se pudieron cargar los movimientos/i)).not.toBeInTheDocument();
  });

  it("la celda de «quién» dice que el dato no está disponible, y NUNCA muestra el UUID", async () => {
    mockUsuariosProhibido();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText(/sin datos de usuarios/i)).toBeInTheDocument();
    expect(screen.queryByText(USUARIO_ANA.id)).not.toBeInTheDocument();
    // Ni siquiera embebido dentro de otro texto: un identificador en pantalla
    // no le dice nada a nadie, y es justo lo que esta entrega vino a corregir.
    expect(document.body.textContent).not.toContain(USUARIO_ANA.id);
  });

  it("con la lista de usuarios accesible, la MISMA celda muestra el nombre", async () => {
    // Hermano invertido: sin él, "no muestra el UUID" pasaría también con una
    // columna que nunca muestra nada.
    mockFicha([INSUMO], STOCK_SUFICIENTE, {
      items: [ASIENTO],
      total: 1,
      pagina: 1,
      porPagina: 10,
    });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByText("Ana Gómez")).toBeInTheDocument();
    expect(screen.queryByText(/sin datos de usuarios/i)).not.toBeInTheDocument();
  });
});

/**
 * Wiring de `MovimientoEntradaDialog` en la ficha. Gate `INSUMOS:ALTAS`, espejo exacto de
 * `MovimientosInsumoController.registrarEntrada` — la lectura sola
 * (`INSUMOS:LECTURA`) no alcanza para ver el botón.
 */
describe("InsumoDetailView — registrar entrada", () => {
  it("con INSUMOS:ALTAS → ve el botón «Registrar entrada» junto a la existencia", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"] }),
    });

    expect(await screen.findByRole("button", { name: /registrar entrada/i })).toBeInTheDocument();
  });

  /**
   * El backend rechaza la entrada de un insumo deshabilitado con 422
   * (`MovimientosInsumoController.registrarEntrada`, `InsumoError`) — la
   * única de las tres operaciones que lo exige habilitado. El botón lo
   * refleja ANTES de que el usuario llegue a tipear y mandar el formulario:
   * deshabilitado, con un `title` que explica por qué (mismo mecanismo que
   * `ItemEliminarControl`/`ItemDecisionActions` de `features/compras`), no
   * escondido sin explicación.
   */
  it("insumo deshabilitado → el botón «Registrar entrada» aparece deshabilitado, con un title explicando por qué", async () => {
    mockFicha([{ ...INSUMO, activo: false }], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"] }),
    });

    const boton = await screen.findByRole("button", { name: /registrar entrada/i });
    expect(boton).toBeDisabled();
    expect(boton.getAttribute("title")).toMatch(/deshabilitad/i);
  });

  it("sin INSUMOS:ALTAS → no ve el botón, aunque sí vea la existencia", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    await waitFor(() => expect(valorDe("Stock total")).toHaveTextContent("12,00"));
    expect(screen.queryByRole("button", { name: /registrar entrada/i })).not.toBeInTheDocument();
  });

  /**
   * Prueba la invalidación REAL, no solo que el hook llame
   * `invalidateQueries` (eso ya lo cubre `use-insumo-mutations.test.tsx`):
   * acá el segundo `GET /stock` devuelve un saldo distinto, y la ficha tiene
   * que mostrarlo SOLA, sin recargar la página — es lo que efectivamente ve
   * el usuario después de registrar.
   */
  it("registrar una entrada desde la ficha refresca la existencia mostrada", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    let stockPedido = 0;
    server.use(
      http.get("/api/equipos", () => HttpResponse.json([])),
      http.get("/api/sectores", () => HttpResponse.json([])),
      http.get("/api/insumos/:insumoId/stock", () => {
        stockPedido += 1;
        return HttpResponse.json(stockPedido === 1 ? STOCK_SUFICIENTE : { ...STOCK_SUFICIENTE, stock: 22 });
      }),
      http.post(`/api/insumos/${INSUMO.id}/movimientos/entrada`, () =>
        HttpResponse.json(
          { ...MOVIMIENTO_BASE, id: "mov-nuevo", insumoId: INSUMO.id, cantidad: 10 },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"] }),
    });

    await waitFor(() => expect(valorDe("Stock total")).toHaveTextContent("12,00"));

    await user.click(screen.getByRole("button", { name: /registrar entrada/i }));
    await user.type(await screen.findByLabelText(/^cantidad$/i), "10");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(screen.getByText("22,00")).toBeInTheDocument());
    // El "22,00" solo puede venir de un segundo GET /stock disparado por la
    // invalidación del POST: si el refetch fuera casualidad, este contador
    // seguiría en 1.
    expect(stockPedido).toBe(2);
  });
});

/**
 * `MovimientosInsumoController.registrarSalida` comparte la celda
 * `INSUMOS:ALTAS` con la entrada — la lectura sola no alcanza para ver el
 * botón. La precondición de estado es DISTINTA de la entrada: acá es el
 * STOCK, no `insumo.activo` (ver el JSDoc de `MovimientoSalidaDialog`).
 */
describe("InsumoDetailView — registrar salida", () => {
  it("con INSUMOS:ALTAS → ve el botón «Registrar salida» junto a la existencia", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"] }),
    });

    expect(await screen.findByRole("button", { name: /registrar salida/i })).toBeInTheDocument();
  });

  /**
   * A diferencia de la entrada, un insumo DESHABILITADO no bloquea la
   * salida — el botón sigue habilitado, porque `activo` no es su
   * precondición.
   */
  it("insumo deshabilitado → el botón «Registrar salida» sigue habilitado (la salida no exige el insumo activo)", async () => {
    mockFicha([{ ...INSUMO, activo: false }], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"] }),
    });

    const boton = await screen.findByRole("button", { name: /registrar salida/i });
    expect(boton).not.toBeDisabled();
  });

  /**
   * El backend rechaza la salida sin stock con 422 (`StockInsuficienteError`).
   * El botón lo refleja ANTES de que el usuario llegue a tipear: deshabilitado,
   * con un `title` que explica por qué.
   */
  it("stock en 0 → el botón «Registrar salida» aparece deshabilitado, con un title explicando por qué", async () => {
    mockFicha([INSUMO], { ...STOCK_SUFICIENTE, stock: 0 });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"] }),
    });

    const boton = await screen.findByRole("button", { name: /registrar salida/i });
    expect(boton).toBeDisabled();
    expect(boton.getAttribute("title")).toMatch(/existencia/i);
  });

  it("sin INSUMOS:ALTAS → no ve el botón, aunque sí vea la existencia", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    await waitFor(() => expect(valorDe("Stock total")).toHaveTextContent("12,00"));
    expect(screen.queryByRole("button", { name: /registrar salida/i })).not.toBeInTheDocument();
  });

  /**
   * Prueba la invalidación REAL (ya cubierta a nivel de hook por
   * `use-insumo-mutations.test.tsx`): acá el segundo `GET /stock` devuelve un
   * saldo distinto, y la ficha lo muestra sola, sin recargar la página.
   */
  it("registrar una salida desde la ficha refresca la existencia mostrada", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    let stockPedido = 0;
    server.use(
      http.get("/api/equipos", () => HttpResponse.json([])),
      http.get("/api/sectores", () => HttpResponse.json([])),
      http.get("/api/insumos/:insumoId/stock", () => {
        stockPedido += 1;
        return HttpResponse.json(stockPedido === 1 ? STOCK_SUFICIENTE : { ...STOCK_SUFICIENTE, stock: 2 });
      }),
      http.post(`/api/insumos/${INSUMO.id}/movimientos/salida`, () =>
        HttpResponse.json(
          { ...MOVIMIENTO_BASE, id: "mov-nuevo", tipo: "SALIDA", insumoId: INSUMO.id, cantidad: 10 },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"] }),
    });

    await waitFor(() => expect(valorDe("Stock total")).toHaveTextContent("12,00"));

    await user.click(screen.getByRole("button", { name: /registrar salida/i }));
    await user.type(await screen.findByLabelText(/^cantidad$/i), "10");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(screen.getByText("2,00")).toBeInTheDocument());
    // El "2,00" solo puede venir de un segundo GET /stock disparado por la
    // invalidación del POST: si el refetch fuera casualidad, este contador
    // seguiría en 1.
    expect(stockPedido).toBe(2);
  });
});

/**
 * `MovimientosInsumoController.registrarAjuste` lleva su PROPIO gate,
 * `INSUMOS:AJUSTAR` — el JSDoc del controller es explícito: tener
 * `INSUMOS:ALTAS` no alcanza. Por eso el botón vive en su propio `<Can>`,
 * separado del que envuelve entrada y salida (ver el JSDoc de
 * `insumo-detail-view.tsx`, sección "Existencia").
 */
describe("InsumoDetailView — registrar ajuste", () => {
  it("con INSUMOS:AJUSTAR → ve el botón «Registrar ajuste» junto a la existencia", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:AJUSTAR"] }),
    });

    expect(await screen.findByRole("button", { name: /registrar ajuste/i })).toBeInTheDocument();
  });

  it("sin INSUMOS:AJUSTAR → no ve el botón, aunque sí vea la existencia", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    await waitFor(() => expect(valorDe("Stock total")).toHaveTextContent("12,00"));
    expect(screen.queryByRole("button", { name: /registrar ajuste/i })).not.toBeInTheDocument();
  });

  /**
   * La prueba de que el ajuste NO comparte gate con entrada/salida: tener
   * `INSUMOS:ALTAS` (que sí desbloquea "Registrar entrada"/"Registrar
   * salida") no alcanza para ver "Registrar ajuste".
   */
  it("con INSUMOS:ALTAS pero SIN INSUMOS:AJUSTAR → ve entrada/salida pero no el ajuste", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:ALTAS"] }),
    });

    expect(await screen.findByRole("button", { name: /registrar entrada/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /registrar salida/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar ajuste/i })).not.toBeInTheDocument();
  });

  /**
   * Espejo inverso: con `INSUMOS:AJUSTAR` pero sin `INSUMOS:ALTAS`, se ve el
   * ajuste y NO entrada/salida — son dos gates independientes.
   */
  it("con INSUMOS:AJUSTAR pero SIN INSUMOS:ALTAS → ve el ajuste pero no entrada/salida", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:AJUSTAR"] }),
    });

    expect(await screen.findByRole("button", { name: /registrar ajuste/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar entrada/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar salida/i })).not.toBeInTheDocument();
  });

  /**
   * A diferencia de entrada/salida, el ajuste no tiene precondición de
   * estado propia: ni `insumo.activo` (solo la entrada la exige) ni el
   * stock a secas (el tope del `AJUSTE_NEGATIVO` vive adentro del diálogo).
   */
  it("insumo deshabilitado y stock en 0 → el botón «Registrar ajuste» sigue habilitado", async () => {
    mockFicha([{ ...INSUMO, activo: false }], { ...STOCK_SUFICIENTE, stock: 0 });
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:AJUSTAR"] }),
    });

    const boton = await screen.findByRole("button", { name: /registrar ajuste/i });
    expect(boton).not.toBeDisabled();
  });

  /**
   * Prueba la invalidación REAL (ya cubierta a nivel de hook por
   * `use-insumo-mutations.test.tsx`): acá el segundo `GET /stock` devuelve un
   * saldo distinto, y la ficha lo muestra sola, sin recargar la página.
   */
  it("registrar un ajuste desde la ficha refresca la existencia mostrada", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    let stockPedido = 0;
    server.use(
      http.get("/api/equipos", () => HttpResponse.json([])),
      http.get("/api/sectores", () => HttpResponse.json([])),
      http.get("/api/insumos/:insumoId/stock", () => {
        stockPedido += 1;
        return HttpResponse.json(stockPedido === 1 ? STOCK_SUFICIENTE : { ...STOCK_SUFICIENTE, stock: 15 });
      }),
      http.post(`/api/insumos/${INSUMO.id}/movimientos/ajuste`, () =>
        HttpResponse.json(
          {
            ...MOVIMIENTO_BASE,
            id: "mov-nuevo",
            tipo: "AJUSTE_POSITIVO",
            insumoId: INSUMO.id,
            cantidad: 3,
            motivo: "Conteo físico",
          },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ permisos: ["INSUMOS:LECTURA", "INSUMOS:AJUSTAR"] }),
    });

    await waitFor(() => expect(valorDe("Stock total")).toHaveTextContent("12,00"));

    await user.click(screen.getByRole("button", { name: /registrar ajuste/i }));
    await user.type(await screen.findByLabelText(/^cantidad$/i), "3");
    await user.type(screen.getByLabelText(/motivo/i), "Conteo físico");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(screen.getByText("15,00")).toBeInTheDocument());
    // El "15,00" solo puede venir de un segundo GET /stock disparado por la
    // invalidación del POST: si el refetch fuera casualidad, este contador
    // seguiría en 1.
    expect(stockPedido).toBe(2);
  });
});

/**
 * ABM del insumo (crear/editar/activar-desactivar) — gate `AdminClienteGuard`
 * en el backend, `<SoloAdminCliente>` en el frontend (ADR-P5): es un chequeo
 * de IDENTIDAD (`esAdminCliente`), no una celda de la matriz `MODULO:ACCION`,
 * así que `LECTOR` (rol ADMINISTRADOR por default de `buildUser`) SÍ ve estos
 * triggers aunque su fixture solo declare `INSUMOS:LECTURA`.
 */
describe("InsumoDetailView — editar y cambiar estado (ABM, gate AdminClienteGuard)", () => {
  it("admin ve los botones «Editar» y «Deshabilitar»", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByRole("button", { name: /^editar$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^deshabilitar$/i })).toBeInTheDocument();
  });

  it("insumo deshabilitado → el trigger de estado dice «Habilitar»", async () => {
    mockFicha([{ ...INSUMO, activo: false }], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    expect(await screen.findByRole("button", { name: /^habilitar$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^deshabilitar$/i })).not.toBeInTheDocument();
  });

  it("no-admin (TECNICO) sigue viendo la ficha, pero sin «Editar» ni el trigger de estado", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, {
      user: buildUser({ rol: "TECNICO", permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] }),
    });

    expect(await screen.findByText("Tóner negro HP 26A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^deshabilitar$/i })).not.toBeInTheDocument();
  });

  it("editar desde la ficha manda el PATCH y refleja el cambio sin recargar la página", async () => {
    // Estado MUTABLE, no un fixture estático: `useEditarInsumo` invalida
    // `["insumos"]` al tener éxito, así que la ficha vuelve a pedir
    // `GET /insumos` — si ese handler siguiera devolviendo el insumo viejo, el
    // assert de abajo pasaría por casualidad (el PATCH se mandó bien, pero la
    // pantalla no reflejaría nada).
    let insumoActual: Insumo = { ...INSUMO };
    mockFicha([insumoActual], STOCK_SUFICIENTE);
    server.use(http.get("/api/insumos", () => HttpResponse.json([insumoActual])));
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/insumos/${INSUMO.id}`, async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        insumoActual = { ...insumoActual, nombre: "Tóner negro HP 26A XL" };
        return HttpResponse.json(insumoActual);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    await user.click(await screen.findByRole("button", { name: /^editar$/i }));
    const nombreInput = await screen.findByLabelText("Nombre");
    await user.clear(nombreInput);
    await user.type(nombreInput, "Tóner negro HP 26A XL");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    // Sin `codigo` en el PATCH (issue #166): no es un campo editable, ni
    // siquiera desde la ficha.
    await waitFor(() =>
      expect(enviado).toEqual({
        nombre: "Tóner negro HP 26A XL",
        familiaId: "fam-1",
        unidadMedidaId: "um-1",
        stockMinimo: 5,
      }),
    );
    expect(enviado).not.toHaveProperty("codigo");
    expect(await screen.findByText("Tóner negro HP 26A XL")).toBeInTheDocument();
  });

  it("deshabilitar pide confirmación y manda { activo: false }", async () => {
    mockFicha([INSUMO], STOCK_SUFICIENTE);
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/insumos/${INSUMO.id}/estado`, async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...INSUMO, activo: false });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    await user.click(await screen.findByRole("button", { name: /^deshabilitar$/i }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: /^deshabilitar$/i }));

    await waitFor(() => expect(enviado).toEqual({ activo: false }));
  });

  it("habilitar (insumo deshabilitado) pide confirmación y manda { activo: true }", async () => {
    mockFicha([{ ...INSUMO, activo: false }], STOCK_SUFICIENTE);
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/insumos/${INSUMO.id}/estado`, async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...INSUMO, activo: true });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} />, { user: LECTOR });

    await user.click(await screen.findByRole("button", { name: /^habilitar$/i }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: /^habilitar$/i }));

    await waitFor(() => expect(enviado).toEqual({ activo: true }));
  });
});

/**
 * La copy y el link de vuelta siguen a la FAMILIA del ítem (`esRepuesto`), no a
 * la ruta: la misma vista se monta en `/insumos/[id]` y en `/repuestos/[id]`.
 */
describe("InsumoDetailView — vocabulario según la familia", () => {
  const FAMILIA_REPUESTO: FamiliaInsumo = {
    id: "fam-rep",
    codigo: "PERIFERICOS",
    nombre: "Periféricos",
    activo: true,
    esRepuesto: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const REPUESTO: Insumo = {
    ...INSUMO,
    id: "44444444-4444-4444-4444-444444444444",
    codigo: "REP-0001",
    nombre: "Mouse óptico USB",
    familiaId: FAMILIA_REPUESTO.id,
  };

  function mockCatalogo(): void {
    mockFicha([INSUMO, REPUESTO], { ...STOCK_SUFICIENTE, insumoId: REPUESTO.id });
    server.use(http.get("/api/familias-insumo", () => HttpResponse.json([...FAMILIAS, FAMILIA_REPUESTO])));
  }

  it.each(["insumos", "repuestos"] as const)(
    "un repuesto se nombra «repuesto» y vuelve a Repuestos, entre por %s",
    async (seccion) => {
      mockCatalogo();
      renderWithProviders(<InsumoDetailView insumoId={REPUESTO.id} seccion={seccion} />, { user: LECTOR });

      expect(await screen.findByRole("button", { name: "Deshabilitar" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Repuestos/ })).toHaveAttribute("href", "/repuestos");
      expect(screen.queryByRole("link", { name: /Insumos/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Deshabilitar" }));
      expect(await screen.findByText("Deshabilitar repuesto")).toBeInTheDocument();
      expect(screen.queryByText(/deshabilitar insumo/i)).not.toBeInTheDocument();
    },
  );

  it.each(["insumos", "repuestos"] as const)(
    "un consumible se nombra «insumo» y vuelve a Insumos, entre por %s",
    async (seccion) => {
      mockCatalogo();
      renderWithProviders(<InsumoDetailView insumoId={INSUMO.id} seccion={seccion} />, { user: LECTOR });

      expect(await screen.findByRole("button", { name: "Deshabilitar" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Insumos/ })).toHaveAttribute("href", "/insumos");
      expect(screen.queryByRole("link", { name: /Repuestos/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Deshabilitar" }));
      expect(await screen.findByText("Deshabilitar insumo")).toBeInTheDocument();
    },
  );

  it("el repuesto sin movimientos lo dice con «repuesto»", async () => {
    mockCatalogo();
    renderWithProviders(<InsumoDetailView insumoId={REPUESTO.id} seccion="repuestos" />, { user: LECTOR });

    expect(await screen.findByText(/para este repuesto/i)).toBeInTheDocument();
  });

  it("el repuesto ausente del catálogo, entrando por Repuestos, lo dice con «repuesto»", async () => {
    mockCatalogo();
    renderWithProviders(<InsumoDetailView insumoId="no-existe" seccion="repuestos" />, { user: LECTOR });

    expect(await screen.findByText(/no se encontró el repuesto/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Repuestos/ })).toHaveAttribute("href", "/repuestos");
  });
});
