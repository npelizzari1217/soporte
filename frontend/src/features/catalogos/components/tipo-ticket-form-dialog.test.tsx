import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { TipoTicketFormDialog } from "./tipo-ticket-form-dialog";
import type { TipoTicket } from "@/features/tickets/types";

/**
 * TipoTicketFormDialog — regresión de dialogos-reset-valores-vigentes: mismo
 * molde que `SectorFormDialog` (D1), más la particularidad D1b: es el único
 * de los cuatro con `<Select>` de valor no controlado y con `modulo`
 * ausente en la rama de alta.
 */
function buildTipo(overrides: Partial<TipoTicket> = {}): TipoTicket {
  return {
    id: "t1",
    codigo: "INC",
    nombre: "Tipo Original",
    modulo: "TICKETS",
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TipoTicketFormDialog", () => {
  it("reabrir tras un cambio de la prop `tipo` muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const tipoV1 = buildTipo();
    const tipoV2 = buildTipo({ nombre: "Tipo Actualizado" });

    const { rerender } = renderWithProviders(<TipoTicketFormDialog tipo={tipoV1} trigger={<button>Editar</button>} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(<TipoTicketFormDialog tipo={tipoV2} trigger={<button>Editar</button>} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Tipo Actualizado");
  });

  it("editar un solo campo tras la reapertura y guardar no pisa los demás con el snapshot del primer render", async () => {
    const user = userEvent.setup();
    const tipoV1 = buildTipo();
    const tipoV2 = buildTipo({ modulo: "COMPRAS" });
    let capturado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/catalogos/tipos-ticket/t1", async ({ request }) => {
        capturado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...tipoV2, ...capturado });
      }),
    );

    const { rerender } = renderWithProviders(<TipoTicketFormDialog tipo={tipoV1} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    rerender(<TipoTicketFormDialog tipo={tipoV2} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    // Solo se toca `nombre`; `modulo` NO se edita en esta apertura.
    const nombreInput = screen.getByLabelText(/^nombre$/i);
    await user.clear(nombreInput);
    await user.type(nombreInput, "Tipo Renombrado");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.nombre).toBe("Tipo Renombrado"));
    expect(capturado.modulo).toBe("COMPRAS");
  });

  it("de alta, elegir un módulo y cerrar sin guardar no lo conserva al reabrir (D1b)", async () => {
    const user = userEvent.setup();

    renderWithProviders(<TipoTicketFormDialog trigger={<button>Nuevo</button>} />);

    await user.click(screen.getByRole("button", { name: "Nuevo" }));
    await user.selectOptions(screen.getByLabelText(/^módulo$/i), "COMPRAS");
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    await user.click(screen.getByRole("button", { name: "Nuevo" }));

    expect(screen.getByLabelText(/^módulo$/i)).toHaveValue("");
  });
});
