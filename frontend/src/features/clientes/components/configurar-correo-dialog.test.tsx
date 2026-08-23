import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ConfigurarCorreoDialog } from "./configurar-correo-dialog";
import type { Cliente, ClienteCorreo } from "../types";

/**
 * ConfigurarCorreoDialog — regresión de render-fechas-frontend:
 * `ClienteCorreo.verificadoAt` (`@db.Timestamptz`, instante) ahora se
 * renderiza con `formatearInstante` en vez de una copia local de
 * `Intl.DateTimeFormat`. Literal fijo, NO derivado del mismo `Intl` que usa
 * el componente (esa forma de comparar queda ciega a una regresión de zona
 * horaria).
 */
const CLIENTE: Cliente = {
  id: "c1",
  nombre: "Cliente Uno",
  razonSocial: null,
  cuit: null,
  dbName: "cliente_uno",
  activo: true,
  csatHabilitado: false,
};

function buildCorreo(overrides: Partial<ClienteCorreo> = {}): ClienteCorreo {
  return {
    configurado: true,
    host: "smtp.cliente-uno.com",
    port: 587,
    user: "notificaciones@cliente-uno.com",
    secure: true,
    from: "notificaciones@cliente-uno.com",
    verificadoAt: "2026-08-19T15:00:00.000Z",
    verificacionError: null,
    ...overrides,
  };
}

describe("ConfigurarCorreoDialog", () => {
  it("con correo verificado, muestra la fecha y hora de verificación (instante, horario argentino)", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/clientes/c1/correo", () => HttpResponse.json(buildCorreo())));

    renderWithProviders(<ConfigurarCorreoDialog cliente={CLIENTE} />, { user: buildUser({ is_global_admin: true }) });

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));

    // 2026-08-19T15:00:00.000Z = 12:00 en America/Argentina/Buenos_Aires (UTC-3).
    expect(await screen.findByText("Verificado el 19/08/2026 12:00")).toBeInTheDocument();
  });
});
