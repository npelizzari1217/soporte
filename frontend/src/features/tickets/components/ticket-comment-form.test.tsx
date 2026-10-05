import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketCommentForm } from "./ticket-comment-form";

/**
 * Gate real del CLIENTE (no solo servidor): `esInterno=true` sin
 * `TICKETS:OBSERVAR` devuelve 403 del backend
 * (`TicketsController.comentar`). Si el form permitiera marcar "interno" sin
 * el permiso, el usuario vería un error confuso en vez de nunca poder
 * intentarlo — por eso el toggle debe estar condicionado en el cliente,
 * no solo protegido por el backend.
 */
describe("TicketCommentForm", () => {
  it("CON TICKETS:OBSERVAR → muestra el toggle 'interno' y permite enviar esInterno=true", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<TicketCommentForm onSubmit={onSubmit} isSubmitting={false} />, {
      user: buildUser({ permisos: ["TICKETS:OBSERVAR", "TICKETS:COMENTAR"] }),
    });

    await user.type(screen.getByRole("textbox", { name: "Comentario" }), "nota interna");
    await user.click(screen.getByRole("checkbox", { name: /interno/i }));
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(onSubmit).toHaveBeenCalledWith({ texto: "nota interna", esInterno: true });
  });

  it("SIN TICKETS:OBSERVAR → el toggle 'interno' NO existe (nunca puede enviarse esInterno=true por error)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<TicketCommentForm onSubmit={onSubmit} isSubmitting={false} />, {
      user: buildUser({ permisos: ["TICKETS:COMENTAR"] }),
    });

    expect(screen.queryByRole("checkbox", { name: /interno/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Comentario" }), "comentario público");
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(onSubmit).toHaveBeenCalledWith({ texto: "comentario público", esInterno: false });
  });

  describe("selector 'Insertar respuesta'", () => {
    const respuesta = (id: string, titulo: string, texto: string, activo = true) => ({
      id,
      titulo,
      texto,
      activo,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const SALUDO = respuesta("r1", "Saludo", "Hola, gracias por escribirnos.");
    const CIERRE = respuesta("r2", "Cierre", "Quedamos atentos.");

    /** Mockea el backend honrando `?activas=true`, como el real. */
    function mockRespuestas(todas = [SALUDO, CIERRE, respuesta("r3", "Vieja", "No usar", false)]) {
      server.use(
        http.get("/api/respuestas-predefinidas", ({ request }) => {
          const soloActivas = new URL(request.url).searchParams.get("activas") === "true";
          return HttpResponse.json(soloActivas ? todas.filter((r) => r.activo) : todas);
        }),
      );
    }

    function renderForm(onSubmit = vi.fn()) {
      renderWithProviders(<TicketCommentForm onSubmit={onSubmit} isSubmitting={false} />, {
        user: buildUser({ permisos: ["TICKETS:COMENTAR"] }),
      });
      return onSubmit;
    }

    it("ofrece solo las respuestas activas", async () => {
      mockRespuestas();
      renderForm();

      const selector = await screen.findByRole("combobox", { name: /insertar respuesta/i });

      expect(within(selector).getByRole("option", { name: "Saludo" })).toBeInTheDocument();
      expect(within(selector).getByRole("option", { name: "Cierre" })).toBeInTheDocument();
      expect(within(selector).queryByRole("option", { name: "Vieja" })).not.toBeInTheDocument();
    });

    it("insertar en un textarea vacío lo llena con el texto, sin enviar", async () => {
      const user = userEvent.setup();
      mockRespuestas();
      const onSubmit = renderForm();

      await user.selectOptions(await screen.findByRole("combobox", { name: /insertar respuesta/i }), "r1");

      expect(screen.getByRole("textbox", { name: "Comentario" })).toHaveValue(SALUDO.texto);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("insertar con texto previo lo conserva y agrega la respuesta en una línea nueva", async () => {
      const user = userEvent.setup();
      mockRespuestas();
      renderForm();
      const selector = await screen.findByRole("combobox", { name: /insertar respuesta/i });

      await user.type(screen.getByRole("textbox", { name: "Comentario" }), "Revisé el equipo.");
      await user.selectOptions(selector, "r2");

      expect(screen.getByRole("textbox", { name: "Comentario" })).toHaveValue(`Revisé el equipo.\n${CIERRE.texto}`);
    });

    it("el texto insertado es editable y recién se envía con 'Enviar'", async () => {
      const user = userEvent.setup();
      mockRespuestas();
      const onSubmit = renderForm();

      await user.selectOptions(await screen.findByRole("combobox", { name: /insertar respuesta/i }), "r2");
      await user.type(screen.getByRole("textbox", { name: "Comentario" }), " Gracias.");
      expect(onSubmit).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: /enviar/i }));

      expect(onSubmit).toHaveBeenCalledWith({ texto: `${CIERRE.texto} Gracias.`, esInterno: false });
    });

    it("sin respuestas activas el selector no se renderiza", async () => {
      let pedidas = 0;
      mockRespuestas([respuesta("r3", "Vieja", "No usar", false)]);
      const contar = ({ request }: { request: Request }) => {
        if (request.url.includes("/api/respuestas-predefinidas")) pedidas += 1;
      };
      server.events.on("response:mocked", contar);
      renderForm();

      // Afirmar la ausencia recién después de que la consulta respondió.
      await waitFor(() => expect(pedidas).toBe(1));
      server.events.removeListener("response:mocked", contar);

      expect(screen.queryByRole("combobox", { name: /insertar respuesta/i })).not.toBeInTheDocument();
    });
  });
});
