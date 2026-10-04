import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketSoporteCreateDialog } from "./ticket-soporte-create-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PRIORIDAD_ID = "22222222-2222-2222-2222-222222222222";
const EQUIPO_ID = "33333333-3333-3333-3333-333333333333";
const PRIORIDAD = {
  id: PRIORIDAD_ID,
  codigo: "MEDIA",
  nombre: "Media",
  color: null,
  orden: 1,
  activo: true,
  createdAt: "",
  updatedAt: "",
};
const EQUIPO = {
  id: EQUIPO_ID,
  nombre: "Notebook Dell",
  numeroSerie: "SN-001",
  marca: "Dell",
  modelo: "Latitude",
  fechaAdquisicion: null,
  ubicacionId: null,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend() {
  server.use(
    http.get("/api/catalogos/prioridades", () => HttpResponse.json([PRIORIDAD])),
    http.get("/api/equipos", () => HttpResponse.json([EQUIPO])),
  );
}

describe("TicketSoporteCreateDialog — vínculo OPCIONAL equipo↔ticket (80/20)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.success).mockClear();
  });

  it("crear ticket de soporte SIN elegir equipo NO envía equipoId en el body", async () => {
    const user = userEvent.setup();
    let bodyRecibido: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/soporte", async ({ request }) => {
        bodyRecibido = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "ts1",
          ticketId: "t1",
          numero: "SOP-0001",
          titulo: "PC no enciende",
          estadoId: "e1",
          equipoId: null,
          descripcionProblema: null,
          solucionAplicada: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }),
    );

    renderWithProviders(<TicketSoporteCreateDialog />, { user: buildUser({ permisos: ["ticket:crear"] }) });

    await user.click(screen.getByRole("button", { name: /nuevo ticket de soporte/i }));
    await user.type(screen.getByLabelText(/título/i), "PC no enciende");
    // "Sin equipo" es el default del select — no se toca.
    await user.selectOptions(screen.getByLabelText(/prioridad/i), PRIORIDAD_ID);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(bodyRecibido).not.toBeNull());
    expect(bodyRecibido).not.toHaveProperty("equipoId");
    expect(toast.success).toHaveBeenCalled();
  });

  it("crear ticket de soporte ELIGIENDO un equipo SÍ envía el equipoId seleccionado", async () => {
    const user = userEvent.setup();
    let bodyRecibido: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/soporte", async ({ request }) => {
        bodyRecibido = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "ts1",
          ticketId: "t1",
          numero: "SOP-0002",
          titulo: "Pantalla rota",
          estadoId: "e1",
          equipoId: EQUIPO_ID,
          descripcionProblema: null,
          solucionAplicada: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }),
    );

    renderWithProviders(<TicketSoporteCreateDialog />, { user: buildUser({ permisos: ["ticket:crear"] }) });

    await user.click(screen.getByRole("button", { name: /nuevo ticket de soporte/i }));
    await user.type(screen.getByLabelText(/título/i), "Pantalla rota");
    await user.selectOptions(screen.getByLabelText(/equipo/i), EQUIPO_ID);
    await user.selectOptions(screen.getByLabelText(/prioridad/i), PRIORIDAD_ID);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(bodyRecibido).not.toBeNull());
    expect(bodyRecibido).toMatchObject({ equipoId: EQUIPO_ID });
  });

  // Spec: sdd/formulario-publico-qr (D3) — el landing del QR abre el dialogo con el equipo elegido.
  it("equipoInicial + abiertoInicial: abre solo, con el equipo elegido, y lo envia aunque el listado no lo traiga", async () => {
    const user = userEvent.setup();
    let bodyRecibido: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/equipos", () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })),
      http.post("/api/soporte", async ({ request }) => {
        bodyRecibido = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "ts1", ticketId: "t1", numero: "SOP-0003", titulo: "x", estadoId: "e1", equipoId: EQUIPO_ID });
      }),
    );

    renderWithProviders(
      <TicketSoporteCreateDialog abiertoInicial equipoInicial={{ id: EQUIPO_ID, nombre: "Notebook Dell" }} />,
      { user: buildUser({ permisos: ["ticket:crear"] }) },
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((screen.getByLabelText(/equipo/i) as HTMLSelectElement).value).toBe(EQUIPO_ID);

    await user.type(screen.getByLabelText(/título/i), "Pantalla rota");
    await user.selectOptions(screen.getByLabelText(/prioridad/i), PRIORIDAD_ID);
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(bodyRecibido).not.toBeNull());
    expect(bodyRecibido).toMatchObject({ equipoId: EQUIPO_ID });
  });

  it("equipoInicial listado tambien por el endpoint: la opcion no se duplica", async () => {
    renderWithProviders(
      <TicketSoporteCreateDialog abiertoInicial equipoInicial={{ id: EQUIPO_ID, nombre: "Notebook Dell" }} />,
      { user: buildUser({ permisos: ["ticket:crear"] }) },
    );

    await screen.findByRole("option", { name: /Notebook Dell/ });
    await waitFor(() => expect(screen.getAllByRole("option", { name: /Notebook Dell/ })).toHaveLength(1));
  });

  it("sin props el dialogo arranca cerrado", () => {
    renderWithProviders(<TicketSoporteCreateDialog />, { user: buildUser({ permisos: ["ticket:crear"] }) });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
