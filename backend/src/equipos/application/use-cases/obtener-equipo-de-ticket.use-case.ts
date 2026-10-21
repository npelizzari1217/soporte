import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import {
  AlcanceActorTicket,
  esTicketAccesiblePara,
} from '../../../tickets/application/services/visibilidad-ticket';

/**
 * DTO de entrada para resolver el equipo vinculado a un ticket de soporte. El alcance del actor
 * lo arma el controller desde el JWT (`alcanceTicketDesdeJwt`).
 */
export interface ObtenerEquipoDeTicketDto extends AlcanceActorTicket {
  ticketId: string;
}

/** Datos mínimos del equipo a mostrar en el detalle de un ticket de soporte. */
export interface EquipoDeTicket {
  id: string;
  nombre: string;
  numeroSerie: string | null;
}

/** Resultado de `ObtenerEquipoDeTicketUseCase`: `equipo: null` cuando no aplica. */
export interface EquipoDeTicketResultado {
  equipo: EquipoDeTicket | null;
}

/**
 * ObtenerEquipoDeTicketUseCase — resuelve el equipo informático vinculado a
 * un ticket de soporte (satélite `ticket_soporte.equipoId`), para mostrarlo
 * en el detalle del ticket en el frontend.
 *
 * `equipo: null` (sin error) en cualquiera de estos casos:
 * - el ticket no tiene satélite `ticket_soporte` (no es de tipo SOPORTE, o
 *   aún no se creó el satélite),
 * - el satélite existe pero `equipoId` es `null` (ticket sin equipo asociado,
 *   ej. problemas de red/accesos).
 *
 * No usa `Result.fail` para estos casos: son estados válidos del dominio, no
 * errores — el consumidor HTTP simplemente no muestra la tarjeta de equipo.
 *
 * Antes de mirar el satélite, el ticket base tiene que existir y ser accesible para el actor
 * (`esTicketAccesiblePara`: módulo del tipo y visibilidad de fila, odd/permisos-por-tipo-ticket
 * S0). Si no, `TicketNoEncontradoError` (404): el mismo criterio que el detalle del ticket, para
 * no revelar el equipo de un ticket que el actor no ve.
 */
export class ObtenerEquipoDeTicketUseCase {
  constructor(
    private readonly ticketSoporteRepo: Pick<ITicketSoporteRepository, 'findByTicketId'>,
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
  ) {}

  async execute(
    dto: ObtenerEquipoDeTicketDto,
  ): Promise<Result<EquipoDeTicketResultado, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (
      !ticket ||
      ticket.isDeleted() ||
      !(await esTicketAccesiblePara(
        { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
        ticket,
        dto,
      ))
    ) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const ticketSoporte = await this.ticketSoporteRepo.findByTicketId(dto.ticketId);
    if (!ticketSoporte || !ticketSoporte.equipoId) {
      return Result.ok({ equipo: null });
    }

    const equipo = await this.equipoRepo.findById(ticketSoporte.equipoId);
    if (!equipo) {
      return Result.ok({ equipo: null });
    }

    return Result.ok({
      equipo: { id: equipo.id, nombre: equipo.nombre, numeroSerie: equipo.numeroSerie },
    });
  }
}
