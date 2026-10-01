import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { UnidadMedidaFormDialog } from "./unidad-medida-form-dialog";
import type { UnidadMedida } from "../types";

/**
 * UnidadMedidaFormDialog — mismo mould que
 * `familia-insumo-form-dialog.test.tsx` / `sector-form-dialog.test.tsx`.
 */
function buildUnidad(overrides: Partial<UnidadMedida> = {}): UnidadMedida {
  return {
    id: "um-1",
    codigo: "UN",
    nombre: "Unidad",
    activo: true,
    entera: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("UnidadMedidaFormDialog", () => {
  it("crear envía el POST con codigo y nombre tal como se tipearon", async () => {
    const user = userEvent.setup();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.post("/api/unidades-medida", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...buildUnidad(), ...enviado, id: "um-2" }, { status: 201 });
      }),
    );

    renderWithProviders(<UnidadMedidaFormDialog trigger={<button>Nueva unidad</button>} />);
    await user.click(screen.getByRole("button", { name: "Nueva unidad" }));
    await user.type(screen.getByLabelText("Código"), "LT");
    await user.type(screen.getByLabelText("Nombre"), "Litro");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(enviado).toEqual({ codigo: "LT", nombre: "Litro" }));
  });

  it("editar prefilla desde la fila y el PATCH lleva el formulario completo", async () => {
    const user = userEvent.setup();
    const unidad = buildUnidad();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/unidades-medida/um-1", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...unidad, ...enviado });
      }),
    );

    renderWithProviders(<UnidadMedidaFormDialog unidad={unidad} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Código")).toHaveValue("UN");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Unidad");

    const codigoInput = screen.getByLabelText("Código");
    await user.clear(codigoInput);
    await user.type(codigoInput, "UNI");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(enviado).toEqual({ codigo: "UNI", nombre: "Unidad" }));
  });

  it("reabrir tras un cambio de la prop `unidad` muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const unidadV1 = buildUnidad();
    const unidadV2 = buildUnidad({ nombre: "Unidad actualizada" });

    const { rerender } = renderWithProviders(
      <UnidadMedidaFormDialog unidad={unidadV1} trigger={<button>Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(<UnidadMedidaFormDialog unidad={unidadV2} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Unidad actualizada");
  });

  it("valida contra el API un nombre por encima del tope (50) sin disparar la request", async () => {
    const user = userEvent.setup();
    let llamado = false;
    server.use(
      http.post("/api/unidades-medida", () => {
        llamado = true;
        return HttpResponse.json(buildUnidad(), { status: 201 });
      }),
    );

    renderWithProviders(<UnidadMedidaFormDialog trigger={<button>Nueva unidad</button>} />);
    await user.click(screen.getByRole("button", { name: "Nueva unidad" }));
    await user.type(screen.getByLabelText("Código"), "UN");
    await user.type(screen.getByLabelText("Nombre"), "N".repeat(51));
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no puede superar los 50 caracteres/i);
    expect(llamado).toBe(false);
  });

  it("valida un codigo que no cumple mayúsculas/números/guion bajo sin disparar la request", async () => {
    const user = userEvent.setup();
    let llamado = false;
    server.use(
      http.post("/api/unidades-medida", () => {
        llamado = true;
        return HttpResponse.json(buildUnidad(), { status: 201 });
      }),
    );

    renderWithProviders(<UnidadMedidaFormDialog trigger={<button>Nueva unidad</button>} />);
    await user.click(screen.getByRole("button", { name: "Nueva unidad" }));
    await user.type(screen.getByLabelText("Código"), "un-1");
    await user.type(screen.getByLabelText("Nombre"), "Unidad");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/mayúsculas\/números\/guion bajo/i);
    expect(llamado).toBe(false);
  });
});
