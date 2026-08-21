import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraBitacoraSection } from "./compra-bitacora-section";
import type { OperacionCompra } from "../types";

/**
 * CompraBitacoraSection — regresión de render-fechas-frontend: `createdAt`
 * (`@db.Timestamptz`, instante) ahora se renderiza con `formatearInstante`
 * en vez de una copia local de `Intl.DateTimeFormat`. Literal fijo, NO
 * derivado del mismo `Intl` que usa el componente (esa forma de comparar
 * queda ciega a una regresión de zona horaria).
 */
function buildOperacion(overrides: Partial<OperacionCompra> = {}): OperacionCompra {
  return {
    id: "op1",
    compraId: "compra1",
    itemCompraId: null,
    tipo: "CREACION",
    usuarioId: "u1",
    detalle: "Compra creada",
    datos: null,
    createdAt: "2026-08-18T13:00:00.000Z",
    ...overrides,
  };
}

describe("CompraBitacoraSection", () => {
  it("lista las operaciones con fecha y hora visibles (instante, horario argentino)", async () => {
    server.use(
      http.get("/api/compras/compra1/operaciones", () => HttpResponse.json([buildOperacion()])),
    );

    renderWithProviders(<CompraBitacoraSection compraId="compra1" />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByText("Creación")).toBeInTheDocument();
    // 2026-08-18T13:00:00.000Z = 10:00 en America/Argentina/Buenos_Aires (UTC-3).
    expect(screen.getByText("18/08/2026 10:00")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando la compra no tiene operaciones", async () => {
    server.use(http.get("/api/compras/compra1/operaciones", () => HttpResponse.json([])));

    renderWithProviders(<CompraBitacoraSection compraId="compra1" />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByText("Sin operaciones")).toBeInTheDocument();
  });
});
