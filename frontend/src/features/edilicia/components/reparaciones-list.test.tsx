import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ReparacionesList } from "./reparaciones-list";
import type { ReparacionListItem, SubtareaEdilicia } from "../types";

function buildReparacion(overrides: Partial<ReparacionListItem> = {}): ReparacionListItem {
  return {
    id: "rep1",
    ticketId: "tk1",
    numero: "EDI-0001",
    titulo: "Reparar cañería",
    estadoId: "estado-nuevo",
    ubicacion: "Edificio Central",
    personalAsignadoId: null,
    porcentajeAvance: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    subtareas: [],
    cantidadComentarios: 0,
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
  // conteo), a diferencia del de subtareas que es un `Button` pelado.
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

describe("ReparacionesList — el avance de la fila sigue a las subtareas", () => {
  function subtarea(overrides: Partial<SubtareaEdilicia> = {}): SubtareaEdilicia {
    return {
      id: "st1",
      ticketEdiliciaId: "rep5",
      descripcion: "Cerrar la llave de paso",
      completada: true,
      completadaEn: "2026-08-19T10:00:00.000Z",
      completadaPorId: "u1",
      orden: 1,
      createdAt: "2026-08-19T09:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z",
      ...overrides,
    };
  }

  /**
   * El porcentaje de avance viaja en el LISTADO, no en la query de subtareas.
   * Agregar o eliminar una subtarea cambia el DENOMINADOR del cálculo, así que
   * si la mutación no invalida `["reparaciones"]` la fila muestra un avance
   * viejo hasta que alguien recarga — y la Ayuda llegó a documentar ese
   * "actualice la página" como si fuera comportamiento esperado.
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
    const pendiente = subtarea({ id: "st2", descripcion: "Cambiar la canilla", completada: false, completadaEn: null, completadaPorId: null, orden: 2 });

    // Estado del servidor: arranca según la acción a probar y cambia con ella.
    let subtareas: SubtareaEdilicia[] = accion === "agregar" ? [completada] : [completada, pendiente];
    const avance = () => Math.round((subtareas.filter((s) => s.completada).length / subtareas.length) * 100);

    server.use(
      http.get("/api/reparaciones", () =>
        HttpResponse.json([
          buildReparacion({ id: "rep5", numero: "EDI-0005", porcentajeAvance: avance(), subtareas }),
        ]),
      ),
      http.post("/api/reparaciones/rep5/subtareas", () => {
        subtareas = [...subtareas, pendiente];
        return HttpResponse.json(pendiente, { status: 201 });
      }),
      http.delete("/api/reparaciones/subtareas/st2", () => {
        subtareas = subtareas.filter((s) => s.id !== "st2");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ReparacionesList />, {
      user: buildUser({ permisos: ["EDILICIA:LECTURA", "EDILICIA:ALTAS", "EDILICIA:BORRADO"] }),
    });

    await screen.findByText("EDI-0005");
    const avanceInicial = accion === "agregar" ? "100%" : "50%";
    expect(within(filaDe("EDI-0005")).getByText(avanceInicial)).toBeInTheDocument();

    await user.click(within(filaDe("EDI-0005")).getByRole("button", { name: /ver subtareas/i }));
    const dialogo = await screen.findByRole("dialog");

    if (accion === "agregar") {
      await user.type(within(dialogo).getByLabelText(/nueva subtarea/i), "Cambiar la canilla");
      await user.click(within(dialogo).getByRole("button", { name: /^agregar$/i }));
    } else {
      await user.click(
        within(dialogo).getByRole("button", { name: `Eliminar subtarea ${pendiente.descripcion}` }),
      );
    }

    await user.keyboard("{Escape}");

    // La fila refleja el avance nuevo sin recargar la página.
    const avanceEsperado = accion === "agregar" ? "50%" : "100%";
    expect(await within(filaDe("EDI-0005")).findByText(avanceEsperado)).toBeInTheDocument();
  });
});
