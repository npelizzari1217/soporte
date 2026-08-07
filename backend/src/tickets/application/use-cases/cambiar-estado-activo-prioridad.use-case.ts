import { DomainError, Result } from '../../../shared/domain/result';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { PrioridadNoEncontradaError } from '../../domain/errors/tickets.errors';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';

/** DTO de entrada de `CambiarEstadoActivoPrioridadUseCase` (T2, PR11). */
export interface CambiarEstadoActivoPrioridadDto {
  id: string;
  /** `false` = dar de baja (soft delete). `true` = reactivar. */
  activo: boolean;
}

/**
 * CambiarEstadoActivoPrioridadUseCase — activa o desactiva una prioridad
 * (T2, PR11). Dar de baja NO rompe tickets existentes que la referencian.
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
 */
export class CambiarEstadoActivoPrioridadUseCase {
  constructor(private readonly prioridadRepo: Pick<IPrioridadRepository, 'findById' | 'save'>) {}

  async execute(
    dto: CambiarEstadoActivoPrioridadDto,
  ): Promise<Result<PrioridadEntity, DomainError>> {
    const prioridad = await this.prioridadRepo.findById(dto.id);
    if (!prioridad) {
      return Result.fail(new PrioridadNoEncontradaError(dto.id));
    }

    if (dto.activo) {
      prioridad.activar();
    } else {
      prioridad.desactivar();
    }

    await this.prioridadRepo.save(prioridad);

    return Result.ok(prioridad);
  }
}
