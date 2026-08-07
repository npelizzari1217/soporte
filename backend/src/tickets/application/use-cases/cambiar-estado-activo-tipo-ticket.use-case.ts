import { DomainError, Result } from '../../../shared/domain/result';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { TipoTicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';

/** DTO de entrada de `CambiarEstadoActivoTipoTicketUseCase` (T2, PR11). */
export interface CambiarEstadoActivoTipoTicketDto {
  id: string;
  /** `false` = dar de baja (soft delete). `true` = reactivar. */
  activo: boolean;
}

/**
 * CambiarEstadoActivoTipoTicketUseCase — activa o desactiva un tipo de
 * ticket (T2, PR11). Dar de baja NO rompe tickets existentes que lo
 * referencian — solo se oculta de nuevas altas (`findAllActive` filtra por
 * `deletedAt`, ver `PrismaTipoTicketRepository`).
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.1.
 */
export class CambiarEstadoActivoTipoTicketUseCase {
  constructor(private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById' | 'save'>) {}

  async execute(
    dto: CambiarEstadoActivoTipoTicketDto,
  ): Promise<Result<TipoTicketEntity, DomainError>> {
    const tipo = await this.tipoTicketRepo.findById(dto.id);
    if (!tipo) {
      return Result.fail(new TipoTicketNoEncontradoError(dto.id));
    }

    if (dto.activo) {
      tipo.activar();
    } else {
      tipo.desactivar();
    }

    await this.tipoTicketRepo.save(tipo);

    return Result.ok(tipo);
  }
}
