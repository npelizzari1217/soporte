import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
  cantidad: 10,
  usuarioId: USUARIO_ANA.id,
  motivo: null,
  equipoId: null,
  sectorId: null,
  itemCompraId: null,
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
 * Wiring de `MovimientoEntradaDialog` en la ficha (unidad "diálogos de
 * movimientos de insumos", entrega 1 de 3 — salida y ajuste quedan para las
 * unidades siguientes). Gate `INSUMOS:ALTAS`, espejo exacto de
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

    expect(await screen.findByText("12,00")).toBeInTheDocument();
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

    expect(await screen.findByText("12,00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /registrar entrada/i }));
    await user.type(await screen.findByLabelText(/^cantidad$/i), "10");
    await user.click(screen.getByRole("button", { name: /^registrar$/i }));

    await waitFor(() => expect(screen.getByText("22,00")).toBeInTheDocument());
  });
});
