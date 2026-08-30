import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { CicloVigenteFormDialog } from "./ciclo-vigente-form-dialog";
import type { CicloVigenteAdmin } from "../types";

/**
 * CicloVigenteFormDialog — regresión de dialogos-reset-valores-vigentes:
 * mismo molde que `SectorFormDialog` (D1). El diálogo queda montado
 * permanentemente en la fila de la tabla, así que reabrirlo tiene que
 * mostrar el dato VIGENTE, no el snapshot del primer render.
 */
function buildCiclo(overrides: Partial<CicloVigenteAdmin> = {}): CicloVigenteAdmin {
  return {
    id: "cv1",
    nombre: "Ciclo Original",
    fechaInicio: "2026-01-01",
    fechaFin: "2026-12-31",
    activo: true,
    eliminado: false,
    ...overrides,
  };
}

describe("CicloVigenteFormDialog", () => {
  it("reabrir tras un cambio de la prop `ciclo` muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const cicloV1 = buildCiclo();
    const cicloV2 = buildCiclo({ nombre: "Ciclo Actualizado" });

    const { rerender } = renderWithProviders(
      <CicloVigenteFormDialog ciclo={cicloV1} trigger={<button>Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(<CicloVigenteFormDialog ciclo={cicloV2} trigger={<button>Editar</button>} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Ciclo Actualizado");
  });

  it("editar un solo campo tras la reapertura y guardar no pisa los demás con el snapshot del primer render", async () => {
    const user = userEvent.setup();
    const cicloV1 = buildCiclo();
    const cicloV2 = buildCiclo({ fechaFin: "2027-06-30" });
    let capturado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/ciclos-vigentes/cv1", async ({ request }) => {
        capturado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...cicloV2, ...capturado });
      }),
    );

    const { rerender } = renderWithProviders(
      <CicloVigenteFormDialog ciclo={cicloV1} trigger={<button>Editar</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    rerender(<CicloVigenteFormDialog ciclo={cicloV2} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    // Solo se toca `nombre`; `fechaFin` NO se edita en esta apertura.
    const nombreInput = screen.getByLabelText(/^nombre$/i);
    await user.clear(nombreInput);
    await user.type(nombreInput, "Ciclo Renombrado");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.nombre).toBe("Ciclo Renombrado"));
    expect(capturado.fechaFin).toBe("2027-06-30");
  });
});
