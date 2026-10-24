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

/**
 * Compras vinculadas al ticket (`GET /tickets/:id/compras`, odd/ticket-unificado): una activa que
 * bloquea y una completada que ya no, que igual se puede desvincular.
 */
function mockComprasDelTicket() {
  return http.get("/api/tickets/tk1/compras", () =>
    HttpResponse.json([
      { id: "compra1", numero: "COM-0001", grupo: "ACTIVAS", bloquea: true },
      { id: "compra9", numero: "COM-0009", grupo: "COMPLETADAS", bloquea: false },
    ]),
  );
}

function renderDialog(puedeModificarEnTipo: boolean, permisos: string[]) {
  return renderWithProviders(
    <VincularCompraDialog ticketId="tk1" numero="EDI-0001" puedeModificarEnTipo={puedeModificarEnTipo} />,
    { user: buildUser({ rol: "TECNICO", permisos }) },
  );
}

describe("VincularCompraDialog (odd/ticket-unificado, S4)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    server.use(mockComprasActivas(), mockComprasDelTicket());
  });

  it("lista las compras vinculadas del ticket, con las que bloquean marcadas", async () => {
    const user = userEvent.setup();
    renderDialog(true, ["COMPRAS:LECTURA"]);

    await user.click(screen.getByRole("button", { name: "Gestionar compras" }));
    const dialogo = await screen.findByRole("dialog");

    const activa = (await within(dialogo).findByText("COM-0001")).closest("li") as HTMLElement;
    expect(within(activa).getByText("Bloquea")).toBeInTheDocument();
    const completada = within(dialogo).getByText("COM-0009").closest("li") as HTMLElement;
    expect(within(completada).queryByText("Bloquea")).toBeNull();
    expect(within(completada).getByText("Completada")).toBeInTheDocument();
  });

  it("el selector se alimenta de GET /compras?estado=ACTIVAS y no repite las ya vinculadas", async () => {
    const user = userEvent.setup();
    renderDialog(true, ["COMPRAS:LECTURA"]);

    await user.click(screen.getByRole("button", { name: "Gestionar compras" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("COM-0009");

    const selector = within(dialogo).getByLabelText(/vincular compra/i);
    expect(await within(selector).findByRole("option", { name: "COM-0002" })).toBeInTheDocument();
    expect(within(selector).queryByRole("option", { name: "COM-0001" })).toBeNull();
  });

  // Vincular y desvincular exigen lo mismo que el backend: MODIFICACION sobre el tipo del ticket y
  // la celda COMPRAS:LECTURA. Ni ALTAS ni EDILICIA:BORRADO alcanzan (JD-A-001, JD-B-004).
  it.each<[string, boolean, string[], string | null, boolean]>([
    ["con MODIFICACION y COMPRAS:LECTURA", true, ["COMPRAS:LECTURA"], "Gestionar compras", true],
    ["con COMPRAS:LECTURA y EDILICIA:BORRADO, sin MODIFICACION", false, ["COMPRAS:LECTURA", "EDILICIA:BORRADO"], "Ver compras", false],
    ["con MODIFICACION y EDILICIA:BORRADO, sin COMPRAS:LECTURA", true, ["EDILICIA:BORRADO", "EDILICIA:ALTAS"], null, false],
  ])("%s", async (_caso, puedeModificarEnTipo, permisos, boton, gestiona) => {
    const user = userEvent.setup();
    renderDialog(puedeModificarEnTipo, permisos);

    if (boton === null) {
      // Sin COMPRAS:LECTURA el backend no le muestra las compras: no hay panel que abrir.
      expect(screen.queryByRole("button", { name: /compras/i })).toBeNull();
      return;
    }
    expect(screen.queryByRole("button", { name: boton === "Ver compras" ? "Gestionar compras" : "Ver compras" })).toBeNull();
    await user.click(screen.getByRole("button", { name: boton }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("COM-0001");

    if (gestiona) {
      expect(within(dialogo).getAllByRole("button", { name: /desvincular/i })).toHaveLength(2);
      expect(within(dialogo).getByLabelText(/vincular compra/i)).toBeInTheDocument();
    } else {
      expect(within(dialogo).queryByRole("button", { name: /desvincular/i })).toBeNull();
      expect(within(dialogo).queryByLabelText(/vincular compra/i)).toBeNull();
    }
  });

  it("vincular envía POST /tickets/:id/compras con { compraId } y refresca las compras del ticket", async () => {
    let bodyRecibido: unknown = null;
    let lecturas = 0;
    server.use(
      http.get("/api/tickets/tk1/compras", () => {
        lecturas += 1;
        return HttpResponse.json([]);
      }),
      http.post("/api/tickets/tk1/compras", async ({ request }) => {
        bodyRecibido = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderDialog(true, ["COMPRAS:LECTURA"]);

    await user.click(screen.getByRole("button", { name: "Gestionar compras" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText(/sin compras vinculadas/i);

    await user.selectOptions(within(dialogo).getByLabelText(/vincular compra/i), "compra1");
    await user.click(within(dialogo).getByRole("button", { name: /^vincular$/i }));

    await waitFor(() => expect(bodyRecibido).toEqual({ compraId: "compra1" }));
    await waitFor(() => expect(lecturas).toBeGreaterThan(1));
  });

  it("desvincular envía DELETE /tickets/:id/compras/:compraId", async () => {
    let compraIdBorrada: string | null = null;
    server.use(
      http.delete("/api/tickets/tk1/compras/:compraId", ({ params }) => {
        compraIdBorrada = String(params.compraId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderDialog(true, ["COMPRAS:LECTURA"]);

    await user.click(screen.getByRole("button", { name: "Gestionar compras" }));
    const dialogo = await screen.findByRole("dialog");
    const completada = (await within(dialogo).findByText("COM-0009")).closest("li") as HTMLElement;
    await user.click(within(completada).getByRole("button", { name: /desvincular/i }));

    await waitFor(() => expect(compraIdBorrada).toBe("compra9"));
  });
});
