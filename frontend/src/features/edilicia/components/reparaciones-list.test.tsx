import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ReparacionesList } from "./reparaciones-list";
import type { ReparacionListItem, SubtareaEdilicia } from "../types";
import type { TareaTicket } from "@/features/tickets/types";

function buildReparacion(overrides: Partial<ReparacionListItem> = {}): ReparacionListItem {
  return {
    id: "rep1",
    ticketId: "tk1",
    numero: "EDI-0001",
    titulo: "Reparar cañería",
    descripcion: null,
    prioridadId: "prioridad-media",
    estadoId: "estado-nuevo",
    ubicacion: "Edificio Central",
    sectorId: null,
    sectorNombre: null,
    porcentajeAvance: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    subtareas: [],
    cantidadComentarios: 0,
    bloqueada: false,
    comprasQueBloquean: [],
    ...overrides,
  };
}

/** Localiza la fila de la tabla por el número de reparación. */
function filaDe(numero: string): HTMLElement {
  return screen.getByText(numero).closest("tr") as HTMLElement;
}

describe("ReparacionesList — indicador de comentarios por fila", () => {
  it("muestra el conteo en un badge y lo anuncia en el nombre accesible del botón", async () => {
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({ id: "rep1", numero: "EDI-0001", cantidadComentarios: 3 }),
          buildReparacion({ id: "rep2", numero: "EDI-0002", cantidadComentarios: 1 }),
        ]),
      ),
    );

    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0001");

    const fila = within(filaDe("EDI-0001"));
    expect(fila.getByText("3")).toBeInTheDocument();
    expect(fila.getByRole("button", { name: "Ver comentarios (3 comentarios)" })).toBeInTheDocument();

    // Singular: un contador que dice "1 comentarios" delata que nadie lo leyó.
    const filaUno = within(filaDe("EDI-0002"));
    expect(filaUno.getByRole("button", { name: "Ver comentarios (1 comentario)" })).toBeInTheDocument();
  });

  it("sin comentarios no renderiza badge y el botón queda sin conteo", async () => {
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([buildReparacion({ numero: "EDI-0003", cantidadComentarios: 0 })]),
      ),
    );

    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0003");

    const fila = within(filaDe("EDI-0003"));
    expect(fila.queryByText("0")).not.toBeInTheDocument();
    expect(fila.getByRole("button", { name: "Ver comentarios" })).toBeInTheDocument();
  });

  // El disparador de comentarios es un componente propio (lleva el badge del
  // conteo), igual que el de subtareas desde odd/ubicacion-sector-ticket.
  // `DialogTrigger asChild` CLONA el hijo e inyecta `onClick` y el `ref`: si el
  // componente no hace spread de props ni reenvía el ref, el click se pierde y
  // el modal no abre nunca. Los tests de etiqueta no lo ven — pasaban en verde
  // con el botón muerto.
  it.each([
    ["con badge", 3, "Ver comentarios (3 comentarios)"],
    ["sin badge", 0, "Ver comentarios"],
  ])("el boton abre el modal (%s)", async (_caso, cantidadComentarios, nombreAccesible) => {
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([buildReparacion({ id: "rep9", numero: "EDI-0009", cantidadComentarios })]),
      ),
      http.get("/api/reparaciones/rep9/comentarios", () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    renderWithProviders(<ReparacionesList />, {
      user: buildUser({ permisos: ["EDILICIA:LECTURA"] }),
    });

    await screen.findByText("EDI-0009");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(filaDe("EDI-0009")).getByRole("button", { name: nombreAccesible }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Comentarios — EDI-0009")).toBeInTheDocument();
  });

  // El contador de la fila viaja dentro del LISTADO (`cantidadComentarios`), no
  // dentro de la query de comentarios. Si al comentar sólo se invalida esta
  // última, el modal se actualiza y el badge se queda con el número viejo hasta
  // que alguien recarga. Los tests de conteo no lo ven: verifican que el número
  // sea correcto, no que se ACTUALICE cuando pasa lo único que lo cambia.
  it("comentar actualiza el contador de la fila sin recargar", async () => {
    let comentarios = 0;
    const nuevo = {
      id: "c1",
      ticketEdiliciaId: "rep7",
      texto: "Falta el repuesto",
      autorId: "u1",
      autorNombre: null,
      autorApellido: null,
      createdAt: "2026-08-19T10:00:00.000Z",
    };
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({ id: "rep7", numero: "EDI-0007", cantidadComentarios: comentarios }),
        ]),
      ),
      http.get("/api/reparaciones/rep7/comentarios", () =>
        HttpResponse.json(comentarios === 0 ? [] : [nuevo]),
      ),
      http.post("/api/reparaciones/rep7/comentarios", () => {
        comentarios += 1;
        return HttpResponse.json(nuevo, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ReparacionesList />, {
      user: buildUser({ permisos: ["EDILICIA:LECTURA", "EDILICIA:ALTAS"] }),
    });

    await screen.findByText("EDI-0007");
    const fila = within(filaDe("EDI-0007"));
    expect(fila.getByRole("button", { name: "Ver comentarios" })).toBeInTheDocument();

    await user.click(fila.getByRole("button", { name: "Ver comentarios" }));
    const dialogo = await screen.findByRole("dialog");
    await screen.findByText(/sin comentarios/i);

    await user.type(within(dialogo).getByLabelText(/nuevo comentario/i), "Falta el repuesto");
    await user.click(within(dialogo).getByRole("button", { name: /^comentar$/i }));

    // El comentario entró: el modal ya lo muestra.
    expect(await within(dialogo).findByText("Falta el repuesto")).toBeInTheDocument();

    // Con el modal abierto, Radix marca `aria-hidden` el resto del documento y
    // la fila desaparece del árbol de accesibilidad. Hay que cerrarlo para ver
    // el contador — que además es el recorrido real del usuario.
    await user.keyboard("{Escape}");

    // El badge de la fila refleja el comentario nuevo, sin recargar la página.
    expect(
      await screen.findByRole("button", { name: "Ver comentarios (1 comentario)" }),
    ).toBeInTheDocument();
  });
});

/** Subtarea embebida mínima: el conteo del botón solo mira cuántas hay. */
function buildSubtarea(id: string): SubtareaEdilicia {
  return {
    id,
    ticketEdiliciaId: "rep1",
    descripcion: `Tarea ${id}`,
    completada: false,
    completadaEn: null,
    completadaPorId: null,
    orden: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("ReparacionesList — cantidad de subtareas en el botón (odd/ubicacion-sector-ticket, CA5)", () => {
  it("muestra la cantidad en un badge y la anuncia en el nombre accesible, en singular y plural", async () => {
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({
            id: "rep1",
            numero: "EDI-0001",
            subtareas: [buildSubtarea("a"), buildSubtarea("b"), buildSubtarea("c")],
          }),
          buildReparacion({ id: "rep2", numero: "EDI-0002", subtareas: [buildSubtarea("d")] }),
        ]),
      ),
    );

    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0001");

    const fila = within(filaDe("EDI-0001"));
    expect(fila.getByRole("button", { name: "Ver subtareas (3 subtareas)" })).toHaveTextContent("3");
    expect(
      within(filaDe("EDI-0002")).getByRole("button", { name: "Ver subtareas (1 subtarea)" }),
    ).toBeInTheDocument();
  });

  it("sin subtareas no renderiza badge y el botón queda sin conteo", async () => {
    server.use(
      http.get("/api/reparaciones", () => HttpResponse.json([buildReparacion({ numero: "EDI-0003" })])),
    );

    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0003");
    const boton = within(filaDe("EDI-0003")).getByRole("button", { name: "Ver subtareas" });
    expect(boton).toHaveTextContent(/^Ver subtareas$/);
  });

  // Mismo riesgo que el de comentarios: un disparador propio que no reenvía ref
  // ni props deja el modal sin abrir, y los tests de etiqueta no lo ven.
  it("el botón con badge abre el modal de subtareas", async () => {
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({ id: "rep8", ticketId: "tk8", numero: "EDI-0008", subtareas: [buildSubtarea("a")] }),
        ]),
      ),
      http.get("/api/tickets/tk8/tareas", () =>
        HttpResponse.json({ items: [], avance: { total: 0, completadas: 0, porcentaje: 0 } }),
      ),
      http.get("/api/tickets/tk8/tareas/tecnicos-elegibles", () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0008");
    await user.click(within(filaDe("EDI-0008")).getByRole("button", { name: "Ver subtareas (1 subtarea)" }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Subtareas — EDI-0008")).toBeInTheDocument();
  });
});

describe("ReparacionesList — columna Sector (odd/ubicacion-sector-ticket, CA4)", () => {
  it("muestra el sector por su nombre, con guion cuando no hay, y conserva la ubicación propia", async () => {
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({ id: "rep1", numero: "EDI-0001", sectorId: "s1", sectorNombre: "Primaria" }),
          buildReparacion({ id: "rep2", numero: "EDI-0002", ubicacion: null }),
        ]),
      ),
    );

    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0001");
    expect(screen.getByRole("columnheader", { name: "Sector" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Ubicación" })).toBeInTheDocument();

    const conSector = within(filaDe("EDI-0001"));
    expect(conSector.getByText("Primaria")).toBeInTheDocument();
    expect(conSector.getByText("Edificio Central")).toBeInTheDocument();

    // Sin ubicación propia ni sector: un guion por cada columna.
    expect(within(filaDe("EDI-0002")).getAllByText("—")).toHaveLength(2);
  });
});

describe("ReparacionesList — el avance de la fila sigue a las tareas", () => {
  function subtarea(overrides: Partial<TareaTicket> = {}): TareaTicket {
    return {
      id: "st1",
      ticketId: "tk5",
      descripcion: "Cerrar la llave de paso",
      orden: 1,
      tecnicoId: null,
      tecnicoNombre: null,
      tecnicoApellido: null,
      completada: true,
      completadaEn: "2026-08-19T10:00:00.000Z",
      completadaPorId: "u1",
      completadaPorNombre: "Juan",
      completadaPorApellido: "Pérez",
      createdAt: "2026-08-19T09:00:00.000Z",
      ...overrides,
    };
  }

  /**
   * El porcentaje de avance viaja en el LISTADO, no en la query de tareas.
   * Agregar o eliminar una tarea cambia el DENOMINADOR del cálculo, así que
   * si la mutación no invalida `["reparaciones"]` la fila muestra un avance
   * viejo hasta que alguien recarga — y la Ayuda llegó a documentar ese
   * "actualice la página" como si fuera comportamiento esperado. Desde T6 el
   * diálogo pega en las rutas genéricas `/tickets/:ticketId/tareas`.
   *
   * Ojo con el modal abierto: Radix marca `aria-hidden` el resto del documento,
   * así que la fila desaparece del árbol de accesibilidad. Hay que cerrarlo
   * antes de afirmar sobre ella — que además es el recorrido real.
   */
  it.each([
    ["agregar una subtarea baja el avance", "agregar"],
    ["eliminar una subtarea lo sube", "eliminar"],
  ])("%s", async (_caso, accion) => {
    const completada = subtarea();
    const pendiente = subtarea({ id: "st2", descripcion: "Cambiar la canilla", completada: false, completadaEn: null, completadaPorId: null, completadaPorNombre: null, completadaPorApellido: null, orden: 2 });

    // Estado del servidor: arranca según la acción a probar y cambia con ella.
    let tareas: TareaTicket[] = accion === "agregar" ? [completada] : [completada, pendiente];
    const completadas = () => tareas.filter((t) => t.completada).length;
    const avance = () => Math.round((completadas() / tareas.length) * 100);

    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({ id: "rep5", ticketId: "tk5", numero: "EDI-0005", porcentajeAvance: avance() }),
        ]),
      ),
      http.get("/api/tickets/tk5/tareas", () =>
        HttpResponse.json({ items: tareas, avance: { total: tareas.length, completadas: completadas(), porcentaje: avance() } }),
      ),
      http.get("/api/tickets/tk5/tareas/tecnicos-elegibles", () => HttpResponse.json([])),
      http.post("/api/tickets/tk5/tareas", () => {
        tareas = [...tareas, pendiente];
        return HttpResponse.json(pendiente, { status: 201 });
      }),
      http.delete("/api/tickets/tk5/tareas/st2", () => {
        tareas = tareas.filter((t) => t.id !== "st2");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    // ADMINISTRADOR (el fixture base) con el permiso del módulo: gestiona sin ser el responsable.
    const user = userEvent.setup();
    renderWithProviders(<ReparacionesList />, {
      user: buildUser({ permisos: ["EDILICIA:LECTURA", "EDILICIA:MODIFICACION"] }),
    });

    await screen.findByText("EDI-0005");
    const avanceInicial = accion === "agregar" ? "100%" : "50%";
    expect(within(filaDe("EDI-0005")).getByText(avanceInicial)).toBeInTheDocument();

    await user.click(within(filaDe("EDI-0005")).getByRole("button", { name: /ver subtareas/i }));
    const dialogo = await screen.findByRole("dialog");

    if (accion === "agregar") {
      await user.type(await within(dialogo).findByLabelText("Nueva tarea"), "Cambiar la canilla");
      await user.click(within(dialogo).getByRole("button", { name: /^agregar$/i }));
      await within(dialogo).findByText("Cambiar la canilla");
    } else {
      await user.click(
        await within(dialogo).findByRole("button", { name: `Eliminar tarea ${pendiente.descripcion}` }),
      );
      await user.click(await screen.findByRole("button", { name: "Eliminar" }));
      await waitFor(() => expect(within(dialogo).queryByText("Cambiar la canilla")).not.toBeInTheDocument());
    }

    await user.keyboard("{Escape}");

    // La fila refleja el avance nuevo sin recargar la página.
    const avanceEsperado = accion === "agregar" ? "50%" : "100%";
    expect(await within(filaDe("EDI-0005")).findByText(avanceEsperado)).toBeInTheDocument();
  });
});

describe("ReparacionesList — chip y filtro de bloqueo por compra", () => {
  it("muestra el chip «Bloqueada» sin número cuando bloqueada es true, y no lo muestra cuando es false", async () => {
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({
            id: "rep1",
            numero: "EDI-0001",
            bloqueada: true,
            comprasQueBloquean: [
              { id: "compra1", numero: "COM-0001" },
              { id: "compra2", numero: "COM-0002" },
            ],
          }),
          buildReparacion({ id: "rep2", numero: "EDI-0002", bloqueada: false, comprasQueBloquean: [] }),
        ]),
      ),
    );

    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0001");

    const filaBloqueada = within(filaDe("EDI-0001"));
    expect(filaBloqueada.getByText("Bloqueada")).toBeInTheDocument();
    // Decisión de producto (#2440): el chip NO cuenta compras. "Bloqueada (2)" sería incorrecto.
    expect(filaBloqueada.queryByText(/Bloqueada\s*\(/)).not.toBeInTheDocument();
    expect(filaBloqueada.queryByText("2")).not.toBeInTheDocument();

    const filaLibre = within(filaDe("EDI-0002"));
    expect(filaLibre.queryByText("Bloqueada")).not.toBeInTheDocument();
  });

  it("el filtro Bloqueadas/No bloqueadas oculta filas en el cliente SIN volver a consultar al servidor", async () => {
    let llamadasAlServidor = 0;
    server.use(
      http.get("/api/reparaciones", () => {
        llamadasAlServidor += 1;
        return HttpResponse.json([
          buildReparacion({
            id: "rep1",
            numero: "EDI-0001",
            bloqueada: true,
            comprasQueBloquean: [{ id: "compra1", numero: "COM-0001" }],
          }),
          buildReparacion({ id: "rep2", numero: "EDI-0002", bloqueada: false, comprasQueBloquean: [] }),
        ]);
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0001");
    await screen.findByText("EDI-0002");
    expect(llamadasAlServidor).toBe(1);

    await user.selectOptions(screen.getByLabelText(/bloqueo/i), "BLOQUEADAS");
    await screen.findByText("EDI-0001");
    expect(screen.queryByText("EDI-0002")).not.toBeInTheDocument();
    // El filtro es client-side (D8): cambiar de opción no dispara un nuevo fetch.
    expect(llamadasAlServidor).toBe(1);

    await user.selectOptions(screen.getByLabelText(/bloqueo/i), "NO_BLOQUEADAS");
    await screen.findByText("EDI-0002");
    expect(screen.queryByText("EDI-0001")).not.toBeInTheDocument();
    expect(llamadasAlServidor).toBe(1);

    await user.selectOptions(screen.getByLabelText(/bloqueo/i), "TODAS");
    await screen.findByText("EDI-0001");
    await screen.findByText("EDI-0002");
    expect(llamadasAlServidor).toBe(1);
  });
});

describe("ReparacionesList — editar una reparación no empezada (odd/detalle-ticket-legible, S6)", () => {
  // El schema exige UUID en la prioridad: ids reales, no de fantasía.
  const PRIORIDAD_MEDIA = "11111111-1111-4111-8111-111111111111";
  const PRIORIDAD_ALTA = "22222222-2222-4222-8222-222222222222";
  function mockCatalogos() {
    server.use(
      http.get("/api/catalogos/estados", () =>
        HttpResponse.json([
          { id: "estado-nuevo", codigo: "NUEVO", nombre: "Nuevo", color: null, orden: 1, activo: true },
          { id: "estado-en-proceso", codigo: "EN_PROCESO", nombre: "En proceso", color: null, orden: 3, activo: true },
        ]),
      ),
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([
          { id: PRIORIDAD_MEDIA, codigo: "MEDIA", nombre: "Media", color: null, orden: 2, activo: true },
          { id: PRIORIDAD_ALTA, codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true },
        ]),
      ),
      http.get("/api/sectores", () => HttpResponse.json([])),
    );
  }

  it("sin EDILICIA:MODIFICACION no hay botón Editar", async () => {
    mockCatalogos();
    server.use(http.get("/api/reparaciones", () => HttpResponse.json([buildReparacion({ numero: "EDI-0010" })])));

    renderWithProviders(<ReparacionesList />, { user: buildUser({ permisos: ["EDILICIA:LECTURA"] }) });

    await screen.findByText("EDI-0010");
    expect(screen.queryByRole("button", { name: /editar EDI-0010/i })).not.toBeInTheDocument();
  });

  it("con permiso: habilitado en NUEVO sin tareas completadas; deshabilitado con motivo en proceso, con tarea completada o bloqueada", async () => {
    mockCatalogos();
    const tareaHecha: SubtareaEdilicia = {
      id: "st1",
      ticketEdiliciaId: "rep-tarea",
      descripcion: "Hecha",
      completada: true,
      completadaEn: "2026-01-02T00:00:00.000Z",
      completadaPorId: "u1",
      orden: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({ id: "rep-ok", numero: "EDI-0020" }),
          buildReparacion({ id: "rep-proceso", numero: "EDI-0021", estadoId: "estado-en-proceso" }),
          buildReparacion({ id: "rep-tarea", numero: "EDI-0022", subtareas: [tareaHecha] }),
          buildReparacion({ id: "rep-bloq", numero: "EDI-0023", bloqueada: true }),
        ]),
      ),
    );

    renderWithProviders(<ReparacionesList />, {
      user: buildUser({ permisos: ["EDILICIA:LECTURA", "EDILICIA:MODIFICACION"] }),
    });

    await screen.findByText("EDI-0020");
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar EDI-0020" })).toBeEnabled());
    const enProceso = screen.getByRole("button", { name: "Editar EDI-0021" });
    expect(enProceso).toBeDisabled();
    expect(within(filaDe("EDI-0021")).getByText(/ya está en proceso/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar EDI-0022" })).toBeDisabled();
    expect(within(filaDe("EDI-0022")).getByText(/tareas completadas/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar EDI-0023" })).toBeDisabled();
    expect(within(filaDe("EDI-0023")).getByText(/bloqueada por una compra/i)).toBeInTheDocument();
  });

  it("ROOT edita una reparación en proceso, pero no una bloqueada", async () => {
    mockCatalogos();
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({ id: "rep-proceso", numero: "EDI-0031", estadoId: "estado-en-proceso" }),
          buildReparacion({ id: "rep-bloq", numero: "EDI-0032", bloqueada: true }),
        ]),
      ),
    );

    renderWithProviders(<ReparacionesList />, {
      user: buildUser({ is_global_admin: true, permisos: ["EDILICIA:LECTURA", "EDILICIA:MODIFICACION"] }),
    });

    await screen.findByText("EDI-0031");
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar EDI-0031" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Editar EDI-0032" })).toBeDisabled();
  });

  it("el diálogo precarga la fila y hace PATCH /reparaciones/:id con los cinco campos; el listado se refresca", async () => {
    const user = userEvent.setup();
    mockCatalogos();
    let titulo = "Reparar cañería";
    let bodyRecibido: unknown = null;
    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({
            id: "rep-ok",
            numero: "EDI-0040",
            titulo,
            descripcion: "Gotea",
            ubicacion: "Aula 1",
            prioridadId: PRIORIDAD_MEDIA,
          }),
        ]),
      ),
      http.patch("/api/reparaciones/rep-ok", async ({ request }) => {
        bodyRecibido = await request.json();
        titulo = "Reparar la cañería del baño";
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<ReparacionesList />, {
      user: buildUser({ permisos: ["EDILICIA:LECTURA", "EDILICIA:MODIFICACION"] }),
    });

    await screen.findByText("EDI-0040");
    await user.click(await screen.findByRole("button", { name: "Editar EDI-0040" }));
    const dialogo = await screen.findByRole("dialog");
    const campoTitulo = within(dialogo).getByLabelText("Título");
    expect(campoTitulo).toHaveValue("Reparar cañería");
    expect(within(dialogo).getByLabelText("Descripción")).toHaveValue("Gotea");
    expect(within(dialogo).getByLabelText("Ubicación")).toHaveValue("Aula 1");
    expect(within(dialogo).getByLabelText("Prioridad")).toHaveValue(PRIORIDAD_MEDIA);

    await user.clear(campoTitulo);
    await user.type(campoTitulo, "Reparar la cañería del baño");
    await user.selectOptions(within(dialogo).getByLabelText("Prioridad"), PRIORIDAD_ALTA);
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(bodyRecibido).toEqual({
        titulo: "Reparar la cañería del baño",
        descripcion: "Gotea",
        prioridadId: PRIORIDAD_ALTA,
        ubicacion: "Aula 1",
        sectorId: null,
      }),
    );
    expect(await screen.findByText("Reparar la cañería del baño")).toBeInTheDocument();
  });
});
