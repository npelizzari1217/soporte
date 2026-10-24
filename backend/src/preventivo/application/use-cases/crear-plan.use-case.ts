import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  IntervaloUnidad,
  PlanPreventivoEntity,
} from '../../domain/entities/plan-preventivo.entity';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { ResponsablesPlanPreventivo } from '../services/responsables-plan-preventivo';

/** DTO de entrada para crear un plan de mantenimiento preventivo (WU-4). */
export interface CrearPlanDto {
  /** Cliente activo: la elegibilidad del responsable se decide con su membresía en él. */
  clienteId: string;
  titulo: string;
  instrucciones: string | null;
  /** Excluyente con `ubicacion` — la AUTORIDAD del XOR es la entidad (ADR-PV1). */
  equipoId: string | null;
  ubicacion: string | null;
  prioridadId: string;
  responsableId: string;
  intervaloValor: number;
  intervaloUnidad: IntervaloUnidad;
  /** Ausente = 0 días (S5). La AUTORIDAD de su validez es la entidad. */
  anticipacionValor?: number;
  anticipacionUnidad?: IntervaloUnidad;
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
 * El responsable tiene que ser un técnico que atienda los tickets que el plan genera
 * (`ResponsablesPlanPreventivo.exigirElegible`) → `ResponsableNoElegibleError` (422), sin persistir.
 * Se consulta después de la validación de la entidad, que no hace I/O.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Objetivo excluyente del plan"
 * y "Recurrencia por tiempo, anclada a fecha inmutable". Ref design: ADR-PV1,
 * ADR-PV2. Tarea: 4.2.
 */
export class CrearPlanUseCase {
  constructor(
    private readonly planRepo: Pick<IPlanPreventivoRepository, 'guardar'>,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly responsables: Pick<ResponsablesPlanPreventivo, 'exigirElegible'>,
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
      anticipacionValor: dto.anticipacionValor,
      anticipacionUnidad: dto.anticipacionUnidad,
      fechaInicio: dto.fechaInicio,
      proximaEjecucionEn: dto.fechaInicio,
      activo: true,
    });

    if (planResult.isFail()) {
      return Result.fail(planResult.getError());
    }

    const elegible = await this.responsables.exigirElegible(dto.clienteId, dto.responsableId);
    if (elegible.isFail()) {
      return Result.fail(elegible.getError());
    }

    const plan = planResult.getValue();
    await this.txRunner.run(async () => {
      await this.planRepo.guardar(plan);
    });

    return Result.ok(plan);
  }
}
