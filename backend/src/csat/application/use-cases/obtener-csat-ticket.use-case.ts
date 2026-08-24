import { IEncuestaSatisfaccionRepository } from '../../domain/ports/i-encuesta-satisfaccion.repository';

const ROL_TECNICO = 'TECNICO';

/**
 * DTO de entrada de `ObtenerCsatTicketUseCase`. `asignadoId` es el
 * `asignadoId` ACTUAL del ticket (ya resuelto por el caller, que ya tiene la
 * `TicketEntity` en mano) — mismo límite conocido que `resumenPorScope`
 * (ADR-C8): no distingue el asignado histórico del actual.
 *
 * `tieneCsatLectura` lo calcula el controller con
 * `puedeEjecutar(user, 'CSAT:LECTURA')` (ADR-C5, gateo por payload).
 */
export interface ObtenerCsatTicketDto {
  ticketId: string;
  asignadoId: string | null;
  actorId: string;
  actorRol: string | null;
  tieneCsatLectura: boolean;
}

/** Puntaje + comentario de la última respuesta CSAT del ticket. */
export interface CsatDeTicket {
  puntaje: number;
  comentario: string | null;
}

/**
 * ObtenerCsatTicketUseCase — puntaje/comentario de la última respuesta CSAT
 * de un ticket para el detalle (WU9.2).
 *
 * `null` cuando: sin `CSAT:LECTURA`, TECNICO ajeno al ticket (asignadoId
 * distinto del actor — scope propio, spec "Permiso y visibilidad por rol"),
 * o el ticket no tiene ninguna respuesta registrada.
 * ADMINISTRADOR/COLABORADOR/ROOT ven cualquier ticket del tenant.
 *
 * Ref spec: sdd/csat/spec, Requirement "Puntaje y comentario en el detalle
 * del ticket". Ref design: ADR-C5, ADR-C8. Tarea: 9.2.
 */
export class ObtenerCsatTicketUseCase {
  constructor(
    private readonly encuestaRepo: Pick<IEncuestaSatisfaccionRepository, 'ultimaDeTicket'>,
  ) {}

  async execute(dto: ObtenerCsatTicketDto): Promise<CsatDeTicket | null> {
    if (!dto.tieneCsatLectura) {
      return null;
    }
    if (dto.actorRol === ROL_TECNICO && dto.asignadoId !== dto.actorId) {
      return null;
    }

    const respuesta = await this.encuestaRepo.ultimaDeTicket(dto.ticketId);
    return respuesta ? { puntaje: respuesta.puntaje, comentario: respuesta.comentario } : null;
  }
}
