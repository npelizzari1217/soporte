import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketDetailView } from "./ticket-detail-view";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";
import type { AccionTipoTicket } from "@/shared/auth/permisos-por-tipo";

// "Borrar" (S8) navega al listado al terminar: el resto del detalle no usa el router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/**
 * Un TECNICO cuyas acciones salen de sus filas por tipo (odd/permisos-por-tipo-ticket, S6). Trae
 * TODAS las celdas TICKETS:* del JWT a propósito: ya no deciden ningún control del detalle.
 */
const TECNICO = buildUser({
  sub: "u-otro",
  rol: "TECNICO",
  permisos: [
    "TICKETS:LECTURA",
    "TICKETS:MODIFICACION",
    "TICKETS:TRANSICIONAR",
    "TICKETS:ASIGNAR",
    "TICKETS:COMENTAR",
    "TICKETS:OBSERVAR",
  ],
});

/** Las acciones del técnico sobre el tipo `ti1` del ticket de prueba. */
function enTi1(...acciones: AccionTipoTicket[]) {
  return permisosDeTest({ ti1: ["LECTURA", ...acciones] });
}

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
  solicitanteExternoId: null,
  solicitanteEsExterno: false,
  asignadoId: "u-tecnico",
  solicitanteNombre: "Marina",
  solicitanteApellido: "Pérez",
  asignadoNombre: "Carlos",
  asignadoApellido: "Díaz",
  slaVenceAt: "2020-01-01T00:00:00.000Z",
  vencido: true,
  sla: { estado: "VENCIDO", venceAt: "2020-01-01T00:00:00.000Z" },
  primeraRespuesta: { estado: "SIN_META", venceAt: null, at: null },
  fechaCierre: null,
  ubicacion: null,
  sectorId: null,
  sectorNombre: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  bloqueada: false,
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
    http.get(`/api/tickets/${TICKET_ID}/tareas`, () =>
      HttpResponse.json({
        items: [
          {
            id: "ta1",
            ticketId: TICKET_ID,
            descripcion: "Cambiar el tóner",
            orden: 1,
            tecnicoId: null,
            tecnicoNombre: null,
            tecnicoApellido: null,
            completada: false,
            completadaEn: null,
            completadaPorId: null,
            completadaPorNombre: null,
            completadaPorApellido: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        avance: { total: 1, completadas: 0, porcentaje: 0 },
      }),
    ),
    http.get(`/api/tickets/${TICKET_ID}/tareas/tecnicos-elegibles`, () => HttpResponse.json([])),
  );
}

describe("TicketDetailView — sección Tareas (odd/tareas-con-tecnico, T6)", () => {
  beforeEach(() => mockBackend());

  it("muestra las tareas del ticket con su avance, en cualquier tipo de ticket", async () => {
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByRole("heading", { name: "Tareas" })).toBeInTheDocument();
    expect(await screen.findByText("Cambiar el tóner")).toBeInTheDocument();
    expect(screen.getByText("0% · 0 de 1 completadas")).toBeInTheDocument();
  });
});

describe("TicketDetailView — gating de acciones por permiso", () => {
  beforeEach(() => mockBackend());

  it.each([
    {
      caso: "con MODIFICACION, TRANSICIONAR y ASIGNAR sobre el tipo",
      permisos: enTi1("MODIFICACION", "TRANSICIONAR", "ASIGNAR", "COMENTAR"),
      esperados: { transicionar: true, asignar: true, editar: true },
    },
    {
      caso: "con solo COMENTAR sobre el tipo, aunque tenga las celdas del JWT",
      permisos: enTi1("COMENTAR"),
      esperados: { transicionar: false, asignar: false, editar: false },
    },
  ])("$caso → controles visibles según permisos reales", async ({ permisos, esperados }) => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos });

    await screen.findByText("Impresora rota");

    if (esperados.transicionar) {
      expect(screen.getByRole("combobox", { name: /nuevo estado/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("combobox", { name: /nuevo estado/i })).not.toBeInTheDocument();
    }

    // Control unificado "Asignar y poner en proceso" (visible en NUEVO/ASIGNADO con ticket:asignar).
    if (esperados.asignar) {
      expect(screen.getByRole("combobox", { name: /nuevo responsable/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("combobox", { name: /nuevo responsable/i })).not.toBeInTheDocument();
    }

    if (esperados.editar) {
      expect(screen.getByRole("button", { name: /^editar$/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
    }
  });

  it("«Descargar PDF» es visible con IMPRESION sobre el tipo, sin otra acción, y pide GET /tickets/:id/pdf", async () => {
    let pdfPedido = false;
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    server.use(
      http.get(`/api/tickets/${TICKET_ID}/pdf`, () => {
        pdfPedido = true;
        return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          headers: { "content-type": "application/pdf" },
        });
      }),
    );

    // Solo ver e imprimir: el PDF pide IMPRESION sobre el tipo, nada más (D5 c).
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("IMPRESION") });
    await screen.findByText("Impresora rota");

    await userEvent.setup().click(screen.getByRole("button", { name: /descargar pdf/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(pdfPedido).toBe(true);
    clickSpy.mockRestore();
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
    // Los candidatos se piden con el tipo del ticket ya resuelto (ASIGNAR sobre ESE tipo).
    await screen.findByRole("option", { name: "Ana García" });
    await user.selectOptions(screen.getByRole("combobox", { name: /nuevo responsable/i }), "u-tecnico-2");
    await user.click(screen.getByRole("button", { name: /asignar y poner en proceso/i }));

    await waitFor(() => expect(capturedBody).toEqual({ asignadoId: "u-tecnico-2" }));
  });

  it("tras «Asignar y poner en proceso» el control pasa a «Cambiar responsable» con la elección vacía", async () => {
    let enProceso = false;
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json(enProceso ? { ...TICKET, estadoId: "e-en-proceso", asignadoId: "u-tecnico-2" } : TICKET),
      ),
      http.patch(`/api/tickets/${TICKET_ID}/asignar-en-proceso`, () => {
        enProceso = true;
        return HttpResponse.json({ ...TICKET, estadoId: "e-en-proceso", asignadoId: "u-tecnico-2" });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:ASIGNAR", "TICKETS:TRANSICIONAR"] }),
    });

    await screen.findByText("Impresora rota");
    // Los candidatos se piden con el tipo del ticket ya resuelto (ASIGNAR sobre ESE tipo).
    await screen.findByRole("option", { name: "Ana García" });
    await user.selectOptions(screen.getByRole("combobox", { name: /nuevo responsable/i }), "u-tecnico-2");
    await user.click(screen.getByRole("button", { name: /asignar y poner en proceso/i }));

    const cambiar = await screen.findByRole("button", { name: /cambiar responsable/i });
    // La elección anterior no se arrastra al modo nuevo: el botón arranca deshabilitado.
    expect(screen.getByRole("combobox", { name: /nuevo responsable/i })).toHaveValue("");
    expect(cambiar).toBeDisabled();
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

/**
 * odd/permisos-por-tipo-ticket (S2, S6): el mismo usuario, dos tickets de tipos distintos. Cada
 * control se decide por la acción sobre el tipo de ESE ticket: visible en uno, oculto en el otro.
 */
describe("TicketDetailView — acciones según el tipo del ticket (odd/permisos-por-tipo-ticket, S6)", () => {
  beforeEach(() => mockBackend());

  const TODAS: AccionTipoTicket[] = [
    "LECTURA",
    "MODIFICACION",
    "TRANSICIONAR",
    "ASIGNAR",
    "COMENTAR",
    "OBSERVAR",
    "IMPRESION",
    "ALTAS",
  ];
  // Opera todo en Soporte (ti1); en Redes (ti2) solo lee.
  const PERMISOS = permisosDeTest({ ti1: TODAS, ti2: ["LECTURA"] });

  function controles() {
    return {
      editar: screen.queryByRole("button", { name: /^editar$/i }),
      estado: screen.queryByRole("combobox", { name: /nuevo estado/i }),
      responsable: screen.queryByRole("combobox", { name: /nuevo responsable/i }),
      comentar: screen.queryByRole("textbox", { name: "Comentario" }),
      interno: screen.queryByRole("checkbox", { name: /interno/i }),
      pdf: screen.queryByRole("button", { name: /descargar pdf/i }),
      adjuntar: screen.queryByText(/adjuntar archivo/i),
      nuevaTarea: screen.queryByLabelText("Nueva tarea"),
    };
  }

  it("en el tipo con todas las acciones, cada control se muestra", async () => {
    server.use(http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ ...TICKET, asignadoId: "u-otro" })));
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: PERMISOS });
    await screen.findByText("Impresora rota");
    await screen.findByLabelText("Nueva tarea");

    for (const [nombre, control] of Object.entries(controles())) {
      expect(control, nombre).not.toBeNull();
    }
  });

  it("en el tipo que solo lee, ningún control de acción se muestra, aunque el JWT traiga las celdas", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({ ...TICKET, tipoId: "ti2", asignadoId: "u-otro" }),
      ),
    );
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: PERMISOS });
    await screen.findByText("Impresora rota");
    // Responsable del ticket: completa sus tareas (CA4), así que la lista ya está pintada.
    await screen.findByRole("button", { name: "Completar" });

    for (const [nombre, control] of Object.entries(controles())) {
      expect(control, nombre).toBeNull();
    }
  });

  it("COMENTAR sin OBSERVAR: comenta, pero sin el toggle de comentario interno", async () => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("COMENTAR") });
    await screen.findByText("Impresora rota");

    expect(screen.getByRole("textbox", { name: "Comentario" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /interno/i })).not.toBeInTheDocument();
  });

  it("adjuntar se ofrece con ALTAS o con MODIFICACION sobre el tipo", async () => {
    const conAltas = renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, {
      user: TECNICO,
      permisos: enTi1("ALTAS"),
    });
    await screen.findByText("Impresora rota");
    expect(screen.getByText(/adjuntar archivo/i)).toBeInTheDocument();
    conAltas.unmount();

    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("MODIFICACION") });
    await screen.findByText("Impresora rota");
    expect(screen.getByText(/adjuntar archivo/i)).toBeInTheDocument();
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

describe("TicketDetailView — ubicación y sector (odd/ubicacion-sector-ticket)", () => {
  const PRIORIDAD_UUID = "33333333-3333-3333-3333-333333333333";
  const SECTOR_ID = "44444444-4444-4444-4444-444444444444";

  function mockTicketConDatos(modulo: string) {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({
          ...TICKET,
          prioridadId: PRIORIDAD_UUID,
          ubicacion: "Aula 12",
          sectorId: SECTOR_ID,
          sectorNombre: "Primaria",
        }),
      ),
      http.get("/api/catalogos/tipos-ticket", () =>
        HttpResponse.json([{ id: "ti1", codigo: modulo, nombre: modulo, modulo, activo: true, createdAt: "", updatedAt: "" }]),
      ),
      http.get("/api/catalogos/prioridades", () =>
        HttpResponse.json([{ id: PRIORIDAD_UUID, codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" }]),
      ),
      http.get("/api/sectores", () =>
        HttpResponse.json([{ id: SECTOR_ID, codigo: "PRI", nombre: "Primaria", activo: true, createdAt: "", updatedAt: "" }]),
      ),
    );
  }

  beforeEach(() => mockBackend());

  it("ticket de TICKETS: la cabecera muestra ubicación y sector, y el modal edita los dos", async () => {
    mockTicketConDatos("TICKETS");
    let capturedBody: unknown = null;
    server.use(
      http.patch(`/api/tickets/${TICKET_ID}`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(TICKET);
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:MODIFICACION"] }),
    });

    expect(await screen.findByText("Aula 12")).toBeInTheDocument();
    expect(screen.getByText("Sector").nextElementSibling).toHaveTextContent("Primaria");

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    const ubicacionInput = await screen.findByLabelText("Ubicación");
    expect(ubicacionInput).toHaveValue("Aula 12");
    await waitFor(() => expect(screen.getByLabelText("Sector")).toHaveValue(SECTOR_ID));

    await user.clear(ubicacionInput);
    await user.type(ubicacionInput, "Aula 14");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody).toMatchObject({ ubicacion: "Aula 14", sectorId: SECTOR_ID }));
  });

  // Desde odd/ticket-unificado (S1) la ubicación es una sola, la del ticket, en cualquier tipo.
  it("ticket de EDILICIA: muestra la ubicación en la cabecera y el modal la edita como en cualquier tipo", async () => {
    mockTicketConDatos("EDILICIA");
    let capturedBody: unknown = null;
    server.use(
      http.patch(`/api/tickets/${TICKET_ID}`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(TICKET);
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:MODIFICACION"] }),
    });

    expect(await screen.findByText("Aula 12")).toBeInTheDocument();
    expect(screen.getByText("Ubicación").nextElementSibling).toHaveTextContent("Aula 12");

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    const ubicacionInput = await screen.findByLabelText("Ubicación");
    expect(ubicacionInput).toHaveValue("Aula 12");
    await waitFor(() => expect(screen.getByLabelText("Sector")).toHaveValue(SECTOR_ID));
    await user.clear(ubicacionInput);
    await user.type(ubicacionInput, "Patio");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody).toMatchObject({ ubicacion: "Patio", sectorId: SECTOR_ID }));
  });

  it("con el catálogo de tipos caído, la ubicación se muestra igual: ya no depende del módulo", async () => {
    mockTicketConDatos("TICKETS");
    server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json({ message: "falla" }, { status: 500 })));
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: buildUser({ permisos: [] }) });

    expect(await screen.findByText("Aula 12")).toBeInTheDocument();
  });

  // CA1: un tipo desactivado no viene en el catálogo de tipos activos, y el
  // ticket sigue aceptando ubicación.
  it("ticket con tipo desactivado (fuera del catálogo): muestra la ubicación en la cabecera y en el modal", async () => {
    mockTicketConDatos("TICKETS");
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({
          ...TICKET,
          tipoId: "tipo-desactivado",
          prioridadId: PRIORIDAD_UUID,
          ubicacion: "Aula 3",
          sectorId: SECTOR_ID,
          sectorNombre: "Primaria",
        }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:MODIFICACION"] }),
    });

    expect(await screen.findByText("Aula 3")).toBeInTheDocument();
    expect(screen.getByText("Ubicación")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    expect(await screen.findByLabelText("Ubicación")).toHaveValue("Aula 3");
  });
});

describe("TicketDetailView — tarjeta «Acciones» agrupada (odd/tasks/acciones-ticket-agrupadas, S2 y S3)", () => {
  beforeEach(() => mockBackend());

  it("con todos los permisos: tres grupos titulados, cada desplegable con etiqueta visible y un solo botón por grupo", async () => {
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:ASIGNAR", "TICKETS:TRANSICIONAR", "TICKETS:MODIFICACION"] }),
    });
    await screen.findByText("Impresora rota");

    const acciones = screen.getByRole("region", { name: /acciones/i });
    expect(within(acciones).getByRole("heading", { name: /^responsable$/i })).toBeInTheDocument();
    expect(within(acciones).getByRole("heading", { name: /^estado$/i })).toBeInTheDocument();
    expect(within(acciones).getByRole("heading", { name: /^ticket$/i })).toBeInTheDocument();

    // Las etiquetas son texto visible, no solo aria-label.
    expect(within(acciones).getByText("Nuevo responsable")).toBeInTheDocument();
    expect(within(acciones).getByText("Nuevo estado")).toBeInTheDocument();
    expect(within(acciones).getByRole("combobox", { name: /nuevo responsable/i })).toBeInTheDocument();
    expect(within(acciones).getByRole("combobox", { name: /nuevo estado/i })).toBeInTheDocument();

    // El usuario de prueba es corrector: también ve «Corregir estado», con su propia etiqueta.
    expect(within(acciones).getByText("Corregir estado")).toBeInTheDocument();
    expect(within(acciones).getByRole("combobox", { name: /corregir estado/i })).toBeInTheDocument();

    // Un botón de confirmación por desplegable, y los de ticket aparte.
    expect(within(acciones).getAllByRole("combobox")).toHaveLength(3);
    expect(within(acciones).getByRole("button", { name: /^corregir$/i })).toBeInTheDocument();
    expect(within(acciones).getByRole("button", { name: /asignar y poner en proceso/i })).toBeInTheDocument();
    expect(within(acciones).getByRole("button", { name: /^confirmar$/i })).toBeInTheDocument();
    expect(within(acciones).getByRole("button", { name: /^editar$/i })).toBeInTheDocument();
    expect(within(acciones).getByRole("button", { name: /descargar pdf/i })).toBeInTheDocument();
  });

  it("sin permisos de asignar ni transicionar: no quedan grupos vacíos, solo «Ticket»", async () => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1() });
    await screen.findByText("Impresora rota");

    const acciones = screen.getByRole("region", { name: /acciones/i });
    expect(within(acciones).queryByRole("heading", { name: /^responsable$/i })).not.toBeInTheDocument();
    expect(within(acciones).queryByRole("heading", { name: /^estado$/i })).not.toBeInTheDocument();
    expect(within(acciones).getByRole("heading", { name: /^ticket$/i })).toBeInTheDocument();
    expect(within(acciones).queryByRole("combobox")).not.toBeInTheDocument();
  });

  // odd/detalle-ticket-legible (S1, S2): Tareas y Actividad son tarjetas tituladas, y el formulario
  // de comentario vive dentro de Actividad, arriba de la lista.
  it("Tareas y Actividad son tarjetas, y el comentario y el adjunto viven dentro de «Actividad», arriba de la lista", async () => {
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, {
      user: buildUser({ permisos: ["TICKETS:COMENTAR"] }),
    });
    await screen.findByText("Impresora rota");

    const tareas = screen.getByRole("region", { name: /^tareas$/i });
    const actividad = screen.getByRole("region", { name: /^actividad$/i });
    expect(tareas).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /nuevo comentario/i })).not.toBeInTheDocument();

    const formulario = within(actividad).getByRole("textbox", { name: /comentario/i });
    const linea = within(actividad).getByText(/sin actividad todavía/i);
    // El formulario precede a la línea de tiempo en el DOM: lo nuevo arriba, y se escribe arriba.
    expect(formulario.compareDocumentPosition(linea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("TicketDetailView — resuelto, cerrado o cancelado: solo comentarios (odd/cerrado-solo-comentarios, S6)", () => {
  const ESTADOS = [
    { id: "e-nuevo", codigo: "NUEVO", nombre: "Nuevo", color: null, orden: 1, activo: true },
    { id: "e-en-proceso", codigo: "EN_PROCESO", nombre: "En proceso", color: null, orden: 3, activo: true },
    { id: "e-resuelto", codigo: "RESUELTO", nombre: "Resuelto", color: null, orden: 4, activo: true },
    { id: "e-cerrado", codigo: "CERRADO", nombre: "Cerrado", color: null, orden: 5, activo: true },
    { id: "e-cancelado", codigo: "CANCELADO", nombre: "Cancelado", color: null, orden: 6, activo: true },
  ];
  /** Todo sobre el tipo del ticket: lo único que lo frena es el estado. */
  const TODO: AccionTipoTicket[] = ["MODIFICACION", "TRANSICIONAR", "ASIGNAR", "COMENTAR", "OBSERVAR", "ALTAS"];
  const COMPRAS = [{ id: "co1", numero: "COM-0001", grupo: "COMPLETADAS", bloquea: false }];
  const tecnicoConCompras = buildUser({ ...TECNICO, permisos: [...TECNICO.permisos, "COMPRAS:LECTURA"] });
  const administrador = buildUser({ sub: "u-admin", rol: "ADMINISTRADOR", permisos: ["COMPRAS:LECTURA"] });

  /** El técnico es el responsable: fuera de estos estados gestiona tareas, compras y adjuntos. */
  function enEstado(estadoId: string) {
    server.use(
      http.get("/api/catalogos/estados", () => HttpResponse.json(ESTADOS)),
      http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ ...TICKET, estadoId, asignadoId: "u-otro" })),
      http.get(`/api/tickets/${TICKET_ID}/compras`, () => HttpResponse.json(COMPRAS)),
      http.get("/api/compras", () => HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 10 })),
    );
  }

  beforeEach(() => mockBackend());

  it.each([
    ["e-resuelto", "El ticket está resuelto: solo admite comentarios."],
    ["e-cerrado", "El ticket está cerrado: solo admite comentarios."],
    ["e-cancelado", "El ticket está cancelado: solo admite comentarios."],
  ])("%s, un no administrador: comenta (público e interno) pero no edita, ni reasigna, ni toca tareas, adjuntos o compras", async (estadoId, motivo) => {
    enEstado(estadoId);
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: tecnicoConCompras, permisos: enTi1(...TODO) });
    await screen.findByText("Impresora rota");
    const compras = (await screen.findByRole("heading", { name: "Compras vinculadas" })).closest("section") as HTMLElement;
    await within(compras).findByText("COM-0001");
    const tareas = screen.getByRole("heading", { name: "Tareas" }).closest("section") as HTMLElement;
    expect(await within(tareas).findByRole("note")).toHaveTextContent(motivo);

    expect(screen.getByRole("textbox", { name: "Comentario" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /interno/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^editar$/i })).toBeNull();
    const acciones = screen.getByRole("heading", { name: "Acciones" }).closest("section") as HTMLElement;
    expect(within(acciones).getByText(motivo)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /nuevo responsable/i })).toBeNull();
    expect(screen.queryByText(/adjuntar archivo/i)).toBeNull();
    expect(within(tareas).queryByLabelText("Nueva tarea")).toBeNull();
    expect(within(tareas).queryByRole("button", { name: "Completar" })).toBeNull();
    expect(within(compras).queryByRole("button", { name: /desvincular/i })).toBeNull();
    expect(within(compras).queryByLabelText(/vincular compra/i)).toBeNull();
  });

  it("caso hermano: el mismo técnico en EN_PROCESO gestiona tareas, adjuntos y compras", async () => {
    enEstado("e-en-proceso");
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: tecnicoConCompras, permisos: enTi1(...TODO) });
    const compras = (await screen.findByRole("heading", { name: "Compras vinculadas" })).closest("section") as HTMLElement;
    await within(compras).findByText("COM-0001");

    expect(await screen.findByLabelText("Nueva tarea")).toBeInTheDocument();
    expect(screen.getByText(/adjuntar archivo/i)).toBeInTheDocument();
    expect(within(compras).getByRole("button", { name: /desvincular/i })).toBeInTheDocument();
    expect(screen.queryByText(/solo admite comentarios/)).toBeNull();
  });

  it.each([
    ["e-resuelto", "El ticket está resuelto: solo admite comentarios."],
    ["e-cerrado", "El ticket está cerrado: solo admite comentarios."],
    ["e-cancelado", "El ticket está cancelado: solo admite comentarios."],
  ])("%s, un no administrador con BORRADO sobre el tipo no ve «Borrar» (L11)", async (estadoId, motivo) => {
    enEstado(estadoId);
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1(...TODO, "BORRADO") });
    const acciones = (await screen.findByRole("heading", { name: "Acciones" })).closest("section") as HTMLElement;
    // El motivo prueba que el catálogo de estados ya resolvió: la ausencia no es por carga.
    expect(await within(acciones).findByText(motivo)).toBeInTheDocument();
    // El tipo también resolvió (la cabecera muestra su nombre): sin la regla, «Borrar» estaría.
    expect(await screen.findByText("Soporte")).toBeInTheDocument();
    expect(within(acciones).queryByRole("button", { name: "Borrar" })).toBeNull();
  });

  it("caso hermano: el mismo técnico en EN_PROCESO ve «Borrar»", async () => {
    enEstado("e-en-proceso");
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1(...TODO, "BORRADO") });

    expect(await screen.findByRole("button", { name: "Borrar" })).toBeInTheDocument();
  });

  it.each(["e-resuelto", "e-cerrado", "e-cancelado"])("%s, un ADMINISTRADOR ve «Borrar» (S3)", async (estadoId) => {
    enEstado(estadoId);
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: administrador });

    expect(await screen.findByRole("button", { name: "Borrar" })).toBeInTheDocument();
  });

  it("un ADMINISTRADOR en CERRADO sigue gestionando tareas, adjuntos y compras (S3)", async () => {
    enEstado("e-cerrado");
    renderWithProviders(<TicketDetailView ticketId={TICKET_ID} />, { user: administrador });
    const compras = (await screen.findByRole("heading", { name: "Compras vinculadas" })).closest("section") as HTMLElement;
    await within(compras).findByText("COM-0001");

    expect(await screen.findByLabelText("Nueva tarea")).toBeInTheDocument();
    expect(screen.getByText(/adjuntar archivo/i)).toBeInTheDocument();
    expect(within(compras).getByRole("button", { name: /desvincular/i })).toBeInTheDocument();
    expect(screen.queryByText(/solo admite comentarios/)).toBeNull();
  });
});

describe("TicketDetailView — «Borrar» según el tipo del ticket (odd/permisos-por-tipo-ticket, S8)", () => {
  beforeEach(() => mockBackend());

  it("con BORRADO sobre el tipo del ticket se ofrece «Borrar» en un estado abierto", async () => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("BORRADO") });
    await screen.findByText("Impresora rota");

    expect(await screen.findByRole("button", { name: "Borrar" })).toBeInTheDocument();
  });

  it("un ticket PREVENTIVO no ofrece «Borrar» aunque tenga BORRADO sobre el tipo (L45)", async () => {
    server.use(
      http.get("/api/catalogos/tipos-ticket", () =>
        HttpResponse.json([
          { id: "ti1", codigo: "PREVENTIVO", nombre: "Preventivo", modulo: "EDILICIA", activo: true, createdAt: "", updatedAt: "" },
        ]),
      ),
    );
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("BORRADO") });
    await screen.findByText("Impresora rota");
    // El tipo ya se resolvió: la cabecera muestra su nombre.
    expect(await screen.findByText("Preventivo")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
  });

  it("caso hermano: un tipo desactivado (fuera del catálogo de activos) no es PREVENTIVO y ofrece «Borrar»", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ ...TICKET, tipoId: "tipo-desactivado" })),
    );
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, {
      user: TECNICO,
      permisos: permisosDeTest({ "tipo-desactivado": ["LECTURA", "BORRADO"] }),
    });
    await screen.findByText("Impresora rota");

    expect(await screen.findByRole("button", { name: "Borrar" })).toBeInTheDocument();
  });

  it("sin el catálogo de tipos no se sabe si es PREVENTIVO: no ofrece «Borrar»", async () => {
    server.use(http.get("/api/catalogos/tipos-ticket", () => HttpResponse.json({ message: "falla" }, { status: 500 })));
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("BORRADO") });
    await screen.findByText("Impresora rota");
    await waitFor(() => expect(screen.getByRole("heading", { name: /actividad/i })).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
  });

  // odd/preventivo-por-tipo: un plan puede generar tickets de cualquier tipo, y esos tampoco se
  // borran. El de este caso es del tipo común "ti1"; lo distingue la fecha objetivo del barrido.
  it("un ticket generado por un plan (con fecha objetivo) no ofrece «Borrar» aunque su tipo no sea PREVENTIVO", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({ ...TICKET, fechaObjetivo: "2026-11-01T00:00:00.000Z" }),
      ),
    );
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("BORRADO") });
    await screen.findByText("Impresora rota");
    await waitFor(() => expect(screen.getByRole("heading", { name: /actividad/i })).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
  });

  it("con BORRADO solo sobre otro tipo, no se ofrece (S2)", async () => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, {
      user: TECNICO,
      permisos: permisosDeTest({ ti1: ["LECTURA", "MODIFICACION"], ti2: ["LECTURA", "BORRADO"] }),
    });
    await screen.findByText("Impresora rota");

    expect(screen.queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
  });
});

/**
 * Compras vinculadas y bloqueo en el detalle (odd/ticket-unificado, S4, S5, L19): la sección se ve
 * solo con la celda COMPRAS:LECTURA, que es lo que exige `GET /tickets/:id/compras`; vincular y
 * desvincular piden además MODIFICACION sobre el tipo.
 */
describe("TicketDetailView — compras vinculadas y bloqueo (odd/ticket-unificado, S4, S5)", () => {
  const COMPRAS_DEL_TICKET = [
    { id: "co1", numero: "COM-0001", grupo: "ACTIVAS", bloquea: true },
    { id: "co2", numero: "COM-0002", grupo: "COMPLETADAS", bloquea: false },
  ];
  let lecturasDeCompras: number;

  beforeEach(() => {
    mockBackend();
    lecturasDeCompras = 0;
    server.use(
      // El técnico de prueba es el responsable: si el ticket no está bloqueado, gestiona tareas.
      http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ ...TICKET, asignadoId: "u-otro" })),
      http.get(`/api/tickets/${TICKET_ID}/compras`, () => {
        lecturasDeCompras += 1;
        return HttpResponse.json(COMPRAS_DEL_TICKET);
      }),
      http.get("/api/compras", () => HttpResponse.json({ items: [], total: 0, pagina: 1, porPagina: 10 })),
    );
  });

  const conCompras = buildUser({ ...TECNICO, permisos: [...TECNICO.permisos, "COMPRAS:LECTURA"] });

  it("con COMPRAS:LECTURA lista las compras vinculadas, marca el bloqueo y congela las tareas", async () => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: conCompras, permisos: enTi1("MODIFICACION") });

    const seccion = (await screen.findByRole("heading", { name: "Compras vinculadas" })).closest("section") as HTMLElement;
    expect(await within(seccion).findByText("COM-0001")).toBeInTheDocument();
    expect(within(seccion).getByText("COM-0002")).toBeInTheDocument();
    expect(within(seccion).getByText("Bloqueado por una compra en curso")).toBeInTheDocument();
    // S5: con una compra activa vinculada, las tareas quedan de solo lectura.
    const tareas = screen.getByRole("heading", { name: "Tareas" }).closest("section") as HTMLElement;
    expect(await within(tareas).findByRole("note")).toHaveTextContent(/bloqueado por una compra/);
    expect(within(tareas).queryByLabelText("Nueva tarea")).toBeNull();
  });

  it("caso hermano: sin compras que bloqueen, no marca bloqueo y las tareas siguen editables", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}/compras`, () =>
        HttpResponse.json([{ id: "co2", numero: "COM-0002", grupo: "COMPLETADAS", bloquea: false }]),
      ),
    );
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: conCompras, permisos: enTi1("MODIFICACION") });

    expect(await screen.findByText("COM-0002")).toBeInTheDocument();
    expect(await screen.findByLabelText("Nueva tarea")).toBeInTheDocument();
    expect(screen.queryByText("Bloqueado por una compra en curso")).toBeNull();
  });

  it("sin COMPRAS:LECTURA no muestra la sección ni pide las compras (L19)", async () => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("MODIFICACION") });

    await screen.findByText("Impresora rota");
    await screen.findByLabelText("Nueva tarea");
    expect(screen.queryByRole("heading", { name: "Compras vinculadas" })).toBeNull();
    expect(screen.queryByText("COM-0001")).toBeNull();
    expect(lecturasDeCompras).toBe(0);
  });

  it.each<[string, AccionTipoTicket[], boolean]>([
    ["con MODIFICACION sobre el tipo, vincula y desvincula", ["MODIFICACION"], true],
    ["con ALTAS y sin MODIFICACION, solo ve las compras", ["ALTAS"], false],
  ])("%s", async (_caso, acciones, gestiona) => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: conCompras, permisos: enTi1(...acciones) });

    const seccion = (await screen.findByRole("heading", { name: "Compras vinculadas" })).closest("section") as HTMLElement;
    await within(seccion).findByText("COM-0001");
    if (gestiona) {
      expect(within(seccion).getAllByRole("button", { name: /desvincular/i })).toHaveLength(2);
      expect(within(seccion).getByLabelText(/vincular compra/i)).toBeInTheDocument();
    } else {
      expect(within(seccion).queryByRole("button", { name: /desvincular/i })).toBeNull();
      expect(within(seccion).queryByLabelText(/vincular compra/i)).toBeNull();
    }
  });

  it("desvincular desde el detalle manda DELETE /tickets/:id/compras/:compraId y vuelve a leer el ticket", async () => {
    let borrada: string | null = null;
    let lecturasDelTicket = 0;
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () => {
        lecturasDelTicket += 1;
        return HttpResponse.json({ ...TICKET, asignadoId: "u-otro", bloqueada: true });
      }),
      http.delete(`/api/tickets/${TICKET_ID}/compras/:compraId`, ({ params }) => {
        borrada = String(params.compraId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: conCompras, permisos: enTi1("MODIFICACION") });

    const fila = (await screen.findByText("COM-0001")).closest("li") as HTMLElement;
    const lecturasAntes = lecturasDelTicket;
    await user.click(within(fila).getByRole("button", { name: /desvincular/i }));

    await waitFor(() => expect(borrada).toBe("co1"));
    // `bloqueada` del ticket cambia con el vínculo: el detalle no se queda con el dato viejo.
    await waitFor(() => expect(lecturasDelTicket).toBeGreaterThan(lecturasAntes));
  });

  it("sin COMPRAS:LECTURA, el bloqueo sale de `bloqueada` del ticket: marca el bloqueo y congela las tareas (L19, L22)", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({ ...TICKET, asignadoId: "u-otro", bloqueada: true }),
      ),
    );
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("MODIFICACION") });

    const tareas = (await screen.findByRole("heading", { name: "Tareas" })).closest("section") as HTMLElement;
    expect(await within(tareas).findByText("Bloqueado por una compra en curso")).toBeInTheDocument();
    expect(await within(tareas).findByRole("note")).toHaveTextContent(/bloqueado por una compra/);
    expect(within(tareas).queryByLabelText("Nueva tarea")).toBeNull();
    // Sigue sin ver qué compra lo bloquea, ni se la pide al backend.
    expect(screen.queryByRole("heading", { name: "Compras vinculadas" })).toBeNull();
    expect(screen.queryByText("COM-0001")).toBeNull();
    expect(lecturasDeCompras).toBe(0);
  });

  it("caso hermano: sin COMPRAS:LECTURA y `bloqueada: false`, no marca bloqueo y las tareas siguen editables", async () => {
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: TECNICO, permisos: enTi1("MODIFICACION") });

    expect(await screen.findByLabelText("Nueva tarea")).toBeInTheDocument();
    expect(screen.queryByText("Bloqueado por una compra en curso")).toBeNull();
  });

  it("con COMPRAS:LECTURA el bloqueo se marca una sola vez, en la sección de compras", async () => {
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({ ...TICKET, asignadoId: "u-otro", bloqueada: true }),
      ),
    );
    renderConPermisos(<TicketDetailView ticketId={TICKET_ID} />, { user: conCompras, permisos: enTi1("MODIFICACION") });

    const seccion = (await screen.findByRole("heading", { name: "Compras vinculadas" })).closest("section") as HTMLElement;
    expect(await within(seccion).findByText("Bloqueado por una compra en curso")).toBeInTheDocument();
    expect(screen.getAllByText("Bloqueado por una compra en curso")).toHaveLength(1);
  });
});
