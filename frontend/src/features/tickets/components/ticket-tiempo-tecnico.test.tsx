import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketTiempoTecnico } from "./ticket-tiempo-tecnico";
import type { TramoTecnico } from "../types";

const TICKET_ID = "t1";
const META_S = 4 * 3600;

function tramo(overrides: Partial<TramoTecnico>): TramoTecnico {
  return {
    id: "tr",
    tecnicoId: "u-ana",
    tecnicoNombre: "Ana",
    tecnicoApellido: "Paz",
    inicioAt: "2026-10-05T12:00:00.000Z",
    finAt: "2026-10-05T15:00:00.000Z",
    motivoFin: "RESUELTO",
    habilS: 7500,
    metaS: META_S,
    cumplido: true,
    ...overrides,
  };
}

const TRAMOS: TramoTecnico[] = [
  tramo({ id: "cumplido" }),
  tramo({ id: "no-cumplido", habilS: 18_000, cumplido: false }),
  tramo({
    id: "reasignado",
    tecnicoId: "u-beto",
    tecnicoNombre: "Beto",
    tecnicoApellido: "Sosa",
    motivoFin: "REASIGNADO",
    habilS: 3600,
    cumplido: null,
  }),
  tramo({ id: "sin-meta", tecnicoNombre: null, tecnicoApellido: null, metaS: null, cumplido: null }),
  tramo({
    id: "en-curso",
    inicioAt: "2026-10-06T12:00:00.000Z",
    finAt: null,
    motivoFin: null,
    habilS: null,
    metaS: null,
    cumplido: null,
  }),
];

function mockTramos(respuesta: () => Response) {
  server.use(http.get(`/api/tickets/${TICKET_ID}/tramos-tecnico`, respuesta));
}

function filas(): HTMLElement[] {
  const [, ...cuerpo] = within(screen.getByRole("table")).getAllByRole("row");
  return cuerpo;
}

describe("TicketTiempoTecnico", () => {
  it("muestra cada tramo con sus horas hábiles h:mm, la meta y el badge de su veredicto", async () => {
    mockTramos(() => HttpResponse.json(TRAMOS));
    renderWithProviders(<TicketTiempoTecnico ticketId={TICKET_ID} />, { user: buildUser() });

    expect(await screen.findByRole("heading", { name: "Tiempo del técnico" })).toBeInTheDocument();
    const [cumplido, noCumplido, reasignado, sinMeta, enCurso] = filas();

    expect(cumplido).toHaveTextContent("Ana Paz");
    expect(cumplido).toHaveTextContent("05/10/2026 09:00");
    expect(cumplido).toHaveTextContent("05/10/2026 12:00");
    expect(cumplido).toHaveTextContent("2:05");
    expect(cumplido).toHaveTextContent("4:00");
    expect(within(cumplido).getByText("Cumplido")).toBeInTheDocument();

    expect(noCumplido).toHaveTextContent("5:00");
    expect(within(noCumplido).getByText("No cumplido")).toBeInTheDocument();

    expect(reasignado).toHaveTextContent("Beto Sosa");
    expect(reasignado).toHaveTextContent("1:00");
    expect(within(reasignado).getByText("Sin veredicto")).toBeInTheDocument();
    expect(within(reasignado).getByText("Reasignado")).toBeInTheDocument();

    // Sin nombre en master: etiqueta neutra, nunca el id crudo.
    expect(sinMeta).toHaveTextContent("Usuario");
    expect(sinMeta).not.toHaveTextContent("u-ana");
    expect(within(sinMeta).getByText("Sin veredicto")).toBeInTheDocument();
    expect(within(sinMeta).getByText("Sin meta de SLA")).toBeInTheDocument();

    expect(within(enCurso).getByText("En curso")).toBeInTheDocument();
    expect(within(enCurso).queryByText("Sin veredicto")).not.toBeInTheDocument();
    expect(within(enCurso).getAllByText("—")).toHaveLength(3);
  });

  it("un tramo con veredicto no muestra motivo; uno sin veredicto no muestra Cumplido ni No cumplido", async () => {
    mockTramos(() => HttpResponse.json([TRAMOS[0], TRAMOS[2]]));
    renderWithProviders(<TicketTiempoTecnico ticketId={TICKET_ID} />, { user: buildUser() });

    await screen.findByRole("table");
    const [cumplido, reasignado] = filas();
    expect(cumplido).not.toHaveTextContent("Reasignado");
    expect(cumplido).not.toHaveTextContent("Sin veredicto");
    expect(within(reasignado).queryByText("Cumplido")).not.toBeInTheDocument();
    expect(within(reasignado).queryByText("No cumplido")).not.toBeInTheDocument();
  });

  it("sin tramos (ticket anterior a la medición) no monta la tarjeta", async () => {
    let pedido = false;
    mockTramos(() => {
      pedido = true;
      return HttpResponse.json([]);
    });
    renderWithProviders(<TicketTiempoTecnico ticketId={TICKET_ID} />, { user: buildUser() });

    await waitFor(() => expect(pedido).toBe(true));
    // Margen para que la query resuelva y el componente vuelva a renderizar con la lista vacía.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("heading", { name: "Tiempo del técnico" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("si la consulta falla, la tarjeta avisa en vez de desaparecer", async () => {
    mockTramos(() => HttpResponse.json({ message: "error" }, { status: 500 }));
    renderWithProviders(<TicketTiempoTecnico ticketId={TICKET_ID} />, { user: buildUser() });

    expect(await screen.findByText("No se pudo cargar el tiempo del técnico.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tiempo del técnico" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
