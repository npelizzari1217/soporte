import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { EncuestaView } from "./encuesta-view";

/**
 * EncuestaView — estados de la página pública de la encuesta (WU8, tarea
 * 8.2). Sin sesión: `renderWithProviders` usa `user: null` por default.
 *
 * El backend responde el MISMO 404 genérico para token inexistente, vencido,
 * usado o revocado (spec, anti-enumeración) — por eso NO hay un segundo GET
 * que distinga "ya respondida" de "link inválido": el estado "ya respondida"
 * se alcanza SOLO tras un POST exitoso en la misma visita.
 */
describe("EncuestaView", () => {
  it("link inválido (404 del backend) muestra el estado correspondiente sin exponer el motivo real", async () => {
    server.use(
      http.get("/api/publico/encuesta/tok-malo", () =>
        HttpResponse.json({ statusCode: 404, message: "El link de la encuesta no es válido." }, { status: 404 }),
      ),
    );
    renderWithProviders(<EncuestaView token="tok-malo" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no es válido/i);
  });

  it("token válido: muestra el número de ticket y permite calificar y enviar", async () => {
    const user = userEvent.setup();
    let cuerpoEnviado: unknown = null;
    server.use(
      http.get("/api/publico/encuesta/tok-bueno", () => HttpResponse.json({ numero: "TCK-000123" })),
      http.post("/api/publico/encuesta/tok-bueno", async ({ request }) => {
        cuerpoEnviado = await request.json();
        return HttpResponse.json({ numero: "TCK-000123" });
      }),
    );
    renderWithProviders(<EncuestaView token="tok-bueno" />);

    expect(await screen.findByText(/TCK-000123/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "5 de 5 estrellas" }));
    await user.click(screen.getByRole("button", { name: /enviar respuesta/i }));

    await waitFor(() => expect(cuerpoEnviado).toEqual({ puntaje: 5 }));
    expect(await screen.findByText(/gracias/i)).toBeInTheDocument();
  });
});
