import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { UnidadesInsumoSection } from "./unidades-insumo-section";
import type { UnidadInsumo } from "../types";

const LECTOR = buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] });
const INSUMO_ID = "ins-1";

function buildUnidad(overrides: Partial<UnidadInsumo> = {}): UnidadInsumo {
  return {
    id: "u-1",
    insumoId: INSUMO_ID,
    numeroSerie: "SN-001",
    condicion: "NUEVO",
    estado: "EN_DEPOSITO",
    equipoId: null,
    equipoNombre: null,
    ...overrides,
  };
}

/** Una unidad por cada estado, y una pendiente de serie en el depósito. */
const TODOS_LOS_ESTADOS: UnidadInsumo[] = [
  buildUnidad({ id: "u-1", numeroSerie: "SN-DEP" }),
  buildUnidad({ id: "u-2", numeroSerie: null }),
  buildUnidad({
    id: "u-3",
    numeroSerie: "SN-INS",
    condicion: "USADO",
    estado: "INSTALADA",
    equipoId: "eq-1",
    equipoNombre: "PC Administración",
  }),
  buildUnidad({ id: "u-4", numeroSerie: "SN-ENT", estado: "ENTREGADA" }),
  buildUnidad({ id: "u-5", numeroSerie: "SN-DES", condicion: "USADO", estado: "DESCARTADA" }),
];

function mockUnidades(unidades: UnidadInsumo[]): void {
  server.use(http.get("/api/insumos/:insumoId/unidades", () => HttpResponse.json(unidades)));
}

describe("UnidadesInsumoSection", () => {
  it("lista serial, condición, estado y equipo de cada unidad", async () => {
    mockUnidades(TODOS_LOS_ESTADOS);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });

    const fila = (await screen.findByText("SN-INS")).closest("tr") as HTMLElement;
    expect(within(fila).getByText("Usado")).toBeInTheDocument();
    expect(within(fila).getByText("Instalada")).toBeInTheDocument();
    expect(within(fila).getByText("PC Administración")).toBeInTheDocument();
    expect(screen.getByText("SN-DEP")).toBeInTheDocument();
    expect(screen.getByText("SN-ENT")).toBeInTheDocument();
    expect(screen.getByText("SN-DES")).toBeInTheDocument();
  });

  it("la unidad sin serial dice «Serie pendiente» y el contador cuenta las pendientes", async () => {
    mockUnidades(TODOS_LOS_ESTADOS);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });

    expect(await screen.findByText("Serie pendiente")).toBeInTheDocument();
    expect(screen.getByText("1 serie pendiente")).toBeInTheDocument();
  });

  it("sin pendientes no muestra el contador", async () => {
    mockUnidades([buildUnidad()]);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });

    expect(await screen.findByText("SN-001")).toBeInTheDocument();
    expect(screen.queryByText(/pendiente/i)).not.toBeInTheDocument();
  });

  it("filtrar por estado deja solo esas unidades y el contador sigue contando todas", async () => {
    mockUnidades(TODOS_LOS_ESTADOS);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });
    await screen.findByText("SN-INS");

    await userEvent.selectOptions(screen.getByLabelText("Filtrar por estado"), "DESCARTADA");

    expect(screen.getByText("SN-DES")).toBeInTheDocument();
    expect(screen.queryByText("SN-INS")).not.toBeInTheDocument();
    expect(screen.queryByText("SN-DEP")).not.toBeInTheDocument();
    expect(screen.getByText("1 serie pendiente")).toBeInTheDocument();
  });

  it("un estado sin unidades lo dice", async () => {
    mockUnidades([buildUnidad()]);
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });
    await screen.findByText("SN-001");

    await userEvent.selectOptions(screen.getByLabelText("Filtrar por estado"), "ENTREGADA");

    expect(screen.getByText("No hay unidades en ese estado.")).toBeInTheDocument();
  });

  it("si la consulta falla muestra el error", async () => {
    server.use(
      http.get("/api/insumos/:insumoId/unidades", () => HttpResponse.json({ message: "x" }, { status: 500 })),
    );
    renderWithProviders(<UnidadesInsumoSection insumoId={INSUMO_ID} />, { user: LECTOR });

    expect(await screen.findByText("No se pudieron cargar las unidades.")).toBeInTheDocument();
  });
});
