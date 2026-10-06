import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { PrioridadList } from "./prioridad-list";
import type { Prioridad } from "@/features/tickets/types";

function buildPrioridad(overrides: Partial<Prioridad>): Prioridad {
  return {
    id: "p1",
    codigo: "ALTA",
    nombre: "Alta",
    color: null,
    orden: 1,
    activo: true,
    slaHoras: null,
    slaActivo: true,
    slaPrimeraRespuestaHoras: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PrioridadList — columna Primera respuesta", () => {
  it("muestra las horas de la meta, o «Sin meta» cuando no hay", async () => {
    server.use(
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([
          buildPrioridad({ id: "p1", codigo: "ALTA", slaPrimeraRespuestaHoras: 4 }),
          buildPrioridad({ id: "p2", codigo: "BAJA", slaPrimeraRespuestaHoras: null }),
        ]),
      ),
    );

    renderWithProviders(<PrioridadList />);

    expect(await screen.findByRole("columnheader", { name: "Primera respuesta" })).toBeInTheDocument();
    expect(await screen.findByText("4h")).toBeInTheDocument();
    expect(screen.getByText("Sin meta")).toBeInTheDocument();
  });
});
