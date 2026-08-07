import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Regla no obvia: `ConfirmDialog` existe para que acciones destructivas/
 * sensibles (eliminar KB T3.6, publicar/despublicar T3.5) NUNCA disparen
 * `onConfirm` directo desde el trigger — siempre pasan por una confirmación
 * explícita. El edge case de alto valor es justamente que el click en el
 * trigger NO ejecuta la acción por sí solo.
 */
describe("ConfirmDialog", () => {
  it("click en el trigger NO ejecuta onConfirm — requiere confirmar en el diálogo", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button>Eliminar</button>}
        title="Eliminar artículo"
        description="Esta acción no se puede deshacer."
        confirmLabel="Confirmar eliminación"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText("Eliminar artículo")).toBeInTheDocument();
  });

  it("confirmar en el diálogo ejecuta onConfirm; cancelar no", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button>Eliminar</button>}
        title="Eliminar artículo"
        description="Esta acción no se puede deshacer."
        confirmLabel="Confirmar eliminación"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(await screen.findByRole("button", { name: "Confirmar eliminación" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});
