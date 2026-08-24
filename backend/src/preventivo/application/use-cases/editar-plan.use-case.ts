import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  IntervaloUnidad,
  PlanPreventivoEntity,
} from '../../domain/entities/plan-preventivo.entity';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { PlanNoEncontradoError } from '../../domain/errors/preventivo.errors';
import { CalcularCicloService } from '../../domain/services/calcular-ciclo.service';

/** DTO de entrada para editar un plan (PATCH semántico, `undefined` = no tocar). */
export interface EditarPlanDto {
  planId: string;
  titulo?: string;
  instrucciones?: string | null;
  equipoId?: string | null;
  ubicacion?: string | null;
  prioridadId?: string;
  responsableId?: string;
  intervaloValor?: number;
  intervaloUnidad?: IntervaloUnidad;
  activo?: boolean;
}

/**
 * EditarPlanUseCase — edita un plan de mantenimiento preventivo (PATCH
 * semántico).
 *
 * [R2] Cuando la cadencia cambia (`intervaloValor` y/o `intervaloUnidad`),
 * recalcula `proximaEjecucionEn` HACIA ADELANTE desde `hoy` — nunca hacia
 * atrás: ningún ciclo anterior a la edición se genera retroactivamente.
 * El puntero nuevo se persiste DIRECTO por el repositorio
 * (`actualizarProximaEjecucion`), fuera del alcance de la entidad — que
 * deliberadamente NO expone un setter de `proximaEjecucionEn` (WU-3).
 *
 * Reusa `CalcularCicloService.ciclosPendientes()` (dominio puro, WU-3) desde
 * `fechaInicio` (nunca desde `hoy`): su `proximaEjecucionEn` de salida ES la
 * próxima fecha de ciclo `> hoy`, tanto en el camino normal como en el
 * re-anclaje aritmético del TOPE — exactamente el puntero "hacia adelante"
 * que pide el requisito, sin duplicar esa aritmética acá.
 *
 * Sin validación de objetivo excluyente EN ESTE use case: la AUTORIDAD es
 * `PlanPreventivoEntity.editar()` (ADR-PV1).
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Recuperación de corrida
 * perdida sin ráfaga" (escenario "El pasado es inalcanzable al editar la
 * cadencia"). Ref design: ADR-PV1, ADR-PV2, ADR-PV3. Tarea: 4.2/4.3.
 */
export class EditarPlanUseCase {
  private readonly calcularCiclo = new CalcularCicloService();

  constructor(
    private readonly planRepo: Pick<
      IPlanPreventivoRepository,
      'buscarPorId' | 'guardar' | 'actualizarProximaEjecucion'
    >,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EditarPlanDto): Promise<Result<PlanPreventivoEntity, DomainError>> {
    const plan = await this.planRepo.buscarPorId(dto.planId);
    if (!plan || plan.isDeleted()) {
      return Result.fail(new PlanNoEncontradoError(dto.planId));
    }

    const cadenciaCambia =
      (dto.intervaloValor !== undefined && dto.intervaloValor !== plan.intervaloValor) ||
      (dto.intervaloUnidad !== undefined && dto.intervaloUnidad !== plan.intervaloUnidad);

    const editarResult = plan.editar({
      titulo: dto.titulo,
      instrucciones: dto.instrucciones,
      equipoId: dto.equipoId,
      ubicacion: dto.ubicacion,
      prioridadId: dto.prioridadId,
      responsableId: dto.responsableId,
      intervaloValor: dto.intervaloValor,
      intervaloUnidad: dto.intervaloUnidad,
      activo: dto.activo,
    });
    if (editarResult.isFail()) {
      return Result.fail(editarResult.getError());
    }

    await this.txRunner.run(async () => {
      await this.planRepo.guardar(plan);

      if (cadenciaCambia) {
        const hoy = new Date();
        const { proximaEjecucionEn } = this.calcularCiclo.ciclosPendientes(
          {
            fechaInicio: plan.fechaInicio,
            intervaloValor: plan.intervaloValor,
            intervaloUnidad: plan.intervaloUnidad,
            proximaEjecucionEn: plan.fechaInicio,
          },
          hoy,
        );
        await this.planRepo.actualizarProximaEjecucion(plan.id, proximaEjecucionEn);
      }
    });

    return Result.ok(plan);
  }
}
