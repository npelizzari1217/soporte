import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketCommentForm } from "./ticket-comment-form";

/**
 * Gate real del CLIENTE (no solo servidor): `esInterno=true` sin
 * `ticket:observar` devuelve 403 del backend
 * (`TicketsController.comentar`). Si el form permitiera marcar "interno" sin
 * el permiso, el usuario vería un error confuso en vez de nunca poder
 * intentarlo — por eso el toggle debe estar condicionado en el cliente,
 * no solo protegido por el backend.
 */
describe("TicketCommentForm", () => {
  it("CON ticket:observar → muestra el toggle 'interno' y permite enviar esInterno=true", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<TicketCommentForm onSubmit={onSubmit} isSubmitting={false} />, {
      user: buildUser({ permisos: ["ticket:observar", "ticket:comentar"] }),
    });

    await user.type(screen.getByRole("textbox", { name: "Comentario" }), "nota interna");
    await user.click(screen.getByRole("checkbox", { name: /interno/i }));
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(onSubmit).toHaveBeenCalledWith({ texto: "nota interna", esInterno: true });
  });

  it("SIN ticket:observar → el toggle 'interno' NO existe (nunca puede enviarse esInterno=true por error)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<TicketCommentForm onSubmit={onSubmit} isSubmitting={false} />, {
      user: buildUser({ permisos: ["ticket:comentar"] }),
    });

    expect(screen.queryByRole("checkbox", { name: /interno/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Comentario" }), "comentario público");
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(onSubmit).toHaveBeenCalledWith({ texto: "comentario público", esInterno: false });
  });
});
