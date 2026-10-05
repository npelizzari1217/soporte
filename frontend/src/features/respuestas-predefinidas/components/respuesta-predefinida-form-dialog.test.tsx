import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { RespuestaPredefinidaFormDialog } from "./respuesta-predefinida-form-dialog";
import type { RespuestaPredefinida } from "../types";

function buildRespuesta(overrides: Partial<RespuestaPredefinida> = {}): RespuestaPredefinida {
  return {
    id: "r1",
    titulo: "Saludo",
    texto: "Hola",
    activo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * El diálogo queda montado en la fila de la tabla: reabrirlo tiene que mostrar el dato VIGENTE
 * (la prop actualizada), y cancelar no debe filtrar lo que se tipeó. Mismo criterio que
 * `SectorFormDialog`.
 */
describe("RespuestaPredefinidaFormDialog", () => {
  it("reabrir tras un cambio de la prop muestra el valor vigente, no el del primer render", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <RespuestaPredefinidaFormDialog respuesta={buildRespuesta()} trigger={<button>Editar</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    rerender(
      <RespuestaPredefinidaFormDialog respuesta={buildRespuesta({ texto: "Hola, buen día" })} trigger={<button>Editar</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Texto")).toHaveValue("Hola, buen día");
  });

  it("cancelar sin guardar y reabrir muestra el dato del servidor, no lo descartado", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RespuestaPredefinidaFormDialog respuesta={buildRespuesta()} trigger={<button>Editar</button>} />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Título"));
    await user.type(screen.getByLabelText("Título"), "Borrador");
    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Título")).toHaveValue("Saludo");
  });

  it("editar manda el PATCH con título y texto vigentes", async () => {
    const user = userEvent.setup();
    let capturado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/respuestas-predefinidas/r1", async ({ request }) => {
        capturado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildRespuesta());
      }),
    );
    renderWithProviders(
      <RespuestaPredefinidaFormDialog respuesta={buildRespuesta()} trigger={<button>Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Texto"));
    await user.type(screen.getByLabelText("Texto"), "Nuevo texto");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado).toEqual({ titulo: "Saludo", texto: "Nuevo texto" }));
  });

  it("no envía con título o texto vacíos y muestra los mensajes", async () => {
    const user = userEvent.setup();
    let enviado = false;
    server.use(
      http.post("/api/respuestas-predefinidas", () => {
        enviado = true;
        return HttpResponse.json(buildRespuesta(), { status: 201 });
      }),
    );
    renderWithProviders(<RespuestaPredefinidaFormDialog trigger={<button>Nueva</button>} />);

    await user.click(screen.getByRole("button", { name: "Nueva" }));
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByText("El título es requerido")).toBeInTheDocument();
    expect(screen.getByText("El texto es requerido")).toBeInTheDocument();
    expect(enviado).toBe(false);
  });
});
