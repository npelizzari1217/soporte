import { DomainError, Result } from '../../../shared/domain/result';
import { AgenteAsignable } from '../../../tickets/application/services/elegibilidad-asignado';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { ResponsablesPlanPreventivo } from '../services/responsables-plan-preventivo';
import { exigirLecturaSobreTipoDelPlan } from '../services/acceso-plan-preventivo';

/** DTO de entrada de `ListarResponsablesPlanUseCase`. */
export interface ListarResponsablesPlanDto {
  clienteId: string;
  /** Tipo de ticket elegido en el formulario del plan. */
  tipoId: string;
  /** Permisos por tipo del actor. */
  alcance: AlcanceActorTicket;
}

/**
 * ListarResponsablesPlanUseCase — opciones del selector "Responsable" del alta y la edición de un
 * plan preventivo: los técnicos que atienden los tickets del tipo elegido
 * (`ResponsablesPlanPreventivo`, odd/preventivo-por-tipo, S5). Solo lectura.
 *
 * El tipo tiene que ser uno que el actor ve (`LECTURA`), el mismo requisito que guardar un plan de
 * ese tipo; si no, `AccionSobreTipoDelPlanNoPermitidaError` (403), sin consultar a nadie. Las
 * celdas `PREVENTIVO:ALTAS` o `PREVENTIVO:MODIFICACION` las exige el controller.
 */
export class ListarResponsablesPlanUseCase {
  constructor(private readonly responsables: Pick<ResponsablesPlanPreventivo, 'listar'>) {}

  /**
   * @param dto Cliente activo, tipo elegido y alcance del actor.
   * @returns Los agentes elegibles, ordenados por apellido y nombre, o el 403.
   */
  async execute(dto: ListarResponsablesPlanDto): Promise<Result<AgenteAsignable[], DomainError>> {
    const permitido = exigirLecturaSobreTipoDelPlan(dto.alcance, dto.tipoId);
    if (permitido.isFail()) return Result.fail(permitido.getError());
    return Result.ok(await this.responsables.listar(dto.clienteId, dto.tipoId));
  }
}
