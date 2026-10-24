import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import {
  IntervaloUnidad,
  PlanPreventivoEntity,
} from '../../domain/entities/plan-preventivo.entity';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { ResponsablesPlanPreventivo } from '../services/responsables-plan-preventivo';
import {
  exigirLecturaSobreTipoDelPlan,
  exigirTipoParaTicketsNuevos,
} from '../services/acceso-plan-preventivo';

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
  /** Tipo de los tickets que genera el plan (odd/preventivo-por-tipo, S2). */
  tipoId: string;
  responsableId: string;
  intervaloValor: number;
  intervaloUnidad: IntervaloUnidad;
  /** Ausente = 0 días (S5). La AUTORIDAD de su validez es la entidad. */
  anticipacionValor?: number;
  anticipacionUnidad?: IntervaloUnidad;
  fechaInicio: Date;
  /** Permisos por tipo del actor: el tipo elegido tiene que ser uno con `LECTURA` (S4). */
  alcance: AlcanceActorTicket;
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
 * Tipo del plan (odd/preventivo-por-tipo, S2, S4), en el orden del alta de un ticket: tiene que
 * admitir tickets nuevos (`TipoTicketNoEncontradoError`, 422) y el actor tiene que verlo, `LECTURA`
 * sobre él (`AccionSobreTipoDelPlanNoPermitidaError`, 403): si no, crearía un plan que no le
 * aparece en el listado. `PREVENTIVO:ALTAS` lo exige el controller.
 *
 * El responsable tiene que ser un técnico que atienda los tickets de ese tipo
 * (`ResponsablesPlanPreventivo.exigirElegible`, S5) → `ResponsableNoElegibleError` (422), sin
 * persistir. Todas estas consultas corren después de la validación de la entidad, que no hace I/O.
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
    private readonly tipos: Pick<ITipoTicketRepository, 'findById'>,
  ) {}

  /**
   * @param dto Datos del plan y alcance del actor.
   * @returns El plan creado, o el error de dominio, de tipo, de permiso o de responsable.
   */
  async execute(dto: CrearPlanDto): Promise<Result<PlanPreventivoEntity, DomainError>> {
    const planResult = PlanPreventivoEntity.create({
      titulo: dto.titulo,
      instrucciones: dto.instrucciones,
      equipoId: dto.equipoId,
      ubicacion: dto.ubicacion,
      prioridadId: dto.prioridadId,
      tipoId: dto.tipoId,
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

    const tipoVigente = await exigirTipoParaTicketsNuevos(this.tipos, dto.tipoId);
    if (tipoVigente.isFail()) {
      return Result.fail(tipoVigente.getError());
    }
    const permitido = exigirLecturaSobreTipoDelPlan(dto.alcance, dto.tipoId);
    if (permitido.isFail()) {
      return Result.fail(permitido.getError());
    }

    const elegible = await this.responsables.exigirElegible(
      dto.clienteId,
      dto.responsableId,
      dto.tipoId,
    );
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
