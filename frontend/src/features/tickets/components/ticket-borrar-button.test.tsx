import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketBorrarButton } from "./ticket-borrar-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

/** Registra los DELETE que llegan al backend simulado y responde con `respuesta`. */
function simularBorrado(respuesta: () => Response) {
  const pedidos: string[] = [];
  server.use(
    http.delete("/api/tickets/:id", ({ params }) => {
      pedidos.push(String(params.id));
      return respuesta();
    }),
  );
  return pedidos;
}

function renderBoton() {
  return renderWithProviders(<TicketBorrarButton ticketId="t1" numero="SOP-2026-0001" />, {
    user: buildUser({ rol: "TECNICO" }),
  });
}

describe("TicketBorrarButton (odd/permisos-por-tipo-ticket, S8)", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("pide confirmación antes de borrar: cancelar no manda nada", async () => {
    const user = userEvent.setup();
    const pedidos = simularBorrado(() => new HttpResponse(null, { status: 204 }));
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Borrar" }));
    expect(await screen.findByRole("alertdialog", { name: "Borrar el ticket SOP-2026-0001" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(pedidos).toEqual([]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("al confirmar manda DELETE /tickets/:id, avisa y vuelve al listado", async () => {
    const user = userEvent.setup();
    const pedidos = simularBorrado(() => new HttpResponse(null, { status: 204 }));
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Borrar" }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(
      screen.getAllByRole("button", { name: "Borrar" }).find((b) => dialogo.contains(b)) as HTMLElement,
    );

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/tickets"));
    expect(pedidos).toEqual(["t1"]);
    expect(toast.success).toHaveBeenCalledWith("Ticket borrado.");
  });

  it("un 422 muestra el mensaje del backend, que dice qué resolver, y no navega", async () => {
    const user = userEvent.setup();
    const mensaje = "No se puede borrar el ticket: antes hay que completar o eliminar su tarea pendiente.";
    simularBorrado(() => HttpResponse.json({ statusCode: 422, message: mensaje }, { status: 422 }));
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Borrar" }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(
      screen.getAllByRole("button", { name: "Borrar" }).find((b) => dialogo.contains(b)) as HTMLElement,
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
