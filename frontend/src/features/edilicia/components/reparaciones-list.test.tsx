import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
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
});
