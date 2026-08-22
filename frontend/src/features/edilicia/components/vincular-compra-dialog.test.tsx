import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { VincularCompraDialog } from "./vincular-compra-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function mockComprasActivas() {
  return http.get("/api/compras", ({ request }) =>
    request.url.includes("estado=ACTIVAS")
      ? HttpResponse.json({
          items: [
            { id: "compra1", numero: "COM-0001", fechaSolicitud: "2026-01-01", motivo: "Repuesto", estado: "PENDIENTE", comprado: false, cerrado: false, totalesPorMoneda: {} },
            { id: "compra2", numero: "COM-0002", fechaSolicitud: "2026-01-02", motivo: "Cañería", estado: "APROBADO", comprado: true, cerrado: false, totalesPorMoneda: {} },
          ],
          total: 2,
          pagina: 1,
          porPagina: 10,
        })
      : HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 10 }, { status: 500 }),
  );
}

describe("VincularCompraDialog", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("el selector se alimenta de GET /compras?estado=ACTIVAS", async () => {
    server.use(mockComprasActivas());
    const user = userEvent.setup();

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[]}
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos: ["EDILICIA:LECTURA", "EDILICIA:ALTAS"] }) },
    );

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");

    const selector = within(dialogo).getByLabelText(/vincular compra/i);
    expect(within(selector).getByRole("option", { name: "COM-0001" })).toBeInTheDocument();
    expect(within(selector).getByRole("option", { name: "COM-0002" })).toBeInTheDocument();
  });

  // El panel se abre con CUALQUIERA de los dos permisos: cada acción de adentro
  // tiene su propio gate, así que abrir no habilita nada. Gatearlo solo por
  // ALTAS dejaba a quien únicamente puede desvincular viendo el chip
  // «Bloqueada» sin forma de sacarlo, aunque el backend le permite el DELETE.
  it.each([
    ["con EDILICIA:ALTAS", ["EDILICIA:LECTURA", "EDILICIA:ALTAS"], true],
    ["con solo EDILICIA:BORRADO", ["EDILICIA:LECTURA", "EDILICIA:BORRADO"], true],
    ["sin ALTAS ni BORRADO", ["EDILICIA:LECTURA"], false],
  ])("el botón de abrir el panel se muestra con EDILICIA:ALTAS O con EDILICIA:BORRADO — %s", async (_label, permisos, shouldShow) => {
    server.use(mockComprasActivas());

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[]}
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos }) },
    );

    if (shouldShow) {
      expect(screen.getByRole("button", { name: /gestionar compras/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: /gestionar compras/i })).not.toBeInTheDocument();
    }
  });

  it.each([
    ["con EDILICIA:BORRADO", ["EDILICIA:LECTURA", "EDILICIA:ALTAS", "EDILICIA:BORRADO"], true],
    ["sin EDILICIA:BORRADO", ["EDILICIA:LECTURA", "EDILICIA:ALTAS"], false],
  ])("la acción de desvincular respeta <Can permiso=\"EDILICIA:BORRADO\"> — %s", async (_label, permisos, shouldShow) => {
    server.use(mockComprasActivas());
    const user = userEvent.setup();

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[{ id: "compra1", numero: "COM-0001" }]}
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos }) },
    );

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findAllByText("COM-0001");

    if (shouldShow) {
      expect(within(dialogo).getByRole("button", { name: /desvincular/i })).toBeInTheDocument();
    } else {
      expect(within(dialogo).queryByRole("button", { name: /desvincular/i })).not.toBeInTheDocument();
    }
  });

  it("vincular envía POST /reparaciones/:id/compras con { compraId } y refresca el listado", async () => {
    let bodyRecibido: unknown = null;
    server.use(
      mockComprasActivas(),
      http.post("/api/reparaciones/rep1/compras", async ({ request }) => {
        bodyRecibido = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
      http.get("/api/reparaciones", () => HttpResponse.json([])),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[]}
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos: ["EDILICIA:LECTURA", "EDILICIA:ALTAS"] }) },
    );

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");

    await user.selectOptions(within(dialogo).getByLabelText(/vincular compra/i), "compra1");
    await user.click(within(dialogo).getByRole("button", { name: /^vincular$/i }));

    await waitFor(() => expect(bodyRecibido).toEqual({ compraId: "compra1" }));
  });

  it("desvincular envía DELETE /reparaciones/:id/compras/:compraId y refresca el listado", async () => {
    let compraIdBorrada: string | null = null;
    server.use(
      mockComprasActivas(),
      http.delete("/api/reparaciones/rep1/compras/compra1", () => {
        compraIdBorrada = "compra1";
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/api/reparaciones", () => HttpResponse.json([])),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <VincularCompraDialog
        reparacionId="rep1"
        numero="EDI-0001"
        comprasQueBloquean={[{ id: "compra1", numero: "COM-0001" }]}
        trigger={<button>Gestionar compras</button>}
      />,
      { user: buildUser({ permisos: ["EDILICIA:LECTURA", "EDILICIA:ALTAS", "EDILICIA:BORRADO"] }) },
    );

    await user.click(screen.getByRole("button", { name: /gestionar compras/i }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: /desvincular/i }));

    await waitFor(() => expect(compraIdBorrada).toBe("compra1"));
  });
});
