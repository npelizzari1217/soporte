import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ConfigurarCsatDialog } from "./configurar-csat-dialog";
import type { Cliente } from "../types";

/**
 * ConfigurarCsatDialog — sdd/csat, WU10.2. La visibilidad del botón "sin
 * permiso no se ve" está cubierta a nivel de página en
 * `clientes-admin-view.test.tsx` (gate por `is_global_admin`, no por
 * `permisos` — `ClienteAcciones` completo, incluido este diálogo, solo se
 * monta ahí adentro).
 */
const CLIENTE_SIN_CSAT: Cliente = {
  id: "c1",
  nombre: "Cliente Uno",
  razonSocial: null,
  cuit: null,
  dbName: "cliente_uno",
  activo: true,
  csatHabilitado: false,
  slug: null,
  formularioPublicoHabilitado: false,
};

describe("ConfigurarCsatDialog", () => {
  it("con permiso (ROOT) se ve el botón y el checkbox arranca prellenado con el valor real", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfigurarCsatDialog cliente={CLIENTE_SIN_CSAT} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: /encuesta de satisfacción de cliente uno/i }));

    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("tildar el checkbox y guardar hace PATCH /clientes/:id/csat con habilitado=true", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    let capturedUrl = "";
    server.use(
      http.patch("/api/clientes/:id/csat", async ({ request, params }) => {
        capturedUrl = String(params.id);
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...CLIENTE_SIN_CSAT, csatHabilitado: true });
      }),
    );

    renderWithProviders(<ConfigurarCsatDialog cliente={CLIENTE_SIN_CSAT} />, {
      user: buildUser({ is_global_admin: true }),
    });

    await user.click(screen.getByRole("button", { name: /encuesta de satisfacción de cliente uno/i }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await screen.findByRole("button", { name: /encuesta de satisfacción de cliente uno/i });
    expect(capturedUrl).toBe("c1");
    expect(capturedBody).toEqual({ habilitado: true });
  });
});
