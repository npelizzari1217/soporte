import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ReparacionesList } from "./reparaciones-list";
import type { ReparacionListItem } from "../types";

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
