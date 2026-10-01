import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { focusManager } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { InsumoFormDialog } from "./insumo-form-dialog";
import type { FamiliaInsumo, Insumo, UnidadMedida } from "../types";

/**
 * InsumoFormDialog — mismo mould que `familia-insumo-form-dialog.test.tsx`:
 * el diálogo queda montado permanentemente en la ficha/listado, así que
 * reabrirlo tiene que mostrar el dato VIGENTE, no el snapshot de su primer
 * render.
 *
 * El assert más importante de esta suite es NEGATIVO: el body de POST/PATCH
 * nunca lleva `codigosAlternativos` ni `compatibilidad`. Son sub-colecciones
 * COMPLETAS que el backend reemplaza enteras — mandar `[]` (en vez de
 * omitirlas) vaciaría en silencio una compatibilidad que el usuario cargó
 * desde otro lado y que esta pantalla ni siquiera muestra.
 */
function buildFamilia(overrides: Partial<FamiliaInsumo> = {}): FamiliaInsumo {
  return {
    id: "fam-1",
    codigo: "CONSUMIBLES",
    nombre: "Consumibles de impresión",
    activo: true,
    esRepuesto: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildUnidad(overrides: Partial<UnidadMedida> = {}): UnidadMedida {
  return {
    id: "um-1",
    codigo: "UN",
    nombre: "Unidad",
    activo: true,
    entera: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildInsumo(overrides: Partial<Insumo> = {}): Insumo {
  return {
    id: "ins-1",
    codigo: "TON001",
    nombre: "Tóner negro HP 26A",
    familiaId: "fam-1",
    unidadMedidaId: "um-1",
    stockMinimo: 5,
    activo: true,
    seguimiento: "NINGUNO",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Los dos catálogos auxiliares resuelven con una entrada cada uno: el caso normal. */
function mockCatalogosConDatos(): void {
  server.use(
    http.get("/api/familias-insumo", () => HttpResponse.json([buildFamilia()])),
    http.get("/api/unidades-medida", () => HttpResponse.json([buildUnidad()])),
  );
}

describe("InsumoFormDialog — crear", () => {
  /**
   * INVIERTE "envía el POST con codigo/nombre/familiaId/unidadMedidaId..." y
   * "sin codigo tipeado, el POST viaja sin la clave codigo (autogeneración)"
   * (#162): ahí existía un `<input>` de código, y el POST llevaba o no la
   * clave según si el usuario tipeaba algo. Issue #166 borra esa rama entera:
   * no hay ningún control que pueda producir un `codigo` en el body — el
   * único camino que queda es el de abajo.
   */
  it("el POST nunca lleva la clave codigo — no existe ningún control para escribirlo", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.post("/api/insumos", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...buildInsumo(), ...enviado, codigo: "INS-0001", id: "ins-2" }, { status: 201 });
      }),
    );

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));

    // El borde del componente: no hay ningún textbox de "Código" que rellenar.
    expect(screen.queryByRole("textbox", { name: "Código" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre"), "Cartucho de tinta");
    await user.selectOptions(await screen.findByLabelText("Familia"), "fam-1");
    await user.selectOptions(screen.getByLabelText("Unidad de medida"), "um-1");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() =>
      expect(enviado).toEqual({
        nombre: "Cartucho de tinta",
        familiaId: "fam-1",
        unidadMedidaId: "um-1",
      }),
    );
    expect(enviado).not.toHaveProperty("codigo");
  });

  /**
   * INVIERTE "el hint de autogeneración solo se muestra en el alta, no al
   * editar" (#162): el hint sobre un `<input>` deshabilitado desapareció junto
   * con el input. Lo que queda es la ETIQUETA vacía que el issue #166 pidió —
   * "se genera al guardar" comunica que el código no es del usuario, ni
   * siquiera un campo que decidió no completar.
   */
  it("en el alta, la etiqueta Código aparece vacía con 'Se genera al guardar'", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));

    expect(screen.getByLabelText("Código")).toHaveTextContent("Se genera al guardar");
  });

  it("con stockMinimo completado, lo incluye en el POST", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.post("/api/insumos", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...buildInsumo(), ...enviado, id: "ins-2" }, { status: 201 });
      }),
    );

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));
    await user.type(screen.getByLabelText("Nombre"), "Cartucho de tinta");
    await user.selectOptions(await screen.findByLabelText("Familia"), "fam-1");
    await user.selectOptions(screen.getByLabelText("Unidad de medida"), "um-1");
    await user.type(screen.getByLabelText(/stock mínimo/i), "10");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(enviado.stockMinimo).toBe(10));
    expect(enviado).not.toHaveProperty("codigosAlternativos");
    expect(enviado).not.toHaveProperty("compatibilidad");
  });
});

describe("InsumoFormDialog — editar", () => {
  it("prefilla desde la fila (incluido stock mínimo) y el PATCH no lleva codigo, codigosAlternativos ni compatibilidad", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();
    const insumo = buildInsumo();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/insumos/ins-1", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...insumo, ...enviado });
      }),
    );

    renderWithProviders(<InsumoFormDialog insumo={insumo} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Código")).toHaveTextContent("TON001");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Tóner negro HP 26A");
    expect(await screen.findByLabelText("Familia")).toHaveValue("fam-1");
    expect(screen.getByLabelText("Unidad de medida")).toHaveValue("um-1");
    expect(screen.getByLabelText(/stock mínimo/i)).toHaveValue(5);

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(enviado).toEqual({
        nombre: "Tóner negro HP 26A",
        familiaId: "fam-1",
        unidadMedidaId: "um-1",
        stockMinimo: 5,
      }),
    );
    expect(enviado).not.toHaveProperty("codigo");
    expect(enviado).not.toHaveProperty("codigosAlternativos");
    expect(enviado).not.toHaveProperty("compatibilidad");
  });

  it("al editar, la etiqueta Código muestra el código real — no 'Se genera al guardar'", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();

    renderWithProviders(<InsumoFormDialog insumo={buildInsumo()} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Código")).toHaveTextContent("TON001");
    expect(screen.queryByText(/se genera al guardar/i)).not.toBeInTheDocument();
  });

  /**
   * EL GEMELO INVERTIDO que cierra el agujero del WU-3 (issue #166): antes
   * (#162) existía un `<input>` de código en la edición, y borrarlo se
   * interpretaba como "no tocar". Ahora no hay ningún control que pueda
   * cambiar el código: ni un `<input>` para escribir uno nuevo, ni uno para
   * borrarlo. El PATCH nunca lleva `codigo`, sin que el usuario tenga que
   * hacer nada para lograrlo.
   */
  it("no existe ningún control para tocar el código al editar — el PATCH nunca lleva codigo", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();
    const insumo = buildInsumo();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/insumos/ins-1", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...insumo, ...enviado });
      }),
    );

    renderWithProviders(<InsumoFormDialog insumo={insumo} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.queryByRole("textbox", { name: "Código" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(enviado).not.toHaveProperty("codigo"));
  });

  it("borrar el stock mínimo en la edición manda stockMinimo: null explícito", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();
    const insumo = buildInsumo();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/insumos/ins-1", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...insumo, ...enviado, stockMinimo: null });
      }),
    );

    renderWithProviders(<InsumoFormDialog insumo={insumo} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const stockInput = await screen.findByLabelText(/stock mínimo/i);
    await user.clear(stockInput);
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(enviado.stockMinimo).toBeNull());
  });

  it("reabrir tras un cambio de la prop `insumo` muestra el valor vigente, no el del primer render", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();
    const insumoV1 = buildInsumo();
    const insumoV2 = buildInsumo({ nombre: "Tóner negro HP 26A (actualizado)" });

    const { rerender } = renderWithProviders(
      <InsumoFormDialog insumo={insumoV1} trigger={<button>Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(<InsumoFormDialog insumo={insumoV2} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Tóner negro HP 26A (actualizado)");
  });
});

describe("InsumoFormDialog — validación cliente-side", () => {
  it("nombre por encima del tope (255) no dispara la request", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();
    let llamado = false;
    server.use(
      http.post("/api/insumos", () => {
        llamado = true;
        return HttpResponse.json(buildInsumo(), { status: 201 });
      }),
    );

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));
    await user.type(screen.getByLabelText("Nombre"), "N".repeat(256));
    await user.selectOptions(await screen.findByLabelText("Familia"), "fam-1");
    await user.selectOptions(screen.getByLabelText("Unidad de medida"), "um-1");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no puede superar los 255 caracteres/i);
    expect(llamado).toBe(false);
  });

  /**
   * "codigo con guion y minúsculas viaja tal cual — lo normaliza el backend"
   * (#162) se QUITA, no se invierte: probaba la normalización de un
   * `<input>` de código que el issue #166 elimina del formulario por
   * completo. No hay equivalente posible — no queda ningún valor de código
   * que el cliente pueda tipear.
   */
  it("stockMinimo con un decimal de más no dispara la request (Postgres redondearía en silencio)", async () => {
    mockCatalogosConDatos();
    const user = userEvent.setup();
    let llamado = false;
    server.use(
      http.post("/api/insumos", () => {
        llamado = true;
        return HttpResponse.json(buildInsumo(), { status: 201 });
      }),
    );

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));
    await user.type(screen.getByLabelText("Nombre"), "Tóner");
    await user.selectOptions(await screen.findByLabelText("Familia"), "fam-1");
    await user.selectOptions(screen.getByLabelText("Unidad de medida"), "um-1");
    await user.type(screen.getByLabelText(/stock mínimo/i), "12.345");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/máximo 2 decimales/i);
    expect(llamado).toBe(false);
  });
});

/**
 * Un catálogo vacío es un estado alcanzable, no una hipótesis. Los DOS traen hoy
 * un piso sembrado —`familias_insumo` desde sdd/repuestos-familias,
 * `unidades_medida` desde el issue #155—, pero cualquiera de los dos vuelve a
 * quedar sin opciones si el administrador desactiva todas. Sin este manejo, el
 * usuario se queda mirando dos `<select>` sin ninguna opción y sin ninguna
 * pista de qué hacer al respecto.
 */
describe("InsumoFormDialog — catálogos auxiliares vacíos", () => {
  it("sin familias ni unidades cargadas, avisa y deshabilita los dos selects", async () => {
    server.use(
      http.get("/api/familias-insumo", () => HttpResponse.json([])),
      http.get("/api/unidades-medida", () => HttpResponse.json([])),
    );
    const user = userEvent.setup();

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));

    expect(await screen.findByText(/no hay familias de insumo cargadas/i)).toBeInTheDocument();
    expect(screen.getByText(/no hay unidades de medida cargadas/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Familia")).toBeDisabled();
    expect(screen.getByLabelText("Unidad de medida")).toBeDisabled();
  });

  /**
   * Gemelo invertido de la nota: no alcanza con que AVISE, tiene que mandar a la
   * pantalla CORRECTA. Desde el issue #156 los dos catálogos se administran en
   * lugares distintos —familias en Admin > Insumos, unidades en Admin >
   * Unidades—, así que una nota que apunta a la pantalla equivocada reproduce el
   * callejón sin salida que ese issue existe para cerrar, y encima mintiendo.
   * Sin este test, el texto se vuelve falso el día que un catálogo se mude y
   * nada lo delata.
   */
  it("cada nota manda a SU pantalla: familias a Insumos, unidades a Unidades", async () => {
    server.use(
      http.get("/api/familias-insumo", () => HttpResponse.json([])),
      http.get("/api/unidades-medida", () => HttpResponse.json([])),
    );
    const user = userEvent.setup();

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));

    const notaFamilias = await screen.findByText(/no hay familias de insumo cargadas/i);
    const notaUnidades = screen.getByText(/no hay unidades de medida cargadas/i);

    expect(notaFamilias).toHaveTextContent("Admin > Insumos");
    expect(notaUnidades).toHaveTextContent("Admin > Unidades");
    // Y el inverso, que es el que se rompe solo: la nota de unidades NO debe
    // seguir mandando a Insumos.
    expect(notaUnidades).not.toHaveTextContent("Admin > Insumos");
  });
});

/**
 * Regresión de la clase "select con valor fuera de catálogo" documentada en
 * AGENTS.md, en su variante de CARGA: no es que el valor se haya dado de baja,
 * es que el catálogo todavía no resolvió cuando el diálogo abrió.
 *
 * Un `<select>` NATIVO no puede mostrar un valor cuya `<option>` no existe: cae
 * al placeholder mientras react-hook-form conserva el valor guardado en su
 * store. Sin el arreglo, el usuario ve "Elegí una familia" y guarda igual el
 * `fam-1` viejo — sin error, sin log, y con la pantalla diciendo otra cosa.
 */
describe("InsumoFormDialog — editar con el catálogo todavía en vuelo", () => {
  it("no deja operar el select hasta que la familia resuelve, y entonces muestra el valor guardado", async () => {
    let liberar: () => void = () => {};
    const enVuelo = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    server.use(
      http.get("/api/familias-insumo", async () => {
        await enVuelo;
        return HttpResponse.json([buildFamilia()]);
      }),
      http.get("/api/unidades-medida", () => HttpResponse.json([buildUnidad()])),
    );

    const user = userEvent.setup();
    renderWithProviders(<InsumoFormDialog trigger={<button>Editar</button>} insumo={buildInsumo()} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    // Con el catálogo en vuelo el control no se puede tocar: una lista
    // incompleta no puede recibir una decisión del usuario.
    const familia = screen.getByLabelText("Familia") as HTMLSelectElement;
    expect(familia).toBeDisabled();

    liberar();

    // Cuando resuelve, la `<option>` existe y el DOM muestra el valor guardado.
    await waitFor(() => expect(familia).not.toBeDisabled());
    await waitFor(() => expect(familia.value).toBe("fam-1"));
  });
});

/**
 * El tercer estado del catálogo, que faltaba: CAÍDO. La suite ya cubría vacío y
 * en vuelo. Sin distinguirlo, un 500 se lee como catálogo vacío —`data` es
 * `undefined` y el `?? []` lo aplana a cero— y la pantalla le dice al usuario
 * que cargue un catálogo que ya existe, sin mencionar la falla y sin camino de
 * recuperación.
 */
describe("InsumoFormDialog — el catálogo se cayó", () => {
  it("dice que no se pudo cargar, y NO que esté vacío", async () => {
    server.use(
      http.get("/api/familias-insumo", () => new HttpResponse(null, { status: 500 })),
      http.get("/api/unidades-medida", () => HttpResponse.json([buildUnidad()])),
    );

    const user = userEvent.setup();
    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));

    expect(await screen.findByText(/no se pudieron cargar las familias/i)).toBeInTheDocument();
    // El caso hermano, con la condición invertida: NO se muestra el texto de
    // catálogo vacío, que mandaría a cargar algo que ya existe.
    expect(screen.queryByText(/no hay familias de insumo cargadas/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Familia")).toBeDisabled();
  });
});

/**
 * La transición que el test de estado estático no agarra: la query se cae y
 * después se recupera sola (`refetchOnWindowFocus`). El guard que habilita el
 * efecto tiene que enumerar la condición REAL —hay entradas—, no "ya no está
 * cargando": con `!== "CARGANDO"` el efecto disparaba en NO_DISPONIBLE, cuando
 * las `<option>` todavía no existen, y no volvía a correr al resolver. El
 * usuario quedaba viendo el placeholder en un select habilitado, y el PATCH
 * mandaba el valor viejo.
 */
describe("InsumoFormDialog — el catálogo se cae y se recupera", () => {
  it("reaplica el valor guardado cuando el catálogo llega DESPUÉS de haber fallado", async () => {
    let intentos = 0;
    server.use(
      http.get("/api/familias-insumo", () => {
        intentos += 1;
        return intentos === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json([buildFamilia()]);
      }),
      http.get("/api/unidades-medida", () => HttpResponse.json([buildUnidad()])),
    );

    const user = userEvent.setup();
    renderWithProviders(<InsumoFormDialog trigger={<button>Editar</button>} insumo={buildInsumo()} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const familia = (await screen.findByLabelText("Familia")) as HTMLSelectElement;
    await waitFor(() => expect(screen.getByText(/no se pudieron cargar las familias/i)).toBeInTheDocument());

    // La recuperación: el catálogo resuelve en el segundo intento.
    focusManager.setFocused(false);
    focusManager.setFocused(true);

    await waitFor(() => expect(familia).not.toBeDisabled());
    // El assert que importa: el DOM muestra el valor guardado, no el placeholder.
    await waitFor(() => expect(familia.value).toBe("fam-1"));
  });
});
