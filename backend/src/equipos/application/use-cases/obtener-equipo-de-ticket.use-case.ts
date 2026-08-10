import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';

/** DTO de entrada para resolver el equipo vinculado a un ticket de soporte. */
export interface ObtenerEquipoDeTicketDto {
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
 */
export class ObtenerEquipoDeTicketUseCase {
  constructor(
    private readonly ticketSoporteRepo: Pick<ITicketSoporteRepository, 'findByTicketId'>,
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
  ) {}

  async execute(
    dto: ObtenerEquipoDeTicketDto,
  ): Promise<Result<EquipoDeTicketResultado, DomainError>> {
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
