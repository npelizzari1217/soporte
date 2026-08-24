import { DomainError, Result } from '../../../shared/domain/result';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import {
  IPreventivoGeneracionRepository,
  PreventivoGeneracionProps,
} from '../../domain/ports/i-preventivo-generacion.repository';
import { PlanNoEncontradoError } from '../../domain/errors/preventivo.errors';

/** DTO de entrada para listar las generaciones (auditoría) de un plan. */
export interface ListarGeneracionesPlanDto {
  planId: string;
}

/**
 * ListarGeneracionesPlanUseCase — vista de auditoría de un plan: fecha
 * programada, resultado (`RESERVADO` nunca debería verse, `GENERADO`,
 * `SALTEADO_PENDIENTE`, `SALTEADO_ATRASO`) y ticket generado (WU-4/WU-7).
 *
 * Gateado por `PREVENTIVO:LECTURA` en el controller — misma acción que el
 * listado de planes.
 *
 * Ref spec: sdd/preventivo/spec. Tarea: 4.4.
 */
export class ListarGeneracionesPlanUseCase {
  constructor(
    private readonly planRepo: Pick<IPlanPreventivoRepository, 'buscarPorId'>,
    private readonly generacionRepo: Pick<IPreventivoGeneracionRepository, 'listarPorPlan'>,
  ) {}

  async execute(
    dto: ListarGeneracionesPlanDto,
  ): Promise<Result<PreventivoGeneracionProps[], DomainError>> {
    const plan = await this.planRepo.buscarPorId(dto.planId);
    if (!plan || plan.isDeleted()) {
      return Result.fail(new PlanNoEncontradoError(dto.planId));
    }

    const generaciones = await this.generacionRepo.listarPorPlan(dto.planId);
    return Result.ok(generaciones);
  }
}
