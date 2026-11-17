import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import {
  renderWithProviders,
  buildUser,
} from "../../../../test/render-with-providers";
import { ExportarCompraButton } from "./exportar-compra-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPRA_ID = "0197aaaa-0000-7000-8000-000000000001";

async function exportarComo(formato: "Excel" | "CSV") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^exportar$/i }));
  await user.click(await screen.findByRole("menuitem", { name: formato }));
}

/** jsdom no implementa object URLs: se stubbean para observar la descarga. */
let descargas: Array<{ nombre: string }>;

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  descargas = [];
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    descargas.push({ nombre: this.download });
  });
});

afterEach(() => vi.restoreAllMocks());

describe("ExportarCompraButton", () => {
  it("Excel pide la exportación de ESA compra con formato=xlsx y baja el archivo con el nombre del backend", async () => {
    let urlPedida = "";
    server.use(
      http.get(`/api/compras/${COMPRA_ID}/export`, ({ request }) => {
        urlPedida = request.url;
        return new HttpResponse(new Uint8Array([0x50, 0x4b]), {
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition":
              'attachment; filename="compra-COM-2026-00001-2026-11-17.xlsx"',
          },
        });
      }),
    );

    renderWithProviders(<ExportarCompraButton compraId={COMPRA_ID} />, {
      user: buildUser(),
    });
    await exportarComo("Excel");

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(new URL(urlPedida).searchParams.get("formato")).toBe("xlsx");
    expect(descargas[0].nombre).toBe("compra-COM-2026-00001-2026-11-17.xlsx");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("404 (compra que ya no se ve) → muestra el mensaje del backend y no descarga nada", async () => {
    server.use(
      http.get(`/api/compras/${COMPRA_ID}/export`, () =>
        HttpResponse.json(
          {
            statusCode: 404,
            message: `Compra con id "${COMPRA_ID}" no encontrada.`,
          },
          { status: 404 },
        ),
      ),
    );

    renderWithProviders(<ExportarCompraButton compraId={COMPRA_ID} />, {
      user: buildUser(),
    });
    await exportarComo("CSV");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        `Compra con id "${COMPRA_ID}" no encontrada.`,
      ),
    );
    expect(descargas).toHaveLength(0);
  });
});
