import { DomainError, Result } from '../../../shared/domain/result';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';

/**
 * ListarPlanesUseCase — lista los planes de mantenimiento preventivo del
 * tenant (activos e inactivos; el frontend distingue por `activo`, WU-7).
 *
 * Ref spec: sdd/preventivo/spec. Tarea: 4.2.
 */
export class ListarPlanesUseCase {
  constructor(private readonly planRepo: Pick<IPlanPreventivoRepository, 'listar'>) {}

  async execute(): Promise<Result<PlanPreventivoEntity[], DomainError>> {
    const planes = await this.planRepo.listar();
    return Result.ok(planes);
  }
}
