import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { FamiliaInsumoList } from "./familia-insumo-list";
import type { FamiliaInsumo } from "../types";

const CONSUMIBLE: FamiliaInsumo = {
  id: "fam-1",
  codigo: "TONER",
  nombre: "Tóner",
  activo: true,
  esRepuesto: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const REPUESTO: FamiliaInsumo = {
  id: "fam-2",
  codigo: "MOUSE",
  nombre: "Mouse",
  activo: true,
  esRepuesto: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/**
 * WU-2 (sdd/repuestos-seccion): el ABM de familias NO se parte en dos — sigue
 * mostrando todas, con un indicador de cuáles son de repuesto. Las dos
 * familias van juntas a propósito: un fixture con un solo tipo dejaría pasar
 * una columna que siempre pinta la misma etiqueta, sin importar el dato.
 */
describe("FamiliaInsumoList — indicador de repuesto (WU-2)", () => {
  it("distingue la familia de repuesto de la consumible en la misma tabla", async () => {
    server.use(http.get("/api/familias-insumo", () => HttpResponse.json([CONSUMIBLE, REPUESTO])));
    renderWithProviders(<FamiliaInsumoList />);

    await screen.findByText("TONER");
    expect(screen.getByText("Repuesto")).toBeInTheDocument();
    // Gemelo invertido: la familia consumible tiene que decir otra cosa, no
    // "Repuesto" también — si no, la columna sería un texto fijo, no un dato.
    expect(screen.getByText("Consumible")).toBeInTheDocument();
  });
});
