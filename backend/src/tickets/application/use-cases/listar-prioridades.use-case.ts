import { DomainError, Result } from '../../../shared/domain/result';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';

/**
 * ListarPrioridadesUseCase — lista el catálogo de prioridades ACTIVAS del
 * tenant. Cierra el gap G1 (sdd/beta-frontend/spec §3): desbloquea el form de
 * creación de ticket, la barra de filtros y la vista admin de catálogos.
 * Cualquier usuario autenticado del tenant puede listarlo — catálogo de solo
 * lectura.
 *
 * Ref spec: sdd/beta-frontend/spec §3 G1. Ref design: ADR-5.
 */
export class ListarPrioridadesUseCase {
  constructor(private readonly prioridadRepo: Pick<IPrioridadRepository, 'findAllActive'>) {}

  async execute(): Promise<Result<PrioridadEntity[], DomainError>> {
    const prioridades = await this.prioridadRepo.findAllActive();
    return Result.ok(prioridades);
  }
}
