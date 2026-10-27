import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { AsistenteFlotante } from "./asistente-flotante";
import type { RespuestaAsistente } from "../types";

const CON_LECTURA = buildUser({ permisos: ["KB:LECTURA"] });

async function abrirYPreguntar(consulta: string) {
  const user = userEvent.setup();
  renderWithProviders(<AsistenteFlotante />, { user: CON_LECTURA });
  await user.click(screen.getByRole("button", { name: /abrir el asistente/i }));
  await user.type(screen.getByLabelText(/su consulta/i), consulta);
  await user.click(screen.getByRole("button", { name: /enviar consulta/i }));
  return user;
}

describe("AsistenteFlotante", () => {
  it("no se muestra sin KB:LECTURA", () => {
    renderWithProviders(<AsistenteFlotante />, { user: buildUser({ permisos: [] }) });
    expect(screen.queryByRole("button", { name: /asistente/i })).not.toBeInTheDocument();
  });

  it("muestra la respuesta de la IA con un enlace a cada artículo citado", async () => {
    let body: unknown = null;
    server.use(
      http.post("/api/asistente/consultas", async ({ request }) => {
        body = await request.json();
        const r: RespuestaAsistente = {
          respuesta: "Vaya a Tickets y presione Nuevo.",
          modo: "ia",
          fuentes: [
            { articuloId: "a1", titulo: "El listado de tickets" },
            { articuloId: "a2", titulo: "Estados y asignación" },
          ],
        };
        return HttpResponse.json(r);
      }),
    );
    await abrirYPreguntar("  ¿Cómo creo un ticket?  ");

    expect(await screen.findByText("Vaya a Tickets y presione Nuevo.")).toBeInTheDocument();
    expect(body).toEqual({ consulta: "¿Cómo creo un ticket?" });
    expect(screen.getByText("¿Cómo creo un ticket?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "El listado de tickets" })).toHaveAttribute("href", "/kb/a1");
    expect(screen.getByRole("link", { name: "Estados y asignación" })).toHaveAttribute("href", "/kb/a2");
    expect(screen.queryByText("Texto tomado de la Ayuda:")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/su consulta/i)).toHaveValue("");
  });

  it("una respuesta de respaldo avisa que el texto viene de la Ayuda", async () => {
    server.use(
      http.post("/api/asistente/consultas", () =>
        HttpResponse.json({
          respuesta: "Desde Tickets > Nuevo, complete el asunto.",
          modo: "respaldo",
          fuentes: [{ articuloId: "a1", titulo: "El listado de tickets" }],
        } satisfies RespuestaAsistente),
      ),
    );
    await abrirYPreguntar("crear ticket");

    expect(await screen.findByText("Texto tomado de la Ayuda:")).toBeInTheDocument();
    expect(screen.getByText("Desde Tickets > Nuevo, complete el asunto.")).toBeInTheDocument();
  });

  it("sin resultados, ofrece ir a Tickets para crear uno", async () => {
    server.use(
      http.post("/api/asistente/consultas", () =>
        HttpResponse.json({
          respuesta: "No encontré información sobre eso en la Ayuda.",
          modo: "sin_resultados",
          fuentes: [],
        } satisfies RespuestaAsistente),
      ),
    );
    await abrirYPreguntar("facturación AFIP");

    expect(await screen.findByRole("link", { name: "Ir a Tickets para crear uno" })).toHaveAttribute(
      "href",
      "/tickets",
    );
  });

  it("al superar el cupo (429) muestra el aviso en español dentro de la conversación", async () => {
    server.use(
      http.post("/api/asistente/consultas", () =>
        HttpResponse.json({ statusCode: 429, message: "ThrottlerException: Too Many Requests" }, { status: 429 }),
      ),
    );
    await abrirYPreguntar("crear ticket");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Alcanzó el límite de consultas. Espere un minuto e intente de nuevo.",
    );
    expect(screen.queryByText(/too many requests/i)).not.toBeInTheDocument();
  });

  it("un error del servidor no deja la conversación colgada", async () => {
    server.use(http.post("/api/asistente/consultas", () => new HttpResponse(null, { status: 500 })));
    await abrirYPreguntar("crear ticket");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo obtener una respuesta. Intente de nuevo en unos minutos.",
    );
    expect(screen.queryByText("Buscando en la Ayuda…")).not.toBeInTheDocument();
  });

  it("Enter envía y una consulta vacía o de más de 600 caracteres no se envía", async () => {
    let llamadas = 0;
    server.use(
      http.post("/api/asistente/consultas", () => {
        llamadas += 1;
        return HttpResponse.json({ respuesta: "Ok.", modo: "ia", fuentes: [] } satisfies RespuestaAsistente);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AsistenteFlotante />, { user: CON_LECTURA });
    await user.click(screen.getByRole("button", { name: /abrir el asistente/i }));
    const caja = screen.getByLabelText(/su consulta/i);
    const enviar = screen.getByRole("button", { name: /enviar consulta/i });

    await user.type(caja, "   ");
    expect(enviar).toBeDisabled();

    await user.clear(caja);
    await user.click(caja);
    await user.paste("a".repeat(601));
    expect(enviar).toBeDisabled();
    expect(screen.getByText("601/600")).toBeInTheDocument();

    await user.clear(caja);
    await user.type(caja, "crear ticket{Enter}");
    expect(await screen.findByText("Ok.")).toBeInTheDocument();
    await waitFor(() => expect(llamadas).toBe(1));
  });
});
