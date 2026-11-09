import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { OperacionAdminView } from "./operacion-admin-view";

const ROOT = buildUser({ is_global_admin: true });

function estado() {
  server.use(
    http.get("/api/operacion/saturacion", () => HttpResponse.json({ eventosRecientes: 3, ultimoAviso: null })),
  );
}

/** Pantalla de operación para ROOT (odd/saturacion-conexiones, S3). */
describe("OperacionAdminView", () => {
  it("muestra las saturaciones de los últimos 10 minutos y que no hubo avisos", async () => {
    estado();
    renderWithProviders(<OperacionAdminView />, { user: ROOT });

    expect(await screen.findByText("Saturaciones en los últimos 10 minutos: 3")).toBeInTheDocument();
    expect(screen.getByText("No hubo avisos de saturación desde el último reinicio del servicio.")).toBeInTheDocument();
  });

  it("el correo de prueba exitoso dice a quiénes salió y dónde buscarlo", async () => {
    estado();
    let pedidos = 0;
    server.use(
      http.post("/api/operacion/saturacion/correo-prueba", () => {
        pedidos += 1;
        return HttpResponse.json({ ok: true, destinatarios: ["ana@sesitec.net", "luis@sesitec.net"] });
      }),
    );
    const usuario = userEvent.setup();
    renderWithProviders(<OperacionAdminView />, { user: ROOT });

    await usuario.click(await screen.findByRole("button", { name: "Enviar correo de prueba" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se envió el correo de prueba a ana@sesitec.net, luis@sesitec.net. Revise la bandeja de entrada y la carpeta de correo no deseado.",
    );
    expect(pedidos).toBe(1);
  });

  it("si no salió, muestra el motivo que dio el servidor", async () => {
    estado();
    server.use(
      http.post("/api/operacion/saturacion/correo-prueba", () =>
        HttpResponse.json({
          ok: false,
          motivo: "El servidor de correo no aceptó la conexión: Credenciales rechazadas por el servidor.",
        }),
      ),
    );
    const usuario = userEvent.setup();
    renderWithProviders(<OperacionAdminView />, { user: ROOT });

    await usuario.click(await screen.findByRole("button", { name: "Enviar correo de prueba" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se envió el correo de prueba. El servidor de correo no aceptó la conexión: Credenciales rechazadas por el servidor.",
    );
  });
});
