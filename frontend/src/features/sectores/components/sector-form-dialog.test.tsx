import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { SectorFormDialog } from "./sector-form-dialog";
import type { Sector } from "../types";

/**
 * SectorFormDialog — regresión de dialogos-reset-valores-vigentes: el
 * diálogo queda montado permanentemente en la fila de la tabla (nunca se
 * desmonta al cerrar), así que reabrirlo tiene que mostrar el dato VIGENTE
 * (la prop `sector` actualizada), no el snapshot que tenía en su primer
 * render.
 */
function buildSector(overrides: Partial<Sector> = {}): Sector {
  return {
    id: "s1",
    codigo: "COMP",
    nombre: "Sector Original",
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SectorFormDialog", () => {
  it("reabrir tras un cambio de la prop `sector` muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const sectorV1 = buildSector();
    const sectorV2 = buildSector({ nombre: "Sector Actualizado" });

    const { rerender } = renderWithProviders(
      <SectorFormDialog sector={sectorV1} trigger={<button>Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(<SectorFormDialog sector={sectorV2} trigger={<button>Editar</button>} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Sector Actualizado");
  });

  it("editar un solo campo tras la reapertura y guardar no pisa los demás con el snapshot del primer render", async () => {
    const user = userEvent.setup();
    const sectorV1 = buildSector();
    // El nombre ya se actualizó en un guardado anterior (fuera de este test) —
    // el diálogo sigue montado y recién ahora recibe la prop nueva.
    const sectorV2 = buildSector({ nombre: "Sector Actualizado" });
    let capturado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/sectores/s1", async ({ request }) => {
        capturado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...sectorV2, codigo: capturado.codigo });
      }),
    );

    const { rerender } = renderWithProviders(
      <SectorFormDialog sector={sectorV1} trigger={<button>Editar</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    rerender(<SectorFormDialog sector={sectorV2} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    // Solo se toca `codigo`; `nombre` NO se edita en esta apertura.
    const codigoInput = screen.getByLabelText("Código");
    await user.clear(codigoInput);
    await user.type(codigoInput, "CC");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.codigo).toBe("CC"));
    expect(capturado.nombre).toBe("Sector Actualizado");
  });

  it("cancelar sin guardar y reabrir muestra el dato del servidor, no lo descartado", async () => {
    const user = userEvent.setup();
    const sector = buildSector();

    renderWithProviders(<SectorFormDialog sector={sector} trigger={<button>Editar</button>} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const nombreInput = screen.getByLabelText("Nombre");
    await user.clear(nombreInput);
    await user.type(nombreInput, "Sector (borrador)");
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Sector Original");
  });
});
