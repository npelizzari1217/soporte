import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketTareas } from "./ticket-tareas";
import type { TareaTicket } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TICKET_ID = "t1";
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

/** Responsable del ticket, TECNICO, con el permiso de modificación del módulo. */
const responsable = buildUser({ sub: RESPONSABLE, rol: "TECNICO", permisos: ["TICKETS:MODIFICACION"] });

function renderTareas(user = responsable, asignadoId: string | null | undefined = RESPONSABLE) {
  return renderWithProviders(<TicketTareas ticketId={TICKET_ID} asignadoId={asignadoId} modulo="TICKETS" />, {
    user,
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
    [403, "completar", "No tenés permiso para hacer eso con las tareas de este ticket."],
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
});

describe("TicketTareas — botones por actor (CA3, CA4)", () => {
  it.each([
    ["el responsable con el permiso del módulo", responsable, true, ["Completar", "Descompletar"]],
    [
      "un ADMINISTRADOR que no es el responsable",
      buildUser({ sub: "u-admin", rol: "ADMINISTRADOR", permisos: ["TICKETS:MODIFICACION"] }),
      true,
      ["Completar", "Descompletar"],
    ],
    [
      "el técnico de una tarea: solo completa la suya",
      buildUser({ sub: TECNICO, rol: "TECNICO", permisos: ["TICKETS:MODIFICACION"] }),
      false,
      ["Descompletar"],
    ],
    [
      "el responsable sin el permiso del módulo: completa pero no gestiona",
      buildUser({ sub: RESPONSABLE, rol: "TECNICO", permisos: [] }),
      false,
      ["Completar", "Descompletar"],
    ],
    [
      "un usuario ajeno, aunque tenga el permiso del módulo",
      buildUser({ sub: "u-otro", rol: "TECNICO", permisos: ["TICKETS:MODIFICACION"] }),
      false,
      [],
    ],
  ])("%s", async (_caso, usuario, gestiona, botones) => {
    mockTareas();
    renderTareas(usuario);
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
