import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TicketHeader } from "./ticket-header";
import type { Ticket } from "../types";

/**
 * TicketHeader — regresión de render-fechas-frontend: `slaVenceAt` es
 * `@db.Timestamptz` (instante), no una fecha de calendario. Antes de este
 * cambio se formateaba con `Intl.DateTimeFormat("es-AR")` SIN opciones, que
 * le comía la hora — un vencimiento sin hora es inútil (¿vence a las 09:00 o
 * a las 23:00?). Ahora usa `formatearInstante`, que SIEMPRE muestra hora.
 */
function buildTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "t1",
    numero: "TCK-0001",
    titulo: "No prende el monitor",
    descripcion: null,
    tipoId: "tipo1",
    estadoId: "estado1",
    prioridadId: "prio1",
    cicloId: null,
    ticketReferenciaId: null,
    solicitanteId: "u1",
    asignadoId: null,
    solicitanteNombre: "Juan",
    solicitanteApellido: "Pérez",
    asignadoNombre: null,
    asignadoApellido: null,
    slaVenceAt: null,
    vencido: false,
    fechaCierre: null,
    createdAt: "2026-08-15T12:00:00.000Z",
    updatedAt: "2026-08-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("TicketHeader", () => {
  it("con slaVenceAt, muestra 'SLA vence' con FECHA Y HORA (regresión: antes se comía la hora)", () => {
    // 2026-08-20T23:30:00.000Z = 20:30 en America/Argentina/Buenos_Aires (UTC-3).
    render(<TicketHeader ticket={buildTicket({ slaVenceAt: "2026-08-20T23:30:00.000Z" })} />);

    expect(screen.getByText("SLA vence")).toBeInTheDocument();
    expect(screen.getByText("20/08/2026 20:30")).toBeInTheDocument();
  });

  it("sin slaVenceAt, muestra 'Creado' con la fecha y hora de createdAt", () => {
    // 2026-08-15T12:00:00.000Z = 09:00 en America/Argentina/Buenos_Aires (UTC-3).
    render(<TicketHeader ticket={buildTicket({ createdAt: "2026-08-15T12:00:00.000Z" })} />);

    expect(screen.getByText("Creado")).toBeInTheDocument();
    expect(screen.getByText("15/08/2026 09:00")).toBeInTheDocument();
  });
});
