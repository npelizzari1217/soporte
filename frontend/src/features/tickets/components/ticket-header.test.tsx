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
    solicitanteExternoId: null,
    solicitanteEsExterno: false,
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
  describe("solicitante externo (formulario publico)", () => {
    const externo = {
      solicitanteId: null,
      solicitanteExternoId: "ext-1",
      solicitanteEsExterno: true,
      solicitanteNombre: "Marta Externa",
      solicitanteApellido: null,
    };

    it("muestra el nombre del externo (no el guion) y el telefono cuando existe", () => {
      render(<TicketHeader tipoNombre="Incidente" ticket={buildTicket({ ...externo, solicitanteTelefono: "+54 11 5555-0000" })} />);
      expect(screen.getByText("Marta Externa")).toBeInTheDocument();
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      expect(screen.getByText("Teléfono")).toBeInTheDocument();
      expect(screen.getByText("+54 11 5555-0000")).toBeInTheDocument();
    });

    it("sin telefono (null) no renderiza la fila ni etiqueta vacia", () => {
      render(<TicketHeader ticket={buildTicket({ ...externo, solicitanteTelefono: null })} />);
      expect(screen.getByText("Marta Externa")).toBeInTheDocument();
      expect(screen.queryByText("Teléfono")).not.toBeInTheDocument();
    });

    it("sin el campo (listado) tampoco renderiza la fila de telefono", () => {
      render(<TicketHeader ticket={buildTicket(externo)} />);
      expect(screen.queryByText("Teléfono")).not.toBeInTheDocument();
    });

    it("un <script> en el titulo, el nombre y el telefono se muestra como texto, sin inyectar nodos", () => {
      const { container } = render(
        <TicketHeader
          ticket={buildTicket({
            ...externo,
            titulo: "<script>alert(1)</script>",
            solicitanteNombre: "<script>alert(2)</script>",
            solicitanteTelefono: "<script>alert(3)</script>",
          })}
        />,
      );
      expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
      expect(screen.getByText("<script>alert(2)</script>")).toBeInTheDocument();
      expect(screen.getByText("<script>alert(3)</script>")).toBeInTheDocument();
      expect(container.querySelector("script")).toBeNull();
    });
  });

  it("solicitante con nombre y sin apellido → muestra el nombre, no el ID crudo", () => {
    render(<TicketHeader ticket={buildTicket({ solicitanteNombre: "Juan Pérez", solicitanteApellido: "" })} />);
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.queryByText("u1")).not.toBeInTheDocument();
  });

  it("solicitante sin nombre ni apellido resueltos → cae al ID crudo", () => {
    render(<TicketHeader ticket={buildTicket({ solicitanteNombre: null, solicitanteApellido: null })} />);
    expect(screen.getByText("u1")).toBeInTheDocument();
  });

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

  // WU9.3 (gateo de UI, ADR-C5 backend): `puedeVerCsat` lo resuelve el
  // container con `useCan("CSAT:LECTURA")` — este componente NO decide el
  // permiso, solo obedece la bandera.
  describe("bloque de satisfacción (CSAT)", () => {
    it("con puedeVerCsat y csatPuntaje presente, muestra puntaje y comentario", () => {
      render(
        <TicketHeader
          ticket={buildTicket({ csatPuntaje: 4, csatComentario: "Buena atención" })}
          puedeVerCsat
        />,
      );

      expect(screen.getByText("Satisfacción: 4 / 5")).toBeInTheDocument();
      expect(screen.getByText("\u201CBuena atención\u201D")).toBeInTheDocument();
    });

    it("sin puedeVerCsat NO muestra el bloque, aunque el ticket traiga csatPuntaje", () => {
      render(
        <TicketHeader ticket={buildTicket({ csatPuntaje: 4, csatComentario: "Buena atención" })} />,
      );

      expect(screen.queryByText(/Satisfacción:/)).not.toBeInTheDocument();
    });

    it("con puedeVerCsat pero SIN csatPuntaje (ticket sin encuesta respondida) no muestra el bloque", () => {
      render(<TicketHeader ticket={buildTicket()} puedeVerCsat />);

      expect(screen.queryByText(/Satisfacción:/)).not.toBeInTheDocument();
    });
  });
});
