import { DomainError, Result } from '../../../shared/domain/result';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import {
  IPreventivoGeneracionRepository,
  PreventivoGeneracionProps,
} from '../../domain/ports/i-preventivo-generacion.repository';
import { cargarPlanVisible } from '../services/acceso-plan-preventivo';

/** DTO de entrada para listar las generaciones (auditoría) de un plan. */
export interface ListarGeneracionesPlanDto {
  planId: string;
  /** Permisos por tipo del actor: ver las generaciones es ver el plan. */
  alcance: AlcanceActorTicket;
}

/**
 * ListarGeneracionesPlanUseCase — vista de auditoría de un plan: fecha
 * programada, resultado (`RESERVADO` nunca debería verse, `GENERADO`,
 * `SALTEADO_PENDIENTE`, `SALTEADO_ATRASO`) y ticket generado (WU-4/WU-7).
 *
 * Gateado por `PREVENTIVO:LECTURA` en el controller — misma acción que el
 * listado de planes — y por la visibilidad del plan (odd/preventivo-por-tipo,
 * S4): `LECTURA` sobre su tipo, como en el listado. Sin ella, 404.
 *
 * Ref spec: sdd/preventivo/spec. Tarea: 4.4.
 */
export class ListarGeneracionesPlanUseCase {
  constructor(
    private readonly planRepo: Pick<IPlanPreventivoRepository, 'buscarPorId'>,
    private readonly generacionRepo: Pick<IPreventivoGeneracionRepository, 'listarPorPlan'>,
  ) {}

  /**
   * @param dto Plan y alcance del actor.
   * @returns Las generaciones del plan, o el 404.
   */
  async execute(
    dto: ListarGeneracionesPlanDto,
  ): Promise<Result<PreventivoGeneracionProps[], DomainError>> {
    const cargado = await cargarPlanVisible(this.planRepo, dto.planId, dto.alcance);
    if (cargado.isFail()) {
      return Result.fail(cargado.getError());
    }

    const generaciones = await this.generacionRepo.listarPorPlan(dto.planId);
    return Result.ok(generaciones);
  }
}
