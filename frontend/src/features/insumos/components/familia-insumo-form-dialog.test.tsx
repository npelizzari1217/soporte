import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { FamiliaInsumoFormDialog } from "./familia-insumo-form-dialog";
import type { FamiliaInsumo } from "../types";

/**
 * FamiliaInsumoFormDialog — mismo mould que
 * `features/sectores/components/sector-form-dialog.test.tsx`: el diálogo
 * queda montado permanentemente en la fila de la tabla, así que reabrirlo
 * tiene que mostrar el dato VIGENTE (la prop `familia` actualizada), no el
 * snapshot de su primer render.
 */
function buildFamilia(overrides: Partial<FamiliaInsumo> = {}): FamiliaInsumo {
  return {
    id: "fam-1",
    codigo: "TONER",
    nombre: "Tóner",
    activo: true,
    esRepuesto: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("FamiliaInsumoFormDialog", () => {
  it("crear envía el POST con codigo y nombre tal como se tipearon", async () => {
    const user = userEvent.setup();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.post("/api/familias-insumo", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...buildFamilia(), ...enviado, id: "fam-2" }, { status: 201 });
      }),
    );

    renderWithProviders(<FamiliaInsumoFormDialog trigger={<button>Nueva familia</button>} />);
    await user.click(screen.getByRole("button", { name: "Nueva familia" }));
    await user.type(screen.getByLabelText("Código"), "CARTUCHO");
    await user.type(screen.getByLabelText("Nombre"), "Cartucho");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() =>
      expect(enviado).toEqual({ codigo: "CARTUCHO", nombre: "Cartucho", esRepuesto: false }),
    );
  });

  it("crear con el checkbox marcado envía esRepuesto: true", async () => {
    const user = userEvent.setup();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.post("/api/familias-insumo", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...buildFamilia(), ...enviado, id: "fam-3" }, { status: 201 });
      }),
    );

    renderWithProviders(<FamiliaInsumoFormDialog trigger={<button>Nueva familia</button>} />);
    await user.click(screen.getByRole("button", { name: "Nueva familia" }));
    await user.type(screen.getByLabelText("Código"), "CPU");
    await user.type(screen.getByLabelText("Nombre"), "CPU");
    await user.click(screen.getByRole("checkbox", { name: /es repuesto/i }));
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(enviado).toEqual({ codigo: "CPU", nombre: "CPU", esRepuesto: true }));
  });

  it("editar prefilla desde la fila y el PATCH lleva el formulario completo", async () => {
    const user = userEvent.setup();
    const familia = buildFamilia();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/familias-insumo/fam-1", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...familia, ...enviado });
      }),
    );

    renderWithProviders(<FamiliaInsumoFormDialog familia={familia} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Código")).toHaveValue("TONER");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Tóner");

    const nombreInput = screen.getByLabelText("Nombre");
    await user.clear(nombreInput);
    await user.type(nombreInput, "Tóner y cartucho");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(enviado).toEqual({ codigo: "TONER", nombre: "Tóner y cartucho", esRepuesto: false }),
    );
  });

  it("editar precarga el checkbox desde la fila y el PATCH lleva la marca desmarcada", async () => {
    const user = userEvent.setup();
    const familia = buildFamilia({ codigo: "CPU", nombre: "CPU", esRepuesto: true });
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/familias-insumo/fam-1", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...familia, ...enviado });
      }),
    );

    renderWithProviders(<FamiliaInsumoFormDialog familia={familia} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const checkbox = screen.getByRole("checkbox", { name: /es repuesto/i });
    expect(checkbox).toHaveAttribute("aria-checked", "true");

    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(enviado).toEqual({ codigo: "CPU", nombre: "CPU", esRepuesto: false }),
    );
  });

  it("reabrir tras un cambio de la prop `familia` muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const familiaV1 = buildFamilia();
    const familiaV2 = buildFamilia({ nombre: "Tóner actualizado" });

    const { rerender } = renderWithProviders(
      <FamiliaInsumoFormDialog familia={familiaV1} trigger={<button>Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(<FamiliaInsumoFormDialog familia={familiaV2} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Tóner actualizado");
  });

  it("valida contra el API un nombre por encima del tope (100) sin disparar la request", async () => {
    const user = userEvent.setup();
    let llamado = false;
    server.use(
      http.post("/api/familias-insumo", () => {
        llamado = true;
        return HttpResponse.json(buildFamilia(), { status: 201 });
      }),
    );

    renderWithProviders(<FamiliaInsumoFormDialog trigger={<button>Nueva familia</button>} />);
    await user.click(screen.getByRole("button", { name: "Nueva familia" }));
    await user.type(screen.getByLabelText("Código"), "TONER");
    await user.type(screen.getByLabelText("Nombre"), "N".repeat(101));
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no puede superar los 100 caracteres/i);
    expect(llamado).toBe(false);
  });

  it("valida un codigo que no cumple mayúsculas/números/guion bajo sin disparar la request", async () => {
    const user = userEvent.setup();
    let llamado = false;
    server.use(
      http.post("/api/familias-insumo", () => {
        llamado = true;
        return HttpResponse.json(buildFamilia(), { status: 201 });
      }),
    );

    renderWithProviders(<FamiliaInsumoFormDialog trigger={<button>Nueva familia</button>} />);
    await user.click(screen.getByRole("button", { name: "Nueva familia" }));
    await user.type(screen.getByLabelText("Código"), "toner-1");
    await user.type(screen.getByLabelText("Nombre"), "Tóner");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/mayúsculas\/números\/guion bajo/i);
    expect(llamado).toBe(false);
  });
});
