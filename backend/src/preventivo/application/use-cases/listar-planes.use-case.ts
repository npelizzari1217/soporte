import { DomainError, Result } from '../../../shared/domain/result';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { tiposDePlanesVisibles } from '../services/acceso-plan-preventivo';

/** DTO de entrada de `ListarPlanesUseCase`. */
export interface ListarPlanesDto {
  /** Permisos por tipo del actor: el listado trae solo los tipos con `LECTURA`. */
  alcance: AlcanceActorTicket;
}

/**
 * ListarPlanesUseCase — lista los planes de mantenimiento preventivo del
 * tenant (activos e inactivos; el frontend distingue por `activo`, WU-7), de
 * los tipos de ticket que el actor ve (odd/preventivo-por-tipo, S1, S4). Sin
 * ningún tipo con `LECTURA` la lista es vacía sin consultar la base.
 * `PREVENTIVO:LECTURA` lo exige el controller.
 *
 * Ref spec: sdd/preventivo/spec. Tarea: 4.2.
 */
export class ListarPlanesUseCase {
  constructor(private readonly planRepo: Pick<IPlanPreventivoRepository, 'listar'>) {}

  /**
   * @param dto Alcance del actor.
   * @returns Los planes vigentes de los tipos que el actor ve.
   */
  async execute(dto: ListarPlanesDto): Promise<Result<PlanPreventivoEntity[], DomainError>> {
    const tipoIds = tiposDePlanesVisibles(dto.alcance);
    if (tipoIds !== null && tipoIds.length === 0) return Result.ok([]);
    const planes = await this.planRepo.listar(tipoIds);
    return Result.ok(planes);
  }
}
