import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketCreateView } from "./ticket-create-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function mockBackend() {
  server.use(
    http.get("/api/catalogos/tipos-ticket", () =>
      HttpResponse.json([{ id: "11111111-1111-1111-1111-111111111111", codigo: "SOPORTE", nombre: "Soporte", activo: true, createdAt: "", updatedAt: "" }]),
    ),
    http.get("/api/catalogos/prioridades", () =>
      HttpResponse.json([{ id: "22222222-2222-2222-2222-222222222222", codigo: "ALTA", nombre: "Alta", color: null, orden: 3, activo: true, createdAt: "", updatedAt: "" }]),
    ),
  );
}

/**
 * Edge case no obvio: `ticketReferenciaId` es opcional en el form (campo sin
 * elegir → string vacío de RHF). Si ese `""` viajara tal cual al backend,
 * `@IsUUID()` (`CreateTicketDto`) lo rechazaría con 422 — el mapeo a
 * `undefined` es la parte de lógica real de este container.
 */
describe("TicketCreateView", () => {
  beforeEach(() => {
    pushMock.mockClear();
    mockBackend();
  });

  it("crear sin referencia → POST /tickets NO incluye ticketReferenciaId (nunca envía \"\"), y navega al ticket creado", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/tickets", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "nuevo-ticket-id" }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TicketCreateView />, { user: buildUser({ permisos: ["ticket:crear"] }) });

    await user.type(screen.getByLabelText("Título"), "Impresora rota");
    await user.selectOptions(screen.getByLabelText("Tipo"), "11111111-1111-1111-1111-111111111111");
    await user.selectOptions(screen.getByLabelText("Prioridad"), "22222222-2222-2222-2222-222222222222");
    await user.click(screen.getByRole("button", { name: /crear ticket/i }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody).not.toHaveProperty("ticketReferenciaId");
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/tickets/nuevo-ticket-id"));
  });
});
