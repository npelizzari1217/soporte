import { DomainError, Result } from '../../../shared/domain/result';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TipoTicketDelSistemaError,
  TipoTicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { esTipoTicketDelSistema } from '../../domain/tipos-ticket.constants';

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
 * Los tipos FIJOS del sistema (`TIPOS_TICKET_DEL_SISTEMA`) no se dan de baja,
 * ni siquiera ROOT. Reactivarlos sí: así se recupera uno que ya estuviera
 * desactivado antes de esta regla (deuda-tecnica-2026-10-15, CA1).
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

    if (!dto.activo && esTipoTicketDelSistema(tipo.codigo)) {
      return Result.fail(new TipoTicketDelSistemaError(tipo.codigo));
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
