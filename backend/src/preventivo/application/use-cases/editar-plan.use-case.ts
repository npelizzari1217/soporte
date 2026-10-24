import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import {
  IntervaloUnidad,
  PlanPreventivoEntity,
} from '../../domain/entities/plan-preventivo.entity';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';
import { CalcularCicloService } from '../../domain/services/calcular-ciclo.service';
import { ResponsablesPlanPreventivo } from '../services/responsables-plan-preventivo';
import {
  cargarPlanVisible,
  exigirLecturaSobreTipoDelPlan,
  exigirTipoParaTicketsNuevos,
} from '../services/acceso-plan-preventivo';

/** DTO de entrada para editar un plan (PATCH semántico, `undefined` = no tocar). */
export interface EditarPlanDto {
  /** Cliente activo: la elegibilidad del responsable se decide con su membresía en él. */
  clienteId: string;
  planId: string;
  titulo?: string;
  instrucciones?: string | null;
  equipoId?: string | null;
  ubicacion?: string | null;
  prioridadId?: string;
  /** Tipo nuevo de los tickets que genera el plan (odd/preventivo-por-tipo, S2). */
  tipoId?: string;
  responsableId?: string;
  intervaloValor?: number;
  intervaloUnidad?: IntervaloUnidad;
  anticipacionValor?: number;
  anticipacionUnidad?: IntervaloUnidad;
  activo?: boolean;
  /** Permisos por tipo del actor (odd/preventivo-por-tipo, S4). */
  alcance: AlcanceActorTicket;
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
 * La anticipación (odd/preventivo-anticipacion T1) dispara el MISMO
 * recálculo cuando cambia, y el puntero sigue siendo una FECHA DE CICLO: el
 * recálculo pasa el plan SIN anticipación a `ciclosPendientes`, así que el
 * resultado es el primer ciclo cuya fecha es `> hoy`. Con la anticipación
 * puesta daría el primer ciclo cuya fecha de GENERACIÓN es `> hoy`, y
 * agrandar la anticipación saltearía el ciclo próximo, que todavía no se
 * generó. Si ese ciclo ya cae dentro de la ventana nueva, el próximo barrido
 * lo genera; si ya se había generado, `reservar()` lo descarta solo.
 *
 * Sin validación de objetivo excluyente EN ESTE use case: la AUTORIDAD es
 * `PlanPreventivoEntity.editar()` (ADR-PV1).
 *
 * Visibilidad por el tipo del plan (odd/preventivo-por-tipo, S4): sin `LECTURA` sobre él, el plan
 * no existe para el actor (404). Un tipo NUEVO tiene que admitir tickets nuevos
 * (`TipoTicketNoEncontradoError`, 422) y el actor tiene que verlo también (403). El tipo vigente no
 * se revalida contra el catálogo: dado de baja, el plan se sigue pudiendo editar, igual que el
 * responsable vigente. `PREVENTIVO:MODIFICACION` lo exige el controller.
 *
 * Un responsable NUEVO tiene que ser elegible para el tipo resultante
 * (`ResponsablesPlanPreventivo.exigirElegible`, S5) → `ResponsableNoElegibleError` (422). El vigente
 * no se revalida mientras el tipo no cambie: el formulario lo reenvía en cada guardado, y exigirlo
 * bloquearía editar cualquier otro campo de un plan cuyo técnico perdió el permiso después. Si el
 * tipo cambia, sí: un técnico de Preventivo no atiende por eso los tickets de otro tipo. Todo se
 * decide antes de `editar()`, para que un rechazo no deje la entidad a medio mutar.
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
    private readonly responsables: Pick<ResponsablesPlanPreventivo, 'exigirElegible'>,
    private readonly tipos: Pick<ITipoTicketRepository, 'findById'>,
  ) {}

  /**
   * @param dto Campos a editar y alcance del actor.
   * @returns El plan editado, o el 404, el 403 o el error de validación que corresponde.
   */
  async execute(dto: EditarPlanDto): Promise<Result<PlanPreventivoEntity, DomainError>> {
    const cargado = await cargarPlanVisible(this.planRepo, dto.planId, dto.alcance);
    if (cargado.isFail()) {
      return Result.fail(cargado.getError());
    }
    const plan = cargado.getValue();

    const tipoCambia = dto.tipoId !== undefined && dto.tipoId !== plan.tipoId;
    const tipoResultante = dto.tipoId ?? plan.tipoId;
    if (tipoCambia) {
      const tipoVigente = await exigirTipoParaTicketsNuevos(this.tipos, tipoResultante);
      if (tipoVigente.isFail()) {
        return Result.fail(tipoVigente.getError());
      }
      const permitido = exigirLecturaSobreTipoDelPlan(dto.alcance, tipoResultante);
      if (permitido.isFail()) {
        return Result.fail(permitido.getError());
      }
    }

    const responsableResultante = dto.responsableId ?? plan.responsableId;
    if (tipoCambia || responsableResultante !== plan.responsableId) {
      const elegible = await this.responsables.exigirElegible(
        dto.clienteId,
        responsableResultante,
        tipoResultante,
      );
      if (elegible.isFail()) {
        return Result.fail(elegible.getError());
      }
    }

    const cadenciaCambia =
      (dto.intervaloValor !== undefined && dto.intervaloValor !== plan.intervaloValor) ||
      (dto.intervaloUnidad !== undefined && dto.intervaloUnidad !== plan.intervaloUnidad);
    const anticipacionCambia =
      (dto.anticipacionValor !== undefined && dto.anticipacionValor !== plan.anticipacionValor) ||
      (dto.anticipacionUnidad !== undefined && dto.anticipacionUnidad !== plan.anticipacionUnidad);

    const editarResult = plan.editar({
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
      activo: dto.activo,
    });
    if (editarResult.isFail()) {
      return Result.fail(editarResult.getError());
    }

    await this.txRunner.run(async () => {
      await this.planRepo.guardar(plan);

      if (cadenciaCambia || anticipacionCambia) {
        const hoy = new Date();
        // Sin `anticipacion` a propósito: el puntero es la fecha del ciclo
        // (ver JSDoc de la clase).
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
