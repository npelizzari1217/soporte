import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketPdfButton } from "./ticket-pdf-button";

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

describe("TicketPdfButton", () => {
  it("pide GET /tickets/:id/pdf y baja el archivo con el nombre del Content-Disposition", async () => {
    let pedido = "";
    server.use(
      http.get("/api/tickets/t1/pdf", ({ request }) => {
        pedido = new URL(request.url).pathname;
        return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe]), {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="ticket-SOP-2026-0001.pdf"',
          },
        });
      }),
    );

    renderWithProviders(<TicketPdfButton ticketId="t1" numero="SOP-2026-0001" />, {
      user: buildUser(),
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /descargar pdf/i }));

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(pedido).toBe("/api/tickets/t1/pdf");
    expect(descargas[0].nombre).toBe("ticket-SOP-2026-0001.pdf");
    // Los bytes llegan intactos (el PDF no se decodifica como texto).
    expect(new Uint8Array(await blobsCreados[0].arrayBuffer())).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe]),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sin Content-Disposition legible cae en ticket-<numero>.pdf", async () => {
    server.use(
      http.get("/api/tickets/t1/pdf", () =>
        new HttpResponse(new Uint8Array([0x25]), { headers: { "content-type": "application/pdf" } }),
      ),
    );

    renderWithProviders(<TicketPdfButton ticketId="t1" numero="SOP-2026-0001" />, {
      user: buildUser(),
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /descargar pdf/i }));

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0].nombre).toBe("ticket-SOP-2026-0001.pdf");
  });

  it("404 → muestra el error y NO descarga nada", async () => {
    server.use(
      http.get("/api/tickets/t1/pdf", () =>
        HttpResponse.json({ statusCode: 404, message: "Ticket no encontrado." }, { status: 404 }),
      ),
    );

    renderWithProviders(<TicketPdfButton ticketId="t1" numero="SOP-2026-0001" />, {
      user: buildUser(),
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /descargar pdf/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ticket no encontrado."));
    expect(descargas).toHaveLength(0);
  });
});
