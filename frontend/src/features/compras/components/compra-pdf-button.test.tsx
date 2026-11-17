import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CompraPdfButton } from "./compra-pdf-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** jsdom no implementa object URLs: se stubbean para observar el nombre con que baja el archivo. */
let descargas: Array<{ nombre: string }>;
const blobsCreados: Blob[] = [];

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  descargas = [];
  blobsCreados.length = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobsCreados.push(blob);
    return "blob:mock";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    descargas.push({ nombre: this.download });
  });
});

afterEach(() => vi.restoreAllMocks());

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe]);

describe("CompraPdfButton", () => {
  it("pide GET /compras/:id/pdf y baja el archivo con el nombre del Content-Disposition, con los bytes intactos", async () => {
    let pedido = "";
    server.use(
      http.get("/api/compras/c1/pdf", ({ request }) => {
        pedido = new URL(request.url).pathname;
        return new HttpResponse(PDF, {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="solicitud-de-compra-COM-2026-00007.pdf"',
          },
        });
      }),
    );

    renderWithProviders(<CompraPdfButton compraId="c1" numero="COM-2026-00007" />, {
      user: buildUser(),
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /imprimir pdf/i }));

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(pedido).toBe("/api/compras/c1/pdf");
    expect(descargas[0].nombre).toBe("solicitud-de-compra-COM-2026-00007.pdf");
    expect(new Uint8Array(await blobsCreados[0].arrayBuffer())).toEqual(PDF);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sin Content-Disposition legible cae en solicitud-de-compra-<numero>.pdf", async () => {
    server.use(
      http.get("/api/compras/c1/pdf", () =>
        new HttpResponse(PDF, { headers: { "content-type": "application/pdf" } }),
      ),
    );

    renderWithProviders(<CompraPdfButton compraId="c1" numero="COM-2026-00007" />, {
      user: buildUser(),
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /imprimir pdf/i }));

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0].nombre).toBe("solicitud-de-compra-COM-2026-00007.pdf");
  });

  it("404 → muestra el mensaje del backend y NO descarga nada", async () => {
    server.use(
      http.get("/api/compras/c1/pdf", () =>
        HttpResponse.json(
          { statusCode: 404, message: 'Compra con id "c1" no encontrada.' },
          { status: 404 },
        ),
      ),
    );

    renderWithProviders(<CompraPdfButton compraId="c1" numero="COM-2026-00007" />, {
      user: buildUser(),
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /imprimir pdf/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Compra con id "c1" no encontrada.'),
    );
    expect(descargas).toHaveLength(0);
  });
});
