import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketDetailView } from "./ticket-detail-view";

const TICKET_ID = "t1";

const TICKET = {
  id: TICKET_ID,
  numero: "SOP-2026-0001",
  titulo: "Impresora rota",
  descripcion: "No imprime a color",
  tipoId: "ti1",
  estadoId: "e-en-proceso",
  prioridadId: "p-alta",
  cicloId: null,
  ticketReferenciaId: null,
  solicitanteId: "u-solicitante",
  asignadoId: "u-tecnico",
  solicitanteNombre: "Marina",
  solicitanteApellido: "Pérez",
  asignadoNombre: "Carlos",
  asignadoApellido: "Díaz",
  slaVenceAt: "2020-01-01T00:00:00.000Z",
  vencido: true,
  fechaCierre: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend() {
  server.use(
    http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json(TICKET)),
    http.get(`/api/tickets/${TICKET_ID}/timeline`, () => HttpResponse.json([])),
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([{ id: "ti1", codigo: "SOPORTE", nombre: "Soporte", activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([{ id: "p-alta", codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/estados", () =>
      HttpResponse.json([{ id: "e-en-proceso", codigo: "EN_PROCESO", nombre: "En proceso", color: null, orden: 3, activo: true }]),
    ),
    http.get("/api/catalogos/tipo-operacion", () => HttpResponse.json([])),
    http.get("/api/usuarios", () => HttpResponse.json([])),
  );
}

describe("TicketDetailView — gating de acciones por permiso", () => {
  beforeEach(() => mockBackend());

  it.each([
    {
      rol: "ADMINISTRADOR",
      permisos: ["ticket:editar", "ticket:transicionar", "ticket:asignar", "ticket:comentar"],
      esperados: { transicionar: true, asignar: true, editar: true },
    },
    {
      rol: "USUARIO",
      permisos: ["ticket:comentar"],
      esperados: { transicionar: false, asignar: false, editar: false },
    },
  ])("$rol → controles visibles según permisos reales", async ({ permisos, esperados }) => {
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos }) });

    await screen.findByText("Impresora rota");

    if (esperados.transicionar) {
      expect(screen.getByRole("combobox", { name: /nuevo estado/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("combobox", { name: /nuevo estado/i })).not.toBeInTheDocument();
    }

    if (esperados.asignar) {
      expect(screen.getByRole("combobox", { name: /asignar a/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("combobox", { name: /asignar a/i })).not.toBeInTheDocument();
    }

    if (esperados.editar) {
      expect(screen.getByRole("button", { name: /^editar$/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
    }
  });

  it("transicionar a un estado válido → PATCH /tickets/:id/estado con el código elegido, e invalida el detalle", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.patch(`/api/tickets/${TICKET_ID}/estado`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...TICKET, estadoId: "e-resuelto" });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["ticket:transicionar"] }),
    });

    await screen.findByText("Impresora rota");
    await user.selectOptions(screen.getByRole("combobox", { name: /nuevo estado/i }), "RESUELTO");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(capturedBody).toEqual({ nuevoEstadoCodigo: "RESUELTO" }));
  });

  it("cabecera muestra nombres de solicitante/asignado (no IDs crudos) y el estado de SLA vencido", async () => {
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["ticket:comentar"] }),
    });

    await screen.findByText("Impresora rota");

    expect(screen.getByText("Marina Pérez")).toBeInTheDocument();
    expect(screen.getByText("Carlos Díaz")).toBeInTheDocument();
    expect(screen.queryByText("u-solicitante")).not.toBeInTheDocument();
    expect(screen.queryByText("u-tecnico")).not.toBeInTheDocument();
    expect(screen.getByText(/vencido/i)).toBeInTheDocument();
  });
});
