import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  IntervaloUnidad,
  PlanPreventivoEntity,
} from '../../domain/entities/plan-preventivo.entity';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';

/** DTO de entrada para crear un plan de mantenimiento preventivo (WU-4). */
export interface CrearPlanDto {
  titulo: string;
  instrucciones: string | null;
  /** Excluyente con `ubicacion` — la AUTORIDAD del XOR es la entidad (ADR-PV1). */
  equipoId: string | null;
  ubicacion: string | null;
  prioridadId: string;
  responsableId: string;
  intervaloValor: number;
  intervaloUnidad: IntervaloUnidad;
  fechaInicio: Date;
}

/**
 * CrearPlanUseCase — crea un plan de mantenimiento preventivo.
 *
 * `proximaEjecucionEn` nace igual a `fechaInicio` (el ciclo `k=0` de
 * `CalcularCicloService.fechaCiclo` es siempre el ancla misma) — el barrido
 * (WU-5) genera el primer ticket en esa fecha, sin depender de `now()`.
 *
 * Sin validación de objetivo excluyente EN ESTE use case: la AUTORIDAD es
 * `PlanPreventivoEntity.create()` (ADR-PV1) — duplicarla acá crearía dos
 * fuentes de verdad que pueden desincronizarse.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Objetivo excluyente del plan"
 * y "Recurrencia por tiempo, anclada a fecha inmutable". Ref design: ADR-PV1,
 * ADR-PV2. Tarea: 4.2.
 */
export class CrearPlanUseCase {
  constructor(
    private readonly planRepo: Pick<IPlanPreventivoRepository, 'guardar'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearPlanDto): Promise<Result<PlanPreventivoEntity, DomainError>> {
    const planResult = PlanPreventivoEntity.create({
      titulo: dto.titulo,
      instrucciones: dto.instrucciones,
      equipoId: dto.equipoId,
      ubicacion: dto.ubicacion,
      prioridadId: dto.prioridadId,
      responsableId: dto.responsableId,
      intervaloValor: dto.intervaloValor,
      intervaloUnidad: dto.intervaloUnidad,
      fechaInicio: dto.fechaInicio,
      proximaEjecucionEn: dto.fechaInicio,
      activo: true,
    });

    if (planResult.isFail()) {
      return Result.fail(planResult.getError());
    }

    const plan = planResult.getValue();
    await this.txRunner.run(async () => {
      await this.planRepo.guardar(plan);
    });

    return Result.ok(plan);
  }
}
