import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ExportarComprasButton } from "./exportar-compras-button";
import type { ComprasFiltros } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const FILTROS: ComprasFiltros = {
  pagina: 2,
  porPagina: 10,
  estado: "COMPLETADAS",
  sectorId: "11111111-1111-1111-1111-111111111111",
};

/** Abre el menú "Exportar" y elige un formato. */
async function exportarComo(formato: "Excel" | "CSV") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^exportar$/i }));
  await user.click(await screen.findByRole("menuitem", { name: formato }));
}

/**
 * jsdom no implementa la API de object URLs, y el anchor sintético es
 * justamente lo que dispara la descarga real: se stubbean para poder
 * observar con qué nombre bajó el archivo.
 */
let descargas: Array<{ nombre: string; href: string }>;

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  descargas = [];
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    descargas.push({ nombre: this.download, href: this.href });
  });
});

afterEach(() => vi.restoreAllMocks());

describe("ExportarComprasButton", () => {
  it("exporta con los filtros de la pantalla, SIN paginación, y usa el nombre del Content-Disposition", async () => {
    let urlPedida = "";
    server.use(
      http.get("/api/compras/export", ({ request }) => {
        urlPedida = request.url;
        return new HttpResponse("numero,motivo\n", {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="compras-2026-08-19.csv"',
          },
        });
      }),
    );

    renderWithProviders(<ExportarComprasButton filtros={FILTROS} />, { user: buildUser() });
    await exportarComo("CSV");

    await waitFor(() => expect(descargas).toHaveLength(1));

    const params = new URL(urlPedida).searchParams;
    expect(params.get("estado")).toBe("COMPLETADAS");
    expect(params.get("sectorId")).toBe(FILTROS.sectorId);
    // El punto entero de la función: el CSV es el universo filtrado completo.
    expect(params.get("pagina")).toBeNull();
    expect(params.get("porPagina")).toBeNull();

    expect(descargas[0].nombre).toBe("compras-2026-08-19.csv");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("422 (demasiadas filas) → muestra el mensaje de dominio del backend y NO descarga nada", async () => {
    server.use(
      http.get("/api/compras/export", () =>
        HttpResponse.json(
          {
            statusCode: 422,
            message: "La exportación supera las 5000 filas. Acotá los filtros.",
          },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(<ExportarComprasButton filtros={FILTROS} />, { user: buildUser() });
    await exportarComo("CSV");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "La exportación supera las 5000 filas. Acotá los filtros.",
      ),
    );
    expect(descargas).toHaveLength(0);
  });

  it("sin Content-Disposition legible → cae en un nombre por defecto en vez de bajar un archivo sin nombre", async () => {
    server.use(
      http.get("/api/compras/export", () =>
        new HttpResponse("numero,motivo\n", { headers: { "content-type": "text/csv" } }),
      ),
    );

    renderWithProviders(<ExportarComprasButton filtros={FILTROS} />, { user: buildUser() });
    await exportarComo("CSV");

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0].nombre).toBe("compras.csv");
  });

  it("el menú ofrece Excel primero y CSV después", async () => {
    renderWithProviders(<ExportarComprasButton filtros={FILTROS} />, { user: buildUser() });

    await userEvent.setup().click(screen.getByRole("button", { name: /^exportar$/i }));

    const opciones = await screen.findAllByRole("menuitem");
    expect(opciones.map((o) => o.textContent)).toEqual(["Excel", "CSV"]);
  });

  it("Excel pide formato=xlsx con los mismos filtros, sin paginación, y baja un .xlsx", async () => {
    let urlPedida = "";
    server.use(
      http.get("/api/compras/export", ({ request }) => {
        urlPedida = request.url;
        return new HttpResponse(new Uint8Array([0x50, 0x4b]), {
          headers: {
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": 'attachment; filename="compras-2026-08-19.xlsx"',
          },
        });
      }),
    );

    renderWithProviders(<ExportarComprasButton filtros={FILTROS} />, { user: buildUser() });
    await exportarComo("Excel");

    await waitFor(() => expect(descargas).toHaveLength(1));
    const params = new URL(urlPedida).searchParams;
    expect(params.get("formato")).toBe("xlsx");
    expect(params.get("estado")).toBe("COMPLETADAS");
    expect(params.get("pagina")).toBeNull();
    expect(descargas[0].nombre).toBe("compras-2026-08-19.xlsx");
  });

  it("CSV no manda el parámetro formato (el backend toma csv por defecto)", async () => {
    let urlPedida = "";
    server.use(
      http.get("/api/compras/export", ({ request }) => {
        urlPedida = request.url;
        return new HttpResponse("numero\n", { headers: { "content-type": "text/csv" } });
      }),
    );

    renderWithProviders(<ExportarComprasButton filtros={FILTROS} />, { user: buildUser() });
    await exportarComo("CSV");

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(new URL(urlPedida).searchParams.has("formato")).toBe(false);
  });

  it("sin Content-Disposition, el nombre por defecto de Excel termina en .xlsx", async () => {
    server.use(
      http.get("/api/compras/export", () =>
        new HttpResponse(new Uint8Array([0x50, 0x4b]), { headers: { "content-type": "application/octet-stream" } }),
      ),
    );

    renderWithProviders(<ExportarComprasButton filtros={FILTROS} />, { user: buildUser() });
    await exportarComo("Excel");

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0].nombre).toBe("compras.xlsx");
  });
});
