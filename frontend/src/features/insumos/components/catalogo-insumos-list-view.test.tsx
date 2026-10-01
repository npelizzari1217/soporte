import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CatalogoInsumosListView } from "./catalogo-insumos-list-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function mockCatalogos(): void {
  server.use(
    http.get("/api/insumos", () => HttpResponse.json([])),
    http.get("/api/familias-insumo", () => HttpResponse.json([])),
    http.get("/api/unidades-medida", () => HttpResponse.json([])),
  );
}

describe("CatalogoInsumosListView — enlace al reporte de stock (R7)", () => {
  it("con INSUMOS:LECTURA el enlace apunta al reporte con esRepuesto de la sección", async () => {
    mockCatalogos();
    renderWithProviders(
      <CatalogoInsumosListView esRepuesto={true} tituloSeccion="Repuestos" nombreSingular="repuesto" />,
      { user: buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] }) },
    );

    const enlace = await screen.findByRole("link", { name: "Reporte de stock" });
    expect(enlace).toHaveAttribute("href", "/insumos/reporte-stock?esRepuesto=true");
  });

  it("la sección de consumibles precarga esRepuesto=false", async () => {
    mockCatalogos();
    renderWithProviders(
      <CatalogoInsumosListView esRepuesto={false} tituloSeccion="Insumos" nombreSingular="insumo" />,
      { user: buildUser({ permisos: ["INSUMOS:LECTURA"], modulos: ["INSUMOS"] }) },
    );

    const enlace = await screen.findByRole("link", { name: "Reporte de stock" });
    expect(enlace).toHaveAttribute("href", "/insumos/reporte-stock?esRepuesto=false");
  });

  it("sin INSUMOS:LECTURA el enlace no aparece", async () => {
    mockCatalogos();
    renderWithProviders(
      <CatalogoInsumosListView esRepuesto={false} tituloSeccion="Insumos" nombreSingular="insumo" />,
      { user: buildUser({ permisos: [], modulos: ["INSUMOS"] }) },
    );

    expect(await screen.findByText(/no tiene permiso para ver el catálogo/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reporte de stock" })).not.toBeInTheDocument();
  });
});
