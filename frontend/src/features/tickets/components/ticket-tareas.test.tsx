import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { buildUser } from "../../../../test/render-with-providers";
import { permisosDeTest, renderConPermisos } from "@/shared/hooks/use-permisos-por-tipo.test-helpers";
import type { PermisosPorTipo } from "@/shared/auth/permisos-por-tipo";
import { TicketTareas } from "./ticket-tareas";
import { useTicket } from "../hooks/use-ticket";
import type { TareaTicket } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TICKET_ID = "t1";
/** Tipo del ticket: gestionar tareas exige MODIFICACION sobre él (odd/permisos-por-tipo-ticket). */
const TIPO = "tipo-soporte";
const OTRO_TIPO = "tipo-mantenimiento";
const CON_MODIFICACION = permisosDeTest({ [TIPO]: ["LECTURA", "MODIFICACION"], [OTRO_TIPO]: ["LECTURA"] });
const SIN_MODIFICACION = permisosDeTest({ [TIPO]: ["LECTURA"] });
const RESPONSABLE = "u-responsable";
const TECNICO = "u-tecnico";

function tarea(overrides: Partial<TareaTicket> = {}): TareaTicket {
  return {
    id: "ta1",
    ticketId: TICKET_ID,
    descripcion: "Cambiar el disco",
    orden: 1,
    tecnicoId: null,
    tecnicoNombre: null,
    tecnicoApellido: null,
    completada: false,
    completadaEn: null,
    completadaPorId: null,
    completadaPorNombre: null,
    completadaPorApellido: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

const PENDIENTE = tarea();
const COMPLETADA = tarea({
  id: "ta2",
  descripcion: "Reinstalar el sistema",
  orden: 2,
  tecnicoId: TECNICO,
  tecnicoNombre: "Ana",
  tecnicoApellido: "García",
  completada: true,
  completadaEn: "2026-10-02T13:00:00.000Z",
  completadaPorId: TECNICO,
  completadaPorNombre: "Ana",
  completadaPorApellido: "García",
});

function mockTareas(items: TareaTicket[] = [PENDIENTE, COMPLETADA]) {
  const completadas = items.filter((t) => t.completada).length;
  server.use(
    http.get(`/api/tickets/${TICKET_ID}/tareas`, () =>
      HttpResponse.json({
        items,
        avance: {
          total: items.length,
          completadas,
          porcentaje: items.length ? Math.round((completadas / items.length) * 100) : 0,
        },
      }),
    ),
    http.get(`/api/tickets/${TICKET_ID}/tareas/tecnicos-elegibles`, () =>
      HttpResponse.json([{ id: TECNICO, nombre: "Ana", apellido: "García" }]),
    ),
  );
}

/** Responsable del ticket, TECNICO; con `CON_MODIFICACION`, modifica el tipo del ticket. */
const responsable = buildUser({ sub: RESPONSABLE, rol: "TECNICO", permisos: [] });

function renderTareas(
  user = responsable,
  asignadoId: string | null | undefined = RESPONSABLE,
  permisos: PermisosPorTipo = CON_MODIFICACION,
  tipoId = TIPO,
) {
  return renderConPermisos(<TicketTareas ticketId={TICKET_ID} asignadoId={asignadoId} tipoId={tipoId} />, {
    user,
    permisos,
  });
}

function filaDe(descripcion: string): HTMLElement {
  return screen.getByText(descripcion).closest("li") as HTMLElement;
}

describe("TicketTareas — listado y avance", () => {
  it("muestra el avance, el técnico o «Sin técnico», el estado y quién completó", async () => {
    mockTareas();
    renderTareas();

    expect(await screen.findByText("50% · 1 de 2 completadas")).toBeInTheDocument();
    const pendiente = filaDe("Cambiar el disco");
    expect(within(pendiente).getByText("Sin técnico", { selector: "span" })).toBeInTheDocument();
    expect(within(pendiente).getByText("Pendiente")).toBeInTheDocument();

    const completada = filaDe("Reinstalar el sistema");
    expect(within(completada).getByText("Técnico: Ana García")).toBeInTheDocument();
    expect(within(completada).getByText("Completada")).toBeInTheDocument();
    expect(within(completada).getByText(/^Completada el .+ por Ana García$/)).toBeInTheDocument();
  });

  it("con tareas avisa que completarlas mueve el estado del ticket", async () => {
    mockTareas();
    renderTareas();

    expect(await screen.findByText(/Completar tareas mueve el ticket/)).toBeInTheDocument();
  });

  it("sin tareas muestra el vacío y no un avance de 0 %", async () => {
    mockTareas([]);
    renderTareas();
    expect(await screen.findByText("Sin tareas todavía.")).toBeInTheDocument();
    expect(screen.queryByText(/completadas$/)).not.toBeInTheDocument();
  });
});

describe("TicketTareas — mutaciones sobre las rutas genéricas", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("agregar hace POST /tickets/:id/tareas con la descripción", async () => {
    const user = userEvent.setup();
    let body: unknown;
    mockTareas();
    server.use(
      http.post(`/api/tickets/${TICKET_ID}/tareas`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(tarea({ id: "ta3", descripcion: "Probar" }), { status: 201 });
      }),
    );
    renderTareas();

    await user.type(await screen.findByLabelText("Nueva tarea"), "Probar");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(body).toEqual({ descripcion: "Probar" }));
    expect(toast.success).toHaveBeenCalledWith("Tarea agregada.");
  });

  it("una descripción de puros espacios no llega al backend", async () => {
    const user = userEvent.setup();
    let llamado = false;
    mockTareas();
    server.use(
      http.post(`/api/tickets/${TICKET_ID}/tareas`, () => {
        llamado = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderTareas();

    await user.type(await screen.findByLabelText("Nueva tarea"), "   ");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByText("La descripción es requerida")).toBeInTheDocument();
    expect(llamado).toBe(false);
  });

  it("asignar y quitar el técnico hacen PATCH .../tecnico con el id o con null", async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    mockTareas();
    server.use(
      http.patch(`/api/tickets/${TICKET_ID}/tareas/:tareaId/tecnico`, async ({ request, params }) => {
        bodies.push([params.tareaId, await request.json()]);
        return HttpResponse.json(PENDIENTE);
      }),
    );
    renderTareas();

    await screen.findByText("Cambiar el disco");
    const selector = screen.getByLabelText("Técnico de la tarea Cambiar el disco");
    await waitFor(() => expect(within(selector).getByRole("option", { name: "Ana García" })).toBeInTheDocument());
    await user.selectOptions(selector, TECNICO);
    await user.selectOptions(screen.getByLabelText("Técnico de la tarea Reinstalar el sistema"), "");

    await waitFor(() =>
      expect(bodies).toEqual([
        ["ta1", { tecnicoId: TECNICO }],
        ["ta2", { tecnicoId: null }],
      ]),
    );
  });

  it("completar y descompletar llaman a sus rutas", async () => {
    const user = userEvent.setup();
    const rutas: string[] = [];
    mockTareas();
    server.use(
      http.post(`/api/tickets/${TICKET_ID}/tareas/:tareaId/:accion`, ({ params }) => {
        rutas.push(`${params.tareaId}/${params.accion}`);
        return HttpResponse.json(PENDIENTE);
      }),
    );
    renderTareas();

    await screen.findByText("Cambiar el disco");
    await user.click(within(filaDe("Cambiar el disco")).getByRole("button", { name: "Completar" }));
    await user.click(within(filaDe("Reinstalar el sistema")).getByRole("button", { name: "Descompletar" }));

    await waitFor(() => expect(rutas).toEqual(["ta1/completar", "ta2/descompletar"]));
  });

  // odd/estado-por-tareas (S7): completar mueve el estado del ticket en el backend, así que el
  // detalle se vuelve a pedir sin recargar la página.
  it("completar vuelve a pedir el detalle del ticket, porque su estado pudo cambiar", async () => {
    const user = userEvent.setup();
    let lecturasDelTicket = 0;
    mockTareas();
    server.use(
      http.get(`/api/tickets/${TICKET_ID}`, () => {
        lecturasDelTicket += 1;
        return HttpResponse.json({ id: TICKET_ID });
      }),
      http.post(`/api/tickets/${TICKET_ID}/tareas/:tareaId/completar`, () => HttpResponse.json(COMPLETADA)),
    );
    function DetalleConTareas() {
      const ticketQuery = useTicket(TICKET_ID);
      return (
        <>
          <span>{ticketQuery.data ? "ticket cargado" : "ticket cargando"}</span>
          <TicketTareas ticketId={TICKET_ID} asignadoId={RESPONSABLE} tipoId={TIPO} />
        </>
      );
    }
    renderConPermisos(<DetalleConTareas />, { user: responsable, permisos: CON_MODIFICACION });

    await screen.findByText("ticket cargado");
    await screen.findByText("Cambiar el disco");
    expect(lecturasDelTicket).toBe(1);

    await user.click(within(filaDe("Cambiar el disco")).getByRole("button", { name: "Completar" }));

    await waitFor(() => expect(lecturasDelTicket).toBe(2));
  });

  it("eliminar pide confirmación y recién entonces hace DELETE", async () => {
    const user = userEvent.setup();
    let borrada: string | undefined;
    mockTareas();
    server.use(
      http.delete(`/api/tickets/${TICKET_ID}/tareas/:tareaId`, ({ params }) => {
        borrada = String(params.tareaId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTareas();

    await user.click(await screen.findByRole("button", { name: "Eliminar tarea Cambiar el disco" }));
    expect(screen.getByText("¿Eliminar la tarea?")).toBeInTheDocument();
    expect(borrada).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(borrada).toBe("ta1"));
    expect(toast.success).toHaveBeenCalledWith("Tarea eliminada.");
  });

  it.each([
    [403, "completar", "No tiene permiso para hacer eso con las tareas de este ticket."],
    [422, "asignar", "Ese técnico no puede tomar tareas de este ticket."],
  ])("un %i del backend al %s se muestra como toast legible", async (status, accion, mensaje) => {
    const user = userEvent.setup();
    const cuerpo = { statusCode: status, message: 'La tarea "ta1" ...', error: "x" };
    mockTareas();
    server.use(
      http.post(`/api/tickets/${TICKET_ID}/tareas/ta1/completar`, () => HttpResponse.json(cuerpo, { status })),
      http.patch(`/api/tickets/${TICKET_ID}/tareas/ta1/tecnico`, () => HttpResponse.json(cuerpo, { status })),
    );
    renderTareas();

    await screen.findByText("Cambiar el disco");
    if (accion === "completar") {
      await user.click(within(filaDe("Cambiar el disco")).getByRole("button", { name: "Completar" }));
    } else {
      const selector = screen.getByLabelText("Técnico de la tarea Cambiar el disco");
      await waitFor(() => expect(within(selector).getByRole("option", { name: "Ana García" })).toBeInTheDocument());
      await user.selectOptions(selector, TECNICO);
    }

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje));
  });

  it("un 403 al completar refresca la lista: la tarea pudo haber cambiado de técnico (JD-S2)", async () => {
    const user = userEvent.setup();
    let pedidosDeLista = 0;
    mockTareas();
    server.use(
      http.get(`/api/tickets/${TICKET_ID}/tareas`, () => {
        pedidosDeLista += 1;
        return HttpResponse.json({
          items: [PENDIENTE, COMPLETADA],
          avance: { total: 2, completadas: 1, porcentaje: 50 },
        });
      }),
      http.post(`/api/tickets/${TICKET_ID}/tareas/ta1/completar`, () =>
        HttpResponse.json({ statusCode: 403, message: "x", error: "Forbidden" }, { status: 403 }),
      ),
    );
    renderTareas();

    await screen.findByText("Cambiar el disco");
    const antes = pedidosDeLista;
    await user.click(within(filaDe("Cambiar el disco")).getByRole("button", { name: "Completar" }));

    await waitFor(() => expect(pedidosDeLista).toBeGreaterThan(antes));
  });
});

describe("TicketTareas — botones por actor (CA3, CA4)", () => {
  it.each([
    ["el responsable con MODIFICACION sobre el tipo", responsable, CON_MODIFICACION, true, ["Completar", "Descompletar"]],
    [
      "un ADMINISTRADOR que no es el responsable",
      buildUser({ sub: "u-admin", rol: "ADMINISTRADOR", permisos: [] }),
      permisosDeTest({}),
      true,
      ["Completar", "Descompletar"],
    ],
    [
      "el técnico de una tarea: solo completa la suya",
      buildUser({ sub: TECNICO, rol: "TECNICO", permisos: [] }),
      CON_MODIFICACION,
      false,
      ["Descompletar"],
    ],
    [
      "el responsable sin MODIFICACION sobre el tipo: completa pero no gestiona, aunque tenga la celda del JWT",
      buildUser({ sub: RESPONSABLE, rol: "TECNICO", permisos: ["TICKETS:MODIFICACION"] }),
      SIN_MODIFICACION,
      false,
      ["Completar", "Descompletar"],
    ],
    [
      "un usuario ajeno, aunque tenga MODIFICACION sobre el tipo",
      buildUser({ sub: "u-otro", rol: "TECNICO", permisos: [] }),
      CON_MODIFICACION,
      false,
      [],
    ],
  ])("%s", async (_caso, usuario, permisos, gestiona, botones) => {
    mockTareas();
    renderTareas(usuario, RESPONSABLE, permisos);
    await screen.findByText("Cambiar el disco");

    expect(screen.queryByLabelText("Nueva tarea") !== null).toBe(gestiona);
    expect(screen.queryByLabelText("Técnico de la tarea Cambiar el disco") !== null).toBe(gestiona);
    expect(screen.queryByRole("button", { name: "Eliminar tarea Cambiar el disco" }) !== null).toBe(gestiona);
    const visibles = screen
      .queryAllByRole("button", { name: /^(Completar|Descompletar)$/ })
      .map((b) => b.textContent);
    expect(visibles).toEqual(botones);
  });
});

describe("TicketTareas — MODIFICACION sobre el tipo del ticket (odd/permisos-por-tipo-ticket, S6)", () => {
  it("el mismo responsable gestiona en el tipo con MODIFICACION y no en el que solo lee", async () => {
    mockTareas();
    const enTipoConModificacion = renderTareas(responsable, RESPONSABLE, CON_MODIFICACION, TIPO);
    await screen.findByText("Cambiar el disco");
    expect(screen.getByLabelText("Nueva tarea")).toBeInTheDocument();
    enTipoConModificacion.unmount();

    renderTareas(responsable, RESPONSABLE, CON_MODIFICACION, OTRO_TIPO);
    await screen.findByText("Cambiar el disco");
    expect(screen.queryByLabelText("Nueva tarea")).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar tarea Cambiar el disco" })).toBeNull();
    // Completar no depende del tipo: el responsable sigue completando (CA4).
    expect(within(filaDe("Cambiar el disco")).getByRole("button", { name: "Completar" })).toBeInTheDocument();
  });
});

describe("TicketTareas — solo lectura (odd/ticket-cerrado-solo-lectura, S4)", () => {
  it("con motivo, el responsable con permiso ve la lista y el motivo, pero ningún control", async () => {
    mockTareas();
    renderConPermisos(
      <TicketTareas
        ticketId={TICKET_ID}
        asignadoId={RESPONSABLE}
        tipoId={TIPO}
        motivoSoloLectura="El ticket está cerrado: sus tareas ya no se modifican."
      />,
      { user: responsable, permisos: CON_MODIFICACION },
    );
    await screen.findByText("Cambiar el disco");

    expect(screen.getByRole("note")).toHaveTextContent("El ticket está cerrado");
    expect(screen.queryByLabelText("Nueva tarea")).toBeNull();
    expect(screen.queryByLabelText("Técnico de la tarea Cambiar el disco")).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar tarea Cambiar el disco" })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^(Completar|Descompletar)$/ })).toHaveLength(0);
  });

  it("sin motivo (null) todo sigue como antes", async () => {
    mockTareas();
    renderConPermisos(
      <TicketTareas ticketId={TICKET_ID} asignadoId={RESPONSABLE} tipoId={TIPO} motivoSoloLectura={null} />,
      { user: responsable, permisos: CON_MODIFICACION },
    );
    await screen.findByText("Cambiar el disco");

    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByLabelText("Nueva tarea")).toBeInTheDocument();
  });
});
