import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketDetailView } from "./ticket-detail-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * Montaje del control de reasignación en el detalle (M2, M4, M5): visible
 * mientras el ticket no sea terminal, convive con "Asignar y poner en proceso"
 * en NUEVO/ASIGNADO, usa PATCH /tickets/:id/asignar y muestra el 422.
 */
const TICKET_ID = "t1";
const PERMISOS = ["TICKETS:ASIGNAR", "TICKETS:TRANSICIONAR"];

function ticket(estadoId: string) {
  return {
    id: TICKET_ID, numero: "SOP-2026-0001", titulo: "Impresora rota", descripcion: null,
    tipoId: "ti1", estadoId, prioridadId: "p-alta", cicloId: null, ticketReferenciaId: null,
    solicitanteId: "u-sol", solicitanteExternoId: null, solicitanteEsExterno: false,
    asignadoId: "u-tecnico", solicitanteNombre: "Marina", solicitanteApellido: "Pérez",
    asignadoNombre: "Carlos", asignadoApellido: "Díaz", slaVenceAt: null, vencido: false,
    sla: { estado: "SIN_META", venceAt: null }, primeraRespuesta: { estado: "SIN_META", venceAt: null, at: null },
    fechaCierre: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function mockBackend(estadoId: string) {
  server.use(
    http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json(ticket(estadoId))),
    http.get(`/api/tickets/${TICKET_ID}/timeline`, () => HttpResponse.json([])),
    http.get(`/api/tickets/${TICKET_ID}/asignables`, () =>
      HttpResponse.json([
        { id: "u-tecnico", nombre: "Carlos", apellido: "Díaz" },
        { id: "u-tecnico-2", nombre: "Ana", apellido: "García" },
      ]),
    ),
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([{ id: "ti1", codigo: "COMPRAS", nombre: "Compras", modulo: "COMPRAS", activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([{ id: "p-alta", codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/estados", () =>
      HttpResponse.json(
        ["NUEVO", "ASIGNADO", "EN_PROCESO", "CERRADO", "CANCELADO"].map((codigo, i) => ({
          id: `e-${codigo}`, codigo, nombre: codigo, color: null, orden: i, activo: true,
        })),
      ),
    ),
    http.get("/api/catalogos/tipo-operacion", () => HttpResponse.json([])),
  );
}

describe("TicketDetailView — control de reasignación", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["NUEVO", "ASIGNADO"])("en %s convive con «Asignar y poner en proceso»", async (codigo) => {
    mockBackend(`e-${codigo}`);
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos: PERMISOS }) });
    await screen.findByText("Impresora rota");
    expect(await screen.findByRole("combobox", { name: /cambiar responsable/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^asignar responsable$/i })).toBeInTheDocument();
  });

  it("en EN_PROCESO se ofrece solo la reasignación", async () => {
    mockBackend("e-EN_PROCESO");
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos: PERMISOS }) });
    await screen.findByText("Impresora rota");
    expect(await screen.findByRole("combobox", { name: /cambiar responsable/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /^asignar responsable$/i })).not.toBeInTheDocument();
  });

  it.each(["CERRADO", "CANCELADO"])("en %s no se muestra", async (codigo) => {
    mockBackend(`e-${codigo}`);
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos: PERMISOS }) });
    await screen.findByText("Impresora rota");
    await waitFor(() => expect(screen.getByRole("heading", { name: /actividad/i })).toBeInTheDocument());
    expect(screen.queryByRole("combobox", { name: /cambiar responsable/i })).not.toBeInTheDocument();
  });

  it("sin TICKETS:ASIGNAR no se muestra", async () => {
    mockBackend("e-EN_PROCESO");
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos: [] }) });
    await screen.findByText("Impresora rota");
    expect(screen.queryByRole("combobox", { name: /cambiar responsable/i })).not.toBeInTheDocument();
  });

  it("reasignar manda PATCH /tickets/:id/asignar con el elegido", async () => {
    const user = userEvent.setup();
    let body: unknown = null;
    mockBackend("e-EN_PROCESO");
    server.use(
      http.patch(`/api/tickets/${TICKET_ID}/asignar`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(ticket("e-EN_PROCESO"));
      }),
    );
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos: PERMISOS }) });
    await user.selectOptions(await screen.findByRole("combobox", { name: /cambiar responsable/i }), "u-tecnico-2");
    await user.click(screen.getByRole("button", { name: /^reasignar$/i }));
    await waitFor(() => expect(body).toEqual({ asignadoId: "u-tecnico-2" }));
  });

  it("un 422 muestra el toast con el mensaje del backend", async () => {
    const user = userEvent.setup();
    mockBackend("e-EN_PROCESO");
    server.use(
      http.patch(`/api/tickets/${TICKET_ID}/asignar`, () =>
        HttpResponse.json({ statusCode: 422, message: "El ticket ya no se puede reasignar." }, { status: 422 }),
      ),
    );
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos: PERMISOS }) });
    await user.selectOptions(await screen.findByRole("combobox", { name: /cambiar responsable/i }), "u-tecnico-2");
    await user.click(screen.getByRole("button", { name: /^reasignar$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("El ticket ya no se puede reasignar."));
  });
});
