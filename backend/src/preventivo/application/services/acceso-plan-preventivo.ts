import { DomainError, Result } from '../../../shared/domain/result';
import {
  AlcanceActorTicket,
  tieneAccionSobreTipo,
} from '../../../tickets/application/services/visibilidad-ticket';
import { TipoTicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import {
  AccionSobreTipoDelPlanNoPermitidaError,
  PlanNoEncontradoError,
} from '../../domain/errors/preventivo.errors';
import { IPlanPreventivoRepository } from '../../domain/ports/i-plan-preventivo.repository';

/**
 * Visibilidad de los planes preventivos por el tipo de ticket del plan (odd/preventivo-por-tipo, S1,
 * S4). Las celdas `PREVENTIVO:*` del módulo siguen decidiendo QUÉ puede hacer el actor (las exige el
 * decorador de cada ruta); el tipo agrega SOBRE QUÉ planes: solo los de los tipos con `LECTURA`. Usa
 * el mismo `AlcanceActorTicket` que los tickets (`CargadorAlcanceTicket`) y su convención: un plan
 * de un tipo sin `LECTURA` no existe para el actor (404). ROOT y ADMINISTRADOR
 * (`permisosPorTipo: null`) no se restringen.
 *
 * No hay regla de fila ni `VER_TODOS`: S4 pide `LECTURA` sobre el tipo, sin distinguir de quién es
 * el plan.
 */

/**
 * Tipos cuyos planes ve el actor (S1): los que tiene con `LECTURA`.
 *
 * @param alcance Alcance del actor.
 * @returns Los ids de esos tipos, o `null` sin restricción (ROOT y ADMINISTRADOR).
 */
export function tiposDePlanesVisibles(alcance: AlcanceActorTicket): string[] | null {
  if (alcance.permisosPorTipo === null) return null;
  return [...alcance.permisosPorTipo]
    .filter(([, acciones]) => acciones.has('LECTURA'))
    .map(([tipoId]) => tipoId);
}

/**
 * Exige `LECTURA` sobre un tipo elegido para un plan: el del alta, el nuevo de una edición o el de
 * la lista de responsables (S4). Un plan de ese tipo quedaría fuera del listado del actor.
 *
 * @param alcance Alcance del actor.
 * @param tipoId Tipo elegido.
 * @returns Ok, o `AccionSobreTipoDelPlanNoPermitidaError` (403).
 */
export function exigirLecturaSobreTipoDelPlan(
  alcance: AlcanceActorTicket,
  tipoId: string,
): Result<void, DomainError> {
  if (tieneAccionSobreTipo(alcance, tipoId, 'LECTURA')) return Result.ok(undefined);
  return Result.fail(new AccionSobreTipoDelPlanNoPermitidaError('LECTURA'));
}

/**
 * Carga un plan vigente que el actor ve: `LECTURA` sobre su tipo (S4). Un plan inexistente, dado de
 * baja o de un tipo sin `LECTURA` es el mismo `PlanNoEncontradoError` (404): no se revela que existe.
 *
 * @param planRepo Repositorio de planes.
 * @param planId Id del plan.
 * @param alcance Alcance del actor.
 * @returns El plan, o el 404.
 */
export async function cargarPlanVisible(
  planRepo: Pick<IPlanPreventivoRepository, 'buscarPorId'>,
  planId: string,
  alcance: AlcanceActorTicket,
): Promise<Result<PlanPreventivoEntity, DomainError>> {
  const plan = await planRepo.buscarPorId(planId);
  if (!plan || plan.isDeleted() || !tieneAccionSobreTipo(alcance, plan.tipoId, 'LECTURA')) {
    return Result.fail(new PlanNoEncontradoError(planId));
  }
  return Result.ok(plan);
}

/**
 * El tipo elegido para un plan tiene que admitir tickets nuevos, porque el barrido va a crear
 * tickets de ese tipo: existe y no está dado de baja. Es el mismo rechazo que el alta de un ticket
 * (`CrearTicketUseCase`, paso 3), con el mismo error.
 *
 * @param tipos Catálogo de tipos de ticket.
 * @param tipoId Tipo elegido.
 * @returns Ok, o `TipoTicketNoEncontradoError` (422).
 */
export async function exigirTipoParaTicketsNuevos(
  tipos: Pick<ITipoTicketRepository, 'findById'>,
  tipoId: string,
): Promise<Result<void, DomainError>> {
  const tipo = await tipos.findById(tipoId);
  if (!tipo || tipo.isDeleted() || !tipo.activo) {
    return Result.fail(new TipoTicketNoEncontradoError(tipoId));
  }
  return Result.ok(undefined);
}
