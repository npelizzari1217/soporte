import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { AlcanceListadoTickets, ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * Regla de fila de un ticket (T6, extendida por odd/tareas-con-tecnico CA10): con `VER_TODOS` sobre
 * el tipo del ticket el actor ve cualquier ticket de ese tipo; sin el permiso, los que solicitó,
 * los que tiene asignados como responsable (decisión del dueño del 2026-10-14) y aquellos donde es
 * el técnico de una tarea activa. Al quitarlo de la tarea, o al borrarla, deja de verlo, salvo que
 * lo vea por otro de esos motivos.
 *
 * Se aplica a través de `esTicketAccesiblePara`, que antes exige `LECTURA` sobre el tipo. Los
 * listados y agregados aplican la misma regla en SQL con el filtro `alcance` (`alcanceDeListado`;
 * `ITicketRepository.esVisiblePara` comparte esa definición).
 */
export async function esTicketVisiblePara(
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>,
  ticket: TicketEntity,
  actorId: string,
  tienePermisoVerTodos: boolean,
): Promise<boolean> {
  if (tienePermisoVerTodos || ticket.solicitanteId === actorId || ticket.asignadoId === actorId) {
    return true;
  }
  return ticketRepo.esVisiblePara(ticket.id, actorId);
}

/**
 * Acciones del actor por id de tipo de ticket (odd/permisos-por-tipo-ticket, D5 a). Un tipo
 * ausente no concede ninguna acción.
 */
export type PermisosPorTipo = ReadonlyMap<string, ReadonlySet<AccionTipoTicket>>;

/**
 * Lo que el actor puede hacer con los tickets (odd/permisos-por-tipo-ticket, D5 a). La capa de
 * interface lo carga por request de la tabla `permisos_tipo_ticket` del tenant. `permisosPorTipo`
 * en `null` es "sin restricción" (ROOT y ADMINISTRADOR).
 */
export interface AlcanceActorTicket {
  actorId: string;
  permisosPorTipo: PermisosPorTipo | null;
}

/**
 * Lo que exige una operación sobre el tipo del ticket: una acción, o alguna de varias
 * (`algunaDe`, por ejemplo adjuntar con `ALTAS` o `MODIFICACION`).
 */
export type RequisitoDeAccion =
  AccionTipoTicket | { readonly algunaDe: readonly AccionTipoTicket[] };

/**
 * ¿El actor tiene la acción sobre el tipo? Sin restricción (`null`), siempre.
 *
 * @param alcance Alcance del actor.
 * @param tipoId Id del tipo de ticket.
 * @param accion Acción buscada.
 * @returns `true` si la acción está concedida sobre ese tipo.
 */
export function tieneAccionSobreTipo(
  alcance: AlcanceActorTicket,
  tipoId: string,
  accion: AccionTipoTicket,
): boolean {
  if (alcance.permisosPorTipo === null) return true;
  return alcance.permisosPorTipo.get(tipoId)?.has(accion) === true;
}

/**
 * Exige una acción sobre un tipo cuando todavía no hay ticket: el alta de un ticket de ese tipo
 * (odd/permisos-por-tipo-ticket, S6, D5 c: crear exige `ALTAS` sobre el tipo elegido). Sin actor
 * (`null`: barrido preventivo, API v1, formulario público) no se exige nada (D3).
 *
 * @param alcance Alcance del actor, o `null` en un flujo sin actor humano.
 * @param tipoId Id del tipo de ticket.
 * @param accion Acción exigida.
 * @returns Ok, o `AccionSobreTipoNoPermitidaError` (403).
 */
export function exigirAccionSobreTipo(
  alcance: AlcanceActorTicket | null,
  tipoId: string,
  accion: AccionTipoTicket,
): Result<void, DomainError> {
  if (alcance === null || tieneAccionSobreTipo(alcance, tipoId, accion)) {
    return Result.ok(undefined);
  }
  return Result.fail(new AccionSobreTipoNoPermitidaError(accion));
}

/**
 * Punto único de visibilidad de un ticket existente (odd/permisos-por-tipo-ticket, S3, D2, D5 b):
 * `LECTURA` sobre el tipo del ticket, y además `VER_TODOS` sobre ese tipo o la regla de fila
 * (`esTicketVisiblePara`). Sin `LECTURA` no lo ve nadie, ni su responsable ni el técnico de una de
 * sus tareas (S3). Lo usan las lecturas y las escrituras con actor humano; los flujos de sistema no
 * (D3).
 *
 * @param ticketRepo Repositorio de tickets, para la regla de fila.
 * @param ticket Ticket ya leído.
 * @param alcance Alcance del actor.
 * @returns `true` si el actor ve el ticket.
 */
export async function esTicketAccesiblePara(
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>,
  ticket: TicketEntity,
  alcance: AlcanceActorTicket,
): Promise<boolean> {
  if (alcance.permisosPorTipo === null) return true;
  if (!tieneAccionSobreTipo(alcance, ticket.tipoId, 'LECTURA')) return false;
  return esTicketVisiblePara(
    ticketRepo,
    ticket,
    alcance.actorId,
    tieneAccionSobreTipo(alcance, ticket.tipoId, 'VER_TODOS'),
  );
}

/**
 * Filtro de listado del actor (odd/permisos-por-tipo-ticket, S6, D5 e), la versión por conjunto de
 * `esTicketAccesiblePara`: los tipos con `LECTURA`, separados en los que tienen `VER_TODOS` (todas
 * sus filas) y los que no (solo la regla de fila). Con `tiposSolicitados` (el filtro de tipo del
 * caller) se queda con la intersección: pedir un tipo nunca amplía el alcance. Lo usan el listado y
 * la exportación de tickets, el de reparaciones y las métricas del dashboard.
 *
 * @param alcance Alcance del actor.
 * @param tiposSolicitados Tipos pedidos por el caller; ausente o vacío, todos.
 * @returns El filtro para el repositorio, o `null` sin restricción (ROOT y ADMINISTRADOR).
 */
export function alcanceDeListado(
  alcance: AlcanceActorTicket,
  tiposSolicitados?: readonly string[],
): AlcanceListadoTickets | null {
  if (alcance.permisosPorTipo === null) return null;
  const pedidos =
    tiposSolicitados !== undefined && tiposSolicitados.length > 0
      ? new Set(tiposSolicitados)
      : null;
  const tiposVerTodos: string[] = [];
  const tiposPorFila: string[] = [];
  for (const [tipoId, acciones] of alcance.permisosPorTipo) {
    if (!acciones.has('LECTURA') || (pedidos !== null && !pedidos.has(tipoId))) continue;
    (acciones.has('VER_TODOS') ? tiposVerTodos : tiposPorFila).push(tipoId);
  }
  return { actorId: alcance.actorId, tiposVerTodos, tiposPorFila };
}

/**
 * ¿El filtro no deja entrar ningún tipo? Permite cortar sin consultar la base.
 *
 * @param alcance Filtro de listado, o `null` sin restricción.
 * @returns `true` si ningún ticket puede entrar.
 */
export function alcanceListadoVacio(alcance: AlcanceListadoTickets | null): boolean {
  return (
    alcance !== null && alcance.tiposVerTodos.length === 0 && alcance.tiposPorFila.length === 0
  );
}

/** El primer requisito que el actor no cumple sobre el tipo, como texto; `null` si los cumple. */
function requisitoFaltante(
  alcance: AlcanceActorTicket,
  tipoId: string,
  requisitos: readonly RequisitoDeAccion[],
): string | null {
  for (const requisito of requisitos) {
    const alternativas = typeof requisito === 'string' ? [requisito] : requisito.algunaDe;
    if (!alternativas.some((accion) => tieneAccionSobreTipo(alcance, tipoId, accion))) {
      return alternativas.join(' o ');
    }
  }
  return null;
}

/**
 * Decide si el actor puede hacer una operación sobre un ticket existente
 * (odd/permisos-por-tipo-ticket, S6, D2, D5 c): si no lo ve (`esTicketAccesiblePara`),
 * `TicketNoEncontradoError` (404), sin revelar que existe; si lo ve y le falta alguno de los
 * requisitos sobre el tipo de ESE ticket, `AccionSobreTipoNoPermitidaError` (403). Sin restricción
 * (ROOT y ADMINISTRADOR), siempre ok.
 *
 * @param ticketRepo Repositorio de tickets, para la regla de fila.
 * @param ticket Ticket ya leído.
 * @param alcance Alcance del actor.
 * @param requisitos Acciones que exige la operación, todas; cada `algunaDe` con una alcanza.
 * @returns Ok, o el 404 o el 403 que corresponde.
 */
export async function puedeOperarTicket(
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>,
  ticket: TicketEntity,
  alcance: AlcanceActorTicket,
  ...requisitos: RequisitoDeAccion[]
): Promise<Result<void, DomainError>> {
  if (!(await esTicketAccesiblePara(ticketRepo, ticket, alcance))) {
    return Result.fail(new TicketNoEncontradoError(ticket.id));
  }
  const faltante = requisitoFaltante(alcance, ticket.tipoId, requisitos);
  return faltante === null
    ? Result.ok(undefined)
    : Result.fail(new AccionSobreTipoNoPermitidaError(faltante));
}

/**
 * Carga un ticket activo y aplica `puedeOperarTicket`. Uno inexistente o dado de baja es el mismo
 * `TicketNoEncontradoError` que uno que el actor no ve.
 *
 * @param ticketRepo Repositorio de tickets.
 * @param ticketId Id del ticket.
 * @param alcance Alcance del actor.
 * @param requisitos Acciones que exige la operación (ver `puedeOperarTicket`).
 * @returns El ticket, o el 404 o el 403 que corresponde.
 */
export async function cargarTicketParaOperar(
  ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
  ticketId: string,
  alcance: AlcanceActorTicket,
  ...requisitos: RequisitoDeAccion[]
): Promise<Result<TicketEntity, DomainError>> {
  const ticket = await ticketRepo.findById(ticketId);
  if (!ticket || ticket.isDeleted()) return Result.fail(new TicketNoEncontradoError(ticketId));
  const acceso = await puedeOperarTicket(ticketRepo, ticket, alcance, ...requisitos);
  return acceso.isFail() ? Result.fail(acceso.getError()) : Result.ok(ticket);
}
