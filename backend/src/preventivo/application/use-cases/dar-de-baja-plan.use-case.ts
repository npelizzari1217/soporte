import { DomainError, Result } from '../../../shared/domain/result';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { PlanNoEncontradoError } from '../../domain/errors/preventivo.errors';

/** DTO de entrada para dar de baja un plan de mantenimiento preventivo. */
export interface DarDeBajaPlanDto {
  planId: string;
}

/**
 * DarDeBajaPlanUseCase — baja lógica de un plan de mantenimiento preventivo
 * [R4].
 *
 * NO es un DELETE físico: marca `activo=false` Y soft delete (`deletedAt`).
 * `IPlanPreventivoRepository.findVencibles` filtra por AMBOS
 * (`activo AND deleted_at IS NULL`), así que cualquiera de los dos alcanza
 * para frenar la generación futura — se setean los dos por defensa en
 * profundidad. Los tickets `MANTENIMIENTO` y filas `preventivo_generacion`
 * YA generados NO se tocan: este use case no los referencia en absoluto.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Baja de plan frena generación
 * sin borrar historial". Tarea: 4.2.
 */
export class DarDeBajaPlanUseCase {
  constructor(
    private readonly planRepo: Pick<IPlanPreventivoRepository, 'buscarPorId' | 'guardar'>,
  ) {}

  async execute(dto: DarDeBajaPlanDto): Promise<Result<void, DomainError>> {
    const plan = await this.planRepo.buscarPorId(dto.planId);
    if (!plan || plan.isDeleted()) {
      return Result.fail(new PlanNoEncontradoError(dto.planId));
    }

    const editarResult = plan.editar({ activo: false });
    if (editarResult.isFail()) {
      return Result.fail(editarResult.getError());
    }
    plan.softDelete();

    await this.planRepo.guardar(plan);
    return Result.ok(undefined);
  }
}
