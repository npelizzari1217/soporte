import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { z } from "zod";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { PrioridadFormDialog } from "./prioridad-form-dialog";
import type { Prioridad } from "@/features/tickets/types";

/** Cuerpo JSON capturado en los handlers de msw, tipado por parseo y no por cast. */
const cuerpoJson = z.record(z.string(), z.unknown());

/**
 * PrioridadFormDialog — regresión de dialogos-reset-valores-vigentes: mismo
 * molde que `SectorFormDialog` (D1). El diálogo queda montado
 * permanentemente en la fila de la tabla, así que reabrirlo tiene que
 * mostrar el dato VIGENTE, no el snapshot del primer render. `orden` es el
 * campo con forma más delicada del grupo (`z.coerce.number()`).
 */
function buildPrioridad(overrides: Partial<Prioridad> = {}): Prioridad {
  return {
    id: "p1",
    codigo: "ALTA",
    nombre: "Prioridad Original",
    color: null,
    orden: 1,
    activo: true,
    slaHoras: null,
    slaActivo: true,
    slaPrimeraRespuestaHoras: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PrioridadFormDialog", () => {
  it("reabrir tras un cambio de la prop `prioridad` muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const prioridadV1 = buildPrioridad();
    const prioridadV2 = buildPrioridad({ nombre: "Prioridad Actualizada", orden: 2 });

    const { rerender } = renderWithProviders(
      <PrioridadFormDialog prioridad={prioridadV1} trigger={<button>Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(<PrioridadFormDialog prioridad={prioridadV2} trigger={<button>Editar</button>} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Prioridad Actualizada");
    expect(screen.getByLabelText(/^orden$/i)).toHaveValue(2);
  });

  it("editar un solo campo tras la reapertura y guardar no pisa los demás con el snapshot del primer render", async () => {
    const user = userEvent.setup();
    const prioridadV1 = buildPrioridad();
    const prioridadV2 = buildPrioridad({ orden: 2 });
    let capturado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/catalogos/prioridades/p1", async ({ request }) => {
        capturado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...prioridadV2, ...capturado });
      }),
    );

    const { rerender } = renderWithProviders(
      <PrioridadFormDialog prioridad={prioridadV1} trigger={<button>Editar</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    rerender(<PrioridadFormDialog prioridad={prioridadV2} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    // Solo se toca `nombre`; `orden` NO se edita en esta apertura.
    const nombreInput = screen.getByLabelText(/^nombre$/i);
    await user.clear(nombreInput);
    await user.type(nombreInput, "Prioridad Renombrada");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.nombre).toBe("Prioridad Renombrada"));
    expect(capturado.orden).toBe(2);
  });

  describe("Primera respuesta (h)", () => {
    async function abrirYGuardar(prioridad: Prioridad, tipear?: string) {
      const user = userEvent.setup();
      let capturado: Record<string, unknown> | null = null;
      server.use(
        http.patch("/api/catalogos/prioridades/p1", async ({ request }) => {
          capturado = cuerpoJson.parse(await request.json());
          return HttpResponse.json({ ...prioridad, ...capturado });
        }),
      );
      renderWithProviders(<PrioridadFormDialog prioridad={prioridad} trigger={<button>Editar</button>} />);
      await user.click(screen.getByRole("button", { name: "Editar" }));
      const campo = screen.getByLabelText(/primera respuesta \(h\)/i);
      if (tipear !== undefined) {
        await user.clear(campo);
        if (tipear) await user.type(campo, tipear);
      }
      await user.click(screen.getByRole("button", { name: /^guardar$/i }));
      return { campo, leer: () => capturado };
    }

    it("muestra la meta vigente de la prioridad", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <PrioridadFormDialog
          prioridad={buildPrioridad({ slaPrimeraRespuestaHoras: 4 })}
          trigger={<button>Editar</button>}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Editar" }));

      expect(screen.getByLabelText(/primera respuesta \(h\)/i)).toHaveValue(4);
    });

    it("un valor entero positivo se envía como número", async () => {
      const { leer } = await abrirYGuardar(buildPrioridad(), "4");

      await waitFor(() => expect(leer()?.slaPrimeraRespuestaHoras).toBe(4));
    });

    it("vacío se envía como null (sin meta)", async () => {
      const { leer } = await abrirYGuardar(buildPrioridad({ slaPrimeraRespuestaHoras: 4 }), "");

      await waitFor(() => expect(leer()).not.toBeNull());
      expect(leer()?.slaPrimeraRespuestaHoras).toBeNull();
    });

    it.each(["0", "-2"])("%s se rechaza en el formulario y no se envía", async (valor) => {
      const { leer } = await abrirYGuardar(buildPrioridad(), valor);

      expect(await screen.findByText(/mayor a 0/i)).toBeInTheDocument();
      expect(leer()).toBeNull();
    });
  });
});
