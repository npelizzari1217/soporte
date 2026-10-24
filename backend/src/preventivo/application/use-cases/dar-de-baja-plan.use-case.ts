import { DomainError, Result } from '../../../shared/domain/result';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { cargarPlanVisible } from '../services/acceso-plan-preventivo';

/** DTO de entrada para dar de baja un plan de mantenimiento preventivo. */
export interface DarDeBajaPlanDto {
  planId: string;
  /** Permisos por tipo del actor: solo se da de baja un plan visible, de un tipo con `LECTURA`. */
  alcance: AlcanceActorTicket;
}

/**
 * DarDeBajaPlanUseCase — baja lógica de un plan de mantenimiento preventivo
 * [R4].
 *
 * NO es un DELETE físico: marca `activo=false` Y soft delete (`deletedAt`).
 * `IPlanPreventivoRepository.findVencibles` filtra por AMBOS
 * (`activo AND deleted_at IS NULL`), así que cualquiera de los dos alcanza
 * para frenar la generación futura — se setean los dos por defensa en
 * profundidad. Los tickets y filas `preventivo_generacion` YA generados NO
 * se tocan: este use case no los referencia en absoluto. Sin nombrar un
 * tipo a propósito — tras el issue #135 un plan viejo puede tener tickets
 * `MANTENIMIENTO` y `PREVENTIVO` conviviendo, y a ninguno se lo toca.
 *
 * Visibilidad por el tipo del plan (odd/preventivo-por-tipo, S4): sin `LECTURA` sobre él, 404.
 * `PREVENTIVO:BORRADO` lo exige el controller.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Baja de plan frena generación
 * sin borrar historial". Tarea: 4.2.
 */
export class DarDeBajaPlanUseCase {
  constructor(
    private readonly planRepo: Pick<IPlanPreventivoRepository, 'buscarPorId' | 'guardar'>,
  ) {}

  /**
   * @param dto Plan y alcance del actor.
   * @returns Ok, o el 404.
   */
  async execute(dto: DarDeBajaPlanDto): Promise<Result<void, DomainError>> {
    const cargado = await cargarPlanVisible(this.planRepo, dto.planId, dto.alcance);
    if (cargado.isFail()) {
      return Result.fail(cargado.getError());
    }
    const plan = cargado.getValue();

    const editarResult = plan.editar({ activo: false });
    if (editarResult.isFail()) {
      return Result.fail(editarResult.getError());
    }
    plan.softDelete();

    await this.planRepo.guardar(plan);
    return Result.ok(undefined);
  }
}
