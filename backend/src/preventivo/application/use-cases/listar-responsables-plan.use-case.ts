import { DomainError, Result } from '../../../shared/domain/result';
import { AgenteAsignable } from '../../../tickets/application/services/elegibilidad-asignado';
import { ResponsablesPlanPreventivo } from '../services/responsables-plan-preventivo';

/** DTO de entrada de `ListarResponsablesPlanUseCase`. */
export interface ListarResponsablesPlanDto {
  clienteId: string;
}

/**
 * ListarResponsablesPlanUseCase — opciones del selector "Responsable" del alta y la edición de un
 * plan preventivo: los técnicos que atienden los tickets de tipo `PREVENTIVO`
 * (`ResponsablesPlanPreventivo`). Solo lectura.
 */
export class ListarResponsablesPlanUseCase {
  constructor(private readonly responsables: Pick<ResponsablesPlanPreventivo, 'listar'>) {}

  /**
   * @param dto Cliente activo.
   * @returns Los agentes elegibles, ordenados por apellido y nombre.
   */
  async execute(dto: ListarResponsablesPlanDto): Promise<Result<AgenteAsignable[], DomainError>> {
    return Result.ok(await this.responsables.listar(dto.clienteId));
  }
}
