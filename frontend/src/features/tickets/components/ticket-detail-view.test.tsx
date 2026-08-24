import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketDetailView } from "./ticket-detail-view";

const TICKET_ID = "t1";

/** Ticket base en estado NUEVO — desde acá se muestra el control unificado "Asignar y poner en proceso". */
const TICKET = {
  id: TICKET_ID,
  numero: "SOP-2026-0001",
  titulo: "Impresora rota",
  descripcion: "No imprime a color",
  tipoId: "ti1",
  estadoId: "e-nuevo",
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
    http.get(`/api/tickets/${TICKET_ID}/asignables`, () =>
      HttpResponse.json([
        { id: "u-tecnico", nombre: "Carlos", apellido: "Díaz" },
        { id: "u-tecnico-2", nombre: "Ana", apellido: "García" },
      ]),
    ),
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([{ id: "ti1", codigo: "SOPORTE", nombre: "Soporte", modulo: "SOPORTE", activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([{ id: "p-alta", codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/estados", () =>
      HttpResponse.json([
        { id: "e-nuevo", codigo: "NUEVO", nombre: "Nuevo", color: null, orden: 1, activo: true },
        { id: "e-en-proceso", codigo: "EN_PROCESO", nombre: "En proceso", color: null, orden: 3, activo: true },
        { id: "e-resuelto", codigo: "RESUELTO", nombre: "Resuelto", color: null, orden: 4, activo: true },
      ]),
    ),
    http.get("/api/catalogos/tipo-operacion", () => HttpResponse.json([])),
    // TICKET es de tipo SOPORTE (ti1) — el detalle consulta el equipo vinculado.
    // Default sin equipo asociado; los tests de la tarjeta lo sobreescriben.
    http.get(`/api/soporte/${TICKET_ID}`, () => HttpResponse.json({ equipo: null })),
  );
}

describe("TicketDetailView — gating de acciones por permiso", () => {
  beforeEach(() => mockBackend());

  it.each([
    {
      rol: "ADMINISTRADOR",
      permisos: ["TICKETS:MODIFICACION", "TICKETS:TRANSICIONAR", "TICKETS:ASIGNAR", "TICKETS:COMENTAR"],
      esperados: { transicionar: true, asignar: true, editar: true },
    },
    {
      rol: "USUARIO",
      permisos: ["TICKETS:COMENTAR"],
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

    // Control unificado "Asignar y poner en proceso" (visible en NUEVO/ASIGNADO con ticket:asignar).
    if (esperados.asignar) {
      expect(screen.getByRole("combobox", { name: /asignar responsable/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("combobox", { name: /asignar responsable/i })).not.toBeInTheDocument();
    }

    if (esperados.editar) {
      expect(screen.getByRole("button", { name: /^editar$/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
    }
  });

  it("editar (modal) → click en «Editar» abre el modal precargado y guardar dispara PATCH /tickets/:id", async () => {
    // `editarTicketSchema` exige `prioridadId` UUID (z.uuid()) — el fixture
    // TICKET usa el id legible "p-alta" para el resto de los tests (no
    // sensibles a este detalle); acá se sobreescribe por uno UUID válido
    // para poder ejercer el submit real del form.
    const PRIORIDAD_UUID = "33333333-3333-3333-3333-333333333333";
    let capturedBody: unknown = null;
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ ...TICKET, prioridadId: PRIORIDAD_UUID })),
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([{ id: PRIORIDAD_UUID, codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" }]),
      ),
      http.patch(`/api/tickets/${TICKET_ID}`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...TICKET, titulo: "Impresora arreglada" });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:MODIFICACION"] }),
    });

    await screen.findByText("Impresora rota");
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    const tituloInput = await screen.findByLabelText("Título");
    expect(tituloInput).toHaveValue("Impresora rota");

    await user.clear(tituloInput);
    await user.type(tituloInput, "Impresora arreglada");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody).toMatchObject({ titulo: "Impresora arreglada" }));
    await waitFor(() => expect(screen.queryByLabelText("Título")).not.toBeInTheDocument());
  });

  it("control unificado → PATCH /tickets/:id/asignar-en-proceso con el técnico elegido", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.patch(`/api/tickets/${TICKET_ID}/asignar-en-proceso`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...TICKET, estadoId: "e-en-proceso", asignadoId: "u-tecnico-2" });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      // El control "Asignar y poner en proceso" exige AMBOS permisos (asigna Y
      // transiciona a EN_PROCESO en una acción) — espeja el endpoint.
      user: buildUser({ permisos: ["TICKETS:ASIGNAR", "TICKETS:TRANSICIONAR"] }),
    });

    await screen.findByText("Impresora rota");
    await user.selectOptions(screen.getByRole("combobox", { name: /asignar responsable/i }), "u-tecnico-2");
    await user.click(screen.getByRole("button", { name: /asignar y poner en proceso/i }));

    await waitFor(() => expect(capturedBody).toEqual({ asignadoId: "u-tecnico-2" }));
  });

  it("transicionar posterior (EN_PROCESO→RESUELTO) → PATCH /tickets/:id/estado con el código elegido", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ ...TICKET, estadoId: "e-en-proceso" })),
      http.patch(`/api/tickets/${TICKET_ID}/estado`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...TICKET, estadoId: "e-resuelto" });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:TRANSICIONAR"] }),
    });

    await screen.findByText("Impresora rota");
    await user.selectOptions(screen.getByRole("combobox", { name: /nuevo estado/i }), "RESUELTO");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(capturedBody).toEqual({ nuevoEstadoCodigo: "RESUELTO" }));
  });

  it("cabecera muestra nombres de solicitante/asignado (no IDs crudos) y el estado de SLA vencido", async () => {
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:COMENTAR"] }),
    });

    await screen.findByText("Impresora rota");

    expect(screen.getByText("Marina Pérez")).toBeInTheDocument();
    expect(screen.getByText("Carlos Díaz")).toBeInTheDocument();
    expect(screen.queryByText("u-solicitante")).not.toBeInTheDocument();
    expect(screen.queryByText("u-tecnico")).not.toBeInTheDocument();
    expect(screen.getByText(/vencido/i)).toBeInTheDocument();
  });
});

describe("TicketDetailView — bloqueo de edición una vez EN_PROCESO", () => {
  beforeEach(() => mockBackend());

  it("EN_PROCESO + no-ROOT con ticket:editar → sin botón Editar, muestra la nota de bloqueo", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ ...TICKET, estadoId: "e-en-proceso" })),
    );

    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ rol: "ADMINISTRADOR", permisos: ["TICKETS:MODIFICACION"] }),
    });

    await screen.findByText("Impresora rota");

    expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/solo ROOT puede editar/i)).toBeInTheDocument();
  });

  it("EN_PROCESO + ROOT → botón Editar habilitado (ROOT edita siempre)", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ ...TICKET, estadoId: "e-en-proceso" })),
    );

    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ rol: null, is_global_admin: true, permisos: [] }),
    });

    await screen.findByText("Impresora rota");

    expect(screen.getByRole("button", { name: /^editar$/i })).toBeInTheDocument();
    expect(screen.queryByText(/solo ROOT puede editar/i)).not.toBeInTheDocument();
  });
});

/**
 * [WU12.3] El container es quien calcula `puedeVerCsat` (`useCan("CSAT:LECTURA")`,
 * ticket-detail-view.tsx) y se lo pasa a `TicketHeader`. `ticket-header.test.tsx`
 * ya cubre que el PRESENTACIONAL obedece la prop; acá se cubre que el
 * CONTAINER la calcule a partir del permiso real y no la cablee a `true`.
 */
describe("TicketDetailView — gateo del bloque de satisfacción (CSAT:LECTURA)", () => {
  beforeEach(() => mockBackend());

  it("sin CSAT:LECTURA, no muestra el bloque de satisfacción aunque el backend mande csatPuntaje", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({ ...TICKET, csatPuntaje: 4, csatComentario: "Buena atención" }),
      ),
    );

    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:COMENTAR"] }),
    });

    await screen.findByText("Impresora rota");
    expect(screen.queryByText(/satisfacción/i)).not.toBeInTheDocument();
  });

  it("con CSAT:LECTURA, muestra el bloque de satisfacción cuando el backend manda csatPuntaje", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({ ...TICKET, csatPuntaje: 4, csatComentario: "Buena atención" }),
      ),
    );

    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:COMENTAR", "CSAT:LECTURA"] }),
    });

    await screen.findByText("Impresora rota");
    expect(screen.getByText(/satisfacción/i)).toBeInTheDocument();
  });
});

/**
 * Tarjeta "Equipo en mantenimiento" — el detalle de un ticket SOPORTE
 * resalta el equipo vinculado (satélite `ticket_soporte.equipoId`, ya
 * persistido al crear el ticket desde Equipos). Solo se consulta/muestra
 * cuando el tipo del ticket resuelve a SOPORTE.
 */
describe("TicketDetailView — tarjeta de equipo en mantenimiento", () => {
  beforeEach(() => mockBackend());

  it("ticket SOPORTE con equipo vinculado → muestra la tarjeta con nombre y nº de serie", async () => {
    server.use(
      http.get(`/api/soporte/${TICKET_ID}`, () =>
        HttpResponse.json({ equipo: { id: "e1", nombre: "Notebook Dell", numeroSerie: "SN-123" } }),
      ),
    );

    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser() });

    expect(await screen.findByText(/equipo en mantenimiento/i)).toBeInTheDocument();
    expect(screen.getByText("Notebook Dell")).toBeInTheDocument();
    expect(screen.getByText(/SN-123/)).toBeInTheDocument();
  });

  it("ticket SOPORTE sin equipo vinculado → NO muestra la tarjeta (mockBackend ya retorna equipo:null)", async () => {
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser() });

    await screen.findByText("Impresora rota");
    expect(screen.queryByText(/equipo en mantenimiento/i)).not.toBeInTheDocument();
  });

  it("ticket NO-SOPORTE → no consulta GET /soporte/:ticketId ni muestra la tarjeta", async () => {
    let soporteEndpointLlamado = false;
    server.use(
      http.get("/api/catalogos/tipos-ticket", () =>
        HttpResponse.json([
          { id: "ti1", codigo: "COMPRAS", nombre: "Compras", modulo: "COMPRAS", activo: true, createdAt: "", updatedAt: "" },
        ]),
      ),
      http.get(`/api/soporte/${TICKET_ID}`, () => {
        soporteEndpointLlamado = true;
        return HttpResponse.json({ equipo: { id: "e1", nombre: "No debería llegar", numeroSerie: null } });
      }),
    );

    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser() });

    await screen.findByText("Impresora rota");
    await waitFor(() => expect(screen.getByRole("heading", { name: /actividad/i })).toBeInTheDocument());
    expect(soporteEndpointLlamado).toBe(false);
    expect(screen.queryByText(/equipo en mantenimiento/i)).not.toBeInTheDocument();
  });
});
