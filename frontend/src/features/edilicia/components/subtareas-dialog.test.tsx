import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { SubtareasDialog } from "./subtareas-dialog";
import type { TareaTicket } from "@/features/tickets/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * odd/tareas-con-tecnico (T6): el diálogo de Edilicia usa las tareas genéricas
 * del ticket (`/tickets/:ticketId/tareas`), no las rutas viejas de
 * `/reparaciones/.../subtareas`, y sus botones siguen CA3/CA4.
 */
const TICKET_ID = "tk1";

const TAREA: TareaTicket = {
  id: "ta1",
  ticketId: TICKET_ID,
  descripcion: "Revisar cañería",
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
};

/** Registra toda ruta vieja que se pida: ninguna debería. */
function mockBackend({ asignadoId = "u-responsable" }: { asignadoId?: string | null } = {}) {
  const rutasViejas: string[] = [];
  let tareas: TareaTicket[] = [TAREA];
  server.use(
    http.get(`/api/tickets/${TICKET_ID}`, () => HttpResponse.json({ id: TICKET_ID, asignadoId })),
    http.get(`/api/tickets/${TICKET_ID}/tareas`, () =>
      HttpResponse.json({
        items: tareas,
        avance: { total: tareas.length, completadas: 0, porcentaje: 0 },
      }),
    ),
    http.get(`/api/tickets/${TICKET_ID}/tareas/tecnicos-elegibles`, () => HttpResponse.json([])),
    http.post(`/api/tickets/${TICKET_ID}/tareas`, () => {
      const nueva = { ...TAREA, id: "ta2", descripcion: "Pintar pared", orden: 2 };
      tareas = [...tareas, nueva];
      return HttpResponse.json(nueva, { status: 201 });
    }),
    http.get("/api/reparaciones", () => HttpResponse.json([])),
    http.all("/api/reparaciones/*", ({ request }) => {
      rutasViejas.push(`${request.method} ${new URL(request.url).pathname}`);
      return HttpResponse.json({}, { status: 500 });
    }),
  );
  return { rutasViejas };
}

function renderDialog(user = buildUser()) {
  return renderWithProviders(
    <SubtareasDialog ticketId={TICKET_ID} numero="EDI-0001" trigger={<button>Ver subtareas</button>} />,
    { user },
  );
}

describe("SubtareasDialog — tareas genéricas del ticket", () => {
  it("lista las tareas del ticket y agrega por POST /tickets/:id/tareas, sin tocar las rutas viejas", async () => {
    const user = userEvent.setup();
    const { rutasViejas } = mockBackend();
    renderDialog(
      buildUser({ sub: "u-responsable", rol: "TECNICO", permisos: ["TICKETS:LECTURA", "EDILICIA:MODIFICACION"] }),
    );

    await user.click(screen.getByRole("button", { name: /ver subtareas/i }));
    expect(await screen.findByText(/subtareas — edi-0001/i)).toBeInTheDocument();
    expect(await screen.findByText("Revisar cañería")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nueva tarea"), "Pintar pared");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByText("Pintar pared")).toBeInTheDocument();
    expect(rutasViejas).toEqual([]);
  });

  it("los permisos viejos de Edilicia ya no alcanzan: un no responsable con ALTAS y BORRADO no gestiona", async () => {
    const user = userEvent.setup();
    mockBackend();
    renderDialog(
      buildUser({
        sub: "u-otro",
        rol: "TECNICO",
        permisos: ["TICKETS:LECTURA", "EDILICIA:ALTAS", "EDILICIA:MODIFICACION", "EDILICIA:BORRADO"],
      }),
    );

    await user.click(screen.getByRole("button", { name: /ver subtareas/i }));
    await screen.findByText("Revisar cañería");
    // Espera a que el responsable se resuelva: antes de eso es desconocido y se muestra.
    await waitFor(() => expect(screen.queryByLabelText("Nueva tarea")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Completar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar tarea/i })).not.toBeInTheDocument();
  });

  it("sin TICKETS:LECTURA el responsable es desconocido: con EDILICIA:MODIFICACION ve los controles y decide el backend", async () => {
    const user = userEvent.setup();
    mockBackend();
    renderDialog(buildUser({ sub: "u-x", rol: "TECNICO", permisos: ["EDILICIA:MODIFICACION"] }));

    await user.click(screen.getByRole("button", { name: /ver subtareas/i }));
    await screen.findByText("Revisar cañería");
    expect(screen.getByLabelText("Nueva tarea")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completar" })).toBeInTheDocument();
  });

  it("un TECNICO sin el permiso del módulo, que no es técnico de la tarea, solo lee", async () => {
    const user = userEvent.setup();
    mockBackend();
    renderDialog(buildUser({ sub: "u-x", rol: "TECNICO", permisos: [] }));

    await user.click(screen.getByRole("button", { name: /ver subtareas/i }));
    await screen.findByText("Revisar cañería");
    expect(screen.queryByLabelText("Nueva tarea")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completar" })).not.toBeInTheDocument();
  });
});

describe("SubtareasDialog — lector de Edilicia que no ve el ticket", () => {
  it("si GET /tickets/:id/tareas da 404, muestra de solo lectura las subtareas embebidas del listado", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`/api/tickets/${TICKET_ID}/tareas`, () =>
        HttpResponse.json({ statusCode: 404, message: "no", error: "Not Found" }, { status: 404 }),
      ),
    );
    renderWithProviders(
      <SubtareasDialog
        ticketId={TICKET_ID}
        numero="EDI-0001"
        trigger={<button>Ver subtareas</button>}
        subtareas={[
          {
            id: "s1",
            ticketEdiliciaId: "rep1",
            descripcion: "Revisar cañería",
            completada: false,
            completadaEn: null,
            completadaPorId: null,
            orden: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]}
      />,
      { user: buildUser({ sub: "u-x", rol: "USUARIO", permisos: ["EDILICIA:LECTURA"] }) },
    );

    await user.click(screen.getByRole("button", { name: /ver subtareas/i }));
    const lista = await screen.findByRole("list", { name: "Tareas (solo lectura)" });
    expect(lista).toHaveTextContent("Revisar cañería");
    expect(screen.queryByRole("button", { name: "Completar" })).not.toBeInTheDocument();
  });
});
