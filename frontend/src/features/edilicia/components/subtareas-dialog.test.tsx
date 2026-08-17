import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { SubtareasDialog } from "./subtareas-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("SubtareasDialog — completar subtarea gateado (80/20)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
  });

  it.each([
    ["con EDILICIA:ALTAS+MODIFICACION", ["EDILICIA:ALTAS", "EDILICIA:MODIFICACION"], true],
    ["sin ninguna celda EDILICIA (solo lectura)", [], false],
  ])("acciones del checklist — %s", async (_label, permisos, shouldShowActions) => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/reparaciones/rep1/subtareas", () =>
        HttpResponse.json({
          id: "s1",
          ticketEdiliciaId: "rep1",
          descripcion: "Pintar pared",
          completada: false,
          completadaEn: null,
          completadaPorId: null,
          orden: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
    );

    renderWithProviders(
      <SubtareasDialog reparacionId="rep1" numero="EDI-0001" trigger={<button>Ver subtareas</button>} />,
      { user: buildUser({ permisos }) },
    );

    await user.click(screen.getByRole("button", { name: /ver subtareas/i }));
    await screen.findByText(/subtareas — edi-0001/i);

    if (shouldShowActions) {
      expect(screen.getByLabelText(/nueva subtarea/i)).toBeInTheDocument();
      await user.type(screen.getByLabelText(/nueva subtarea/i), "Pintar pared");
      await user.click(screen.getByRole("button", { name: /^agregar$/i }));
      expect(await screen.findByRole("button", { name: /^completar$/i })).toBeInTheDocument();
    } else {
      expect(screen.queryByLabelText(/nueva subtarea/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^completar$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/sin subtareas todavía/i)).toBeInTheDocument();
    }
  });

  it("completar subtarea dispara POST /reparaciones/subtareas/:id/completar y actualiza el checklist a completada", async () => {
    const user = userEvent.setup();
    let completarLlamado = false;
    server.use(
      http.post("/api/reparaciones/rep1/subtareas", () =>
        HttpResponse.json({
          id: "s1",
          ticketEdiliciaId: "rep1",
          descripcion: "Pintar pared",
          completada: false,
          completadaEn: null,
          completadaPorId: null,
          orden: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
      http.post("/api/reparaciones/subtareas/s1/completar", () => {
        completarLlamado = true;
        return HttpResponse.json({
          id: "s1",
          ticketEdiliciaId: "rep1",
          descripcion: "Pintar pared",
          completada: true,
          completadaEn: "2026-01-02T00:00:00.000Z",
          completadaPorId: "u1",
          orden: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        });
      }),
      http.get("/api/reparaciones", () => HttpResponse.json([])),
    );

    renderWithProviders(
      <SubtareasDialog reparacionId="rep1" numero="EDI-0001" trigger={<button>Ver subtareas</button>} />,
      { user: buildUser({ permisos: ["EDILICIA:ALTAS", "EDILICIA:MODIFICACION"] }) },
    );

    await user.click(screen.getByRole("button", { name: /ver subtareas/i }));
    await user.type(screen.getByLabelText(/nueva subtarea/i), "Pintar pared");
    await user.click(screen.getByRole("button", { name: /^agregar$/i }));

    await user.click(await screen.findByRole("button", { name: /^completar$/i }));

    await waitFor(() => expect(completarLlamado).toBe(true));
    expect(screen.queryByRole("button", { name: /^completar$/i })).not.toBeInTheDocument();
  });

  it("renderiza subtareas embebidas de GET /reparaciones (prop) sin depender de agregarlas por mutación", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SubtareasDialog
        reparacionId="rep1"
        numero="EDI-0001"
        trigger={<button>Ver subtareas</button>}
        subtareas={[
          {
            id: "s-existente",
            ticketEdiliciaId: "rep1",
            descripcion: "Revisar cañería",
            completada: false,
            completadaEn: null,
            completadaPorId: null,
            orden: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]}
      />,
      { user: buildUser({ permisos: [] }) },
    );

    await user.click(screen.getByRole("button", { name: /ver subtareas/i }));
    expect(await screen.findByText(/revisar cañería/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin subtareas todavía/i)).not.toBeInTheDocument();
  });
});
