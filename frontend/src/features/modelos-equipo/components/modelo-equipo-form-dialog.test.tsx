import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { ModeloEquipoFormDialog } from "./modelo-equipo-form-dialog";
import type { ModeloEquipo } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** ModeloEquipoFormDialog — mismo molde que `unidad-medida-form-dialog.test.tsx`. */
function buildModelo(overrides: Partial<ModeloEquipo> = {}): ModeloEquipo {
  return {
    id: "me-1",
    marca: "HP",
    modelo: "LaserJet Pro M404",
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ModeloEquipoFormDialog", () => {
  it("crear normaliza marca a mayúscula y preserva la capitalización de modelo", async () => {
    const user = userEvent.setup();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.post("/api/modelos-equipo", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...buildModelo(), ...enviado, id: "me-2" }, { status: 201 });
      }),
    );

    renderWithProviders(<ModeloEquipoFormDialog trigger={<button>Nuevo modelo de equipo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo modelo de equipo" }));
    await user.type(screen.getByLabelText("Marca"), "  hp  ");
    await user.type(screen.getByLabelText("Modelo"), "LaserJet Pro M404");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(enviado).toEqual({ marca: "HP", modelo: "LaserJet Pro M404" }));
  });

  it("editar prefilla desde la fila y el PATCH lleva el formulario completo", async () => {
    const user = userEvent.setup();
    const modelo = buildModelo();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/modelos-equipo/me-1", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...modelo, ...enviado });
      }),
    );

    renderWithProviders(<ModeloEquipoFormDialog modelo={modelo} trigger={<button>Editar</button>} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Marca")).toHaveValue("HP");
    expect(screen.getByLabelText("Modelo")).toHaveValue("LaserJet Pro M404");

    const modeloInput = screen.getByLabelText("Modelo");
    await user.clear(modeloInput);
    await user.type(modeloInput, "LaserJet Pro M405");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(enviado).toEqual({ marca: "HP", modelo: "LaserJet Pro M405" }));
  });

  /**
   * R3: el par duplicado se rechaza sin importar el estado del modelo
   * existente (activo o inactivo) — el backend lo devuelve igual como 422, así
   * que este test no distingue el caso, solo verifica que el formulario NO se
   * cierra y muestra el mensaje. Molde de
   * `movimiento-entrada-dialog.test.tsx` ("un 422 ... se muestra vía toast y
   * el diálogo NO se cierra").
   */
  it("alta duplicada devuelve 422 y el formulario no se cierra", async () => {
    const user = userEvent.setup();
    const MENSAJE_BACKEND = "Ya existe un modelo de equipo con esa marca y modelo.";
    server.use(
      http.post("/api/modelos-equipo", () => HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 })),
    );

    renderWithProviders(<ModeloEquipoFormDialog trigger={<button>Nuevo modelo de equipo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo modelo de equipo" }));
    await user.type(screen.getByLabelText("Marca"), "HP");
    await user.type(screen.getByLabelText("Modelo"), "LaserJet Pro M404");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAJE_BACKEND));
    expect(screen.getByLabelText("Marca")).toBeInTheDocument();
  });

  it("valida contra el tope de marca (100, sobre el valor normalizado) sin disparar la request", async () => {
    const user = userEvent.setup();
    let llamado = false;
    server.use(
      http.post("/api/modelos-equipo", () => {
        llamado = true;
        return HttpResponse.json(buildModelo(), { status: 201 });
      }),
    );

    renderWithProviders(<ModeloEquipoFormDialog trigger={<button>Nuevo modelo de equipo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo modelo de equipo" }));
    await user.type(screen.getByLabelText("Marca"), "a".repeat(101));
    await user.type(screen.getByLabelText("Modelo"), "LaserJet Pro M404");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no puede superar los 100 caracteres/i);
    expect(llamado).toBe(false);
  });
});
