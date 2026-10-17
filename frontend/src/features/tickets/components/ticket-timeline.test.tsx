import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TicketTimeline } from "./ticket-timeline";
import type { OperacionTicket } from "../types";

/**
 * El backend YA filtra operaciones internas para actores sin
 * `ticket:observar` (`TicketsController.timeline`) — el front no re-filtra.
 * Lo que SÍ es lógica de front no obvia: (1) mapear `tipoOperacionId` (UUID
 * opaco) → un label legible vía el catálogo, y (2) marcar visualmente las
 * operaciones internas que SÍ llegan (viewer autorizado) para que un
 * técnico no las confunda con una nota pública — un error real de UX si el
 * marcador se pierde.
 */
const TIPO_OPERACION_MAP = new Map<string, string>([
  ["op-cambio", "CAMBIO_ESTADO"],
  ["op-comentario", "COMENTARIO"],
  ["op-asignacion", "ASIGNACION"],
  ["op-adjunto", "ADJUNTO"],
  ["op-tarea-creada", "TAREA_CREADA"],
  ["op-tarea-asignada", "TAREA_ASIGNADA"],
  ["op-tarea-completada", "TAREA_COMPLETADA"],
  ["op-tarea-descompletada", "TAREA_DESCOMPLETADA"],
  ["op-tarea-eliminada", "TAREA_ELIMINADA"],
]);

function buildOperacion(overrides: Partial<OperacionTicket>): OperacionTicket {
  return {
    id: "op1",
    ticketId: "t1",
    tipoOperacionId: "op-comentario",
    descripcion: null,
    estadoAnteriorId: null,
    estadoNuevoId: null,
    autorId: "u1",
    esInterno: false,
    metadata: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("TicketTimeline", () => {
  // odd/detalle-ticket-legible (S2): lo más nuevo arriba, aunque el backend mande ascendente.
  it("muestra las operaciones de la más nueva a la más vieja", () => {
    render(
      <TicketTimeline
        operaciones={[
          buildOperacion({ id: "vieja", descripcion: "Primer comentario", createdAt: "2026-01-01T10:00:00.000Z" }),
          buildOperacion({ id: "media", descripcion: "Segundo comentario", createdAt: "2026-01-02T10:00:00.000Z" }),
          buildOperacion({ id: "nueva", descripcion: "Último comentario", createdAt: "2026-01-03T10:00:00.000Z" }),
        ]}
        tipoOperacionCodigoMap={TIPO_OPERACION_MAP}
      />,
    );

    const textos = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(textos[0]).toContain("Último comentario");
    expect(textos[1]).toContain("Segundo comentario");
    expect(textos[2]).toContain("Primer comentario");
  });

  it.each([
    ["op-cambio", /cambio de estado/i],
    ["op-comentario", /comentario/i],
    ["op-asignacion", /asignaci/i],
    ["op-adjunto", /adjunto/i],
  ])("tipoOperacionId=%s → resuelve el label vía el catálogo (%s)", (tipoOperacionId, expectedLabel) => {
    render(
      <TicketTimeline
        operaciones={[buildOperacion({ id: "x", tipoOperacionId })]}
        tipoOperacionCodigoMap={TIPO_OPERACION_MAP}
      />,
    );
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it("operación esInterno=true (viewer con ticket:observar) → se marca visualmente como interna", () => {
    render(
      <TicketTimeline
        operaciones={[buildOperacion({ id: "x", esInterno: true })]}
        tipoOperacionCodigoMap={TIPO_OPERACION_MAP}
      />,
    );
    expect(screen.getByText(/interno/i)).toBeInTheDocument();
  });

  it("operación pública (esInterno=false) → NO muestra el marcador de interno", () => {
    render(
      <TicketTimeline
        operaciones={[buildOperacion({ id: "x", esInterno: false })]}
        tipoOperacionCodigoMap={TIPO_OPERACION_MAP}
      />,
    );
    expect(screen.queryByText(/interno/i)).not.toBeInTheDocument();
  });

  // odd/tareas-con-tecnico (T6): los tipos de operación de tareas tienen etiqueta propia, no "Operación".
  it.each([
    ["op-tarea-creada", "Tarea agregada"],
    ["op-tarea-asignada", "Técnico de tarea"],
    ["op-tarea-completada", "Tarea completada"],
    ["op-tarea-descompletada", "Tarea descompletada"],
    ["op-tarea-eliminada", "Tarea eliminada"],
  ])("tipoOperacionId=%s → %s", (tipoOperacionId, etiqueta) => {
    render(
      <TicketTimeline
        operaciones={[buildOperacion({ id: "x", tipoOperacionId, descripcion: "Cambiar el disco" })]}
        tipoOperacionCodigoMap={TIPO_OPERACION_MAP}
      />,
    );
    expect(screen.getByText(etiqueta)).toBeInTheDocument();
    expect(screen.queryByText("Operación")).not.toBeInTheDocument();
  });
});
