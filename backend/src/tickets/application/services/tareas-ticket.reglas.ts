import { DomainError, Result } from '../../../shared/domain/result';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { CodigoOperacionTarea } from '../../domain/constants/tipos-operacion-tarea.constants';
import {
  TareaAccionNoPermitidaError,
  TareaEliminadaError,
  TareaNoEncontradaError,
} from '../../domain/errors/tareas.errors';
import {
  TicketNoEncontradoError,
  TipoTicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import {
  CondicionDeCompletado,
  ITareaTicketRepository,
} from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import {
  AlcanceActorTicket,
  cargarTicketParaOperar,
  esTicketAccesiblePara,
  PermisosPorTipo,
  tieneAccionSobreTipo,
} from './visibilidad-ticket';

/**
 * Reglas compartidas por los casos de uso de tareas de un ticket (odd/tareas-con-tecnico, T2).
 *
 * Los permisos dependen del TIPO del ticket, que se conoce recién al cargarlo
 * (odd/permisos-por-tipo-ticket, D5 c): ver las tareas exige ver el ticket (`LECTURA` sobre su
 * tipo y fila) y gestionarlas, además, `MODIFICACION` sobre ese tipo. Por eso se chequea acá y no
 * en `AccionesGuard`, cuya metadata es fija por ruta.
 */

/** Quién ejecuta la acción, tal como lo arma la capa de interface. */
export interface ActorTarea {
  /** `sub` del JWT. */
  id: string;
  /** ROOT (`is_global_admin`) o ADMINISTRADOR del cliente activo. */
  esAdministrador: boolean;
  /**
   * Acciones del actor por tipo de ticket (`AlcanceActorTicket.permisosPorTipo`), o `null` sin
   * restricción (ROOT y ADMINISTRADOR).
   */
  permisosPorTipo: PermisosPorTipo | null;
}

/**
 * Alcance del actor para el punto único de acceso a un ticket (`esTicketAccesiblePara`).
 *
 * @param actor Actor de la acción sobre tareas.
 * @returns Id y permisos por tipo del actor.
 */
export function alcanceDeActorTarea(actor: ActorTarea): AlcanceActorTicket {
  return { actorId: actor.id, permisosPorTipo: actor.permisosPorTipo };
}

/**
 * Lo que los casos de uso de tareas necesitan del repositorio de tickets: cargar el ticket, decidir
 * si el actor lo ve (`esTicketAccesiblePara`, CA10) y bloquear su fila mientras cambian una tarea
 * (odd/estado-por-tareas, S6).
 */
export type TicketRepoDeTareas = Pick<ITicketRepository, 'findById' | 'esVisiblePara' | 'bloquear'>;

/**
 * Carga el ticket activo y exige que el actor lo vea (`LECTURA` sobre su tipo y fila,
 * odd/permisos-por-tipo-ticket S3). Uno que no ve da el mismo `TicketNoEncontradoError` que uno
 * inexistente: sin `LECTURA` sobre el tipo, ni siquiera el técnico de una de sus tareas confirma
 * que existe. La regla de cada acción se aplica después.
 *
 * @param ticketRepo Repositorio de tickets.
 * @param ticketId Id del ticket.
 * @param actor Actor de la acción sobre tareas.
 * @returns El ticket, o `TicketNoEncontradoError`.
 */
export async function cargarTicketVisible(
  ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
  ticketId: string,
  actor: ActorTarea,
): Promise<Result<TicketEntity, DomainError>> {
  return cargarTicketParaOperar(ticketRepo, ticketId, alcanceDeActorTarea(actor), 'LECTURA');
}

/**
 * Carga una tarea activa del ticket. Una tarea inexistente, dada de baja o de otro ticket da el
 * mismo `TareaNoEncontradaError`.
 */
export async function cargarTareaDelTicket(
  tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId'>,
  ticketId: string,
  tareaId: string,
): Promise<Result<TareaTicketEntity, DomainError>> {
  const tarea = await tareaRepo.buscarPorId(tareaId);
  if (!tarea || tarea.isDeleted() || tarea.ticketId !== ticketId) {
    return Result.fail(new TareaNoEncontradaError(tareaId));
  }
  return Result.ok(tarea);
}

/**
 * Rechazo de un actor sin permiso. Si no ve el ticket (`esTicketAccesiblePara`: `LECTURA` sobre el
 * tipo y fila, odd/permisos-por-tipo-ticket S3), se responde como si no existiera (mismo criterio
 * que `ObtenerTicketUseCase`); si lo ve, es un 403. El técnico de una tarea activa ve el ticket por
 * fila (CA10), así que lo que no puede hacer le da 403.
 */
export async function rechazar(
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>,
  ticket: TicketEntity,
  actor: ActorTarea,
  accion: string,
): Promise<DomainError> {
  return (await esTicketAccesiblePara(ticketRepo, ticket, alcanceDeActorTarea(actor)))
    ? new TareaAccionNoPermitidaError(accion)
    : new TicketNoEncontradoError(ticket.id);
}

/**
 * CA3: crean, asignan y borran tareas el responsable del ticket, el ADMINISTRADOR o ROOT, y además
 * con `MODIFICACION` sobre el tipo del ticket (odd/permisos-por-tipo-ticket, D5 c).
 */
export function puedeGestionarTareas(actor: ActorTarea, ticket: TicketEntity): boolean {
  const esResponsable = ticket.asignadoId !== null && ticket.asignadoId === actor.id;
  return (
    (esResponsable || actor.esAdministrador) &&
    tieneAccionSobreTipo(alcanceDeActorTarea(actor), ticket.tipoId, 'MODIFICACION')
  );
}

/**
 * Carga el ticket (404 si el actor no lo ve, `cargarTicketVisible`) y su tipo, y aplica
 * `puedeGestionarTareas`. Devuelve el ticket y el módulo del tipo, que la asignación necesita para
 * la elegibilidad del técnico.
 */
export async function autorizarGestion(
  deps: {
    ticketRepo: TicketRepoDeTareas;
    tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>;
  },
  ticketId: string,
  actor: ActorTarea,
  accion: string,
): Promise<Result<{ ticket: TicketEntity; modulo: string }, DomainError>> {
  const ticketResult = await cargarTicketVisible(deps.ticketRepo, ticketId, actor);
  if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
  const ticket = ticketResult.getValue();

  const tipo = await deps.tipoTicketRepo.findById(ticket.tipoId);
  if (!tipo) return Result.fail(new TipoTicketNoEncontradoError(ticket.tipoId));
  if (!puedeGestionarTareas(actor, ticket)) {
    return Result.fail(await rechazar(deps.ticketRepo, ticket, actor, accion));
  }
  return Result.ok({ ticket, modulo: tipo.modulo });
}

/** De dónde sale el permiso de completar y descompletar una tarea (CA4). */
export type BaseParaCompletar = 'ADMINISTRADOR' | 'RESPONSABLE' | 'TECNICO';

/**
 * CA4: completan y descompletan el ADMINISTRADOR o ROOT, el responsable del ticket y el técnico de
 * la tarea, en ese orden de precedencia. Devuelve de cuál de los tres sale el permiso, o `null`.
 */
export function baseParaCompletarTarea(
  actor: ActorTarea,
  ticket: TicketEntity,
  tarea: TareaTicketEntity,
): BaseParaCompletar | null {
  if (actor.esAdministrador) return 'ADMINISTRADOR';
  if (ticket.asignadoId !== null && ticket.asignadoId === actor.id) return 'RESPONSABLE';
  if (tarea.tecnicoId !== null && tarea.tecnicoId === actor.id) return 'TECNICO';
  return null;
}

/** CA4: completan y descompletan el técnico de la tarea, el responsable, el ADMINISTRADOR o ROOT. */
export function puedeCompletarTarea(
  actor: ActorTarea,
  ticket: TicketEntity,
  tarea: TareaTicketEntity,
): boolean {
  return baseParaCompletarTarea(actor, ticket, tarea) !== null;
}

/**
 * Condición de técnico de la escritura de completar o descompletar (T13, JD-S2). Si el actor tiene
 * permiso SOLO por ser el técnico de la tarea, la escritura exige que siga siéndolo: una
 * reasignación en el medio le quita el permiso con el que se lo autorizó. El responsable y el
 * administrador no dependen del técnico, así que su escritura no lo condiciona.
 */
export function condicionDeTecnico(
  actor: ActorTarea,
  ticket: TicketEntity,
  tarea: TareaTicketEntity,
): CondicionDeCompletado {
  return baseParaCompletarTarea(actor, ticket, tarea) === 'TECNICO' ? { tecnicoId: actor.id } : {};
}

/**
 * La tarea ya se cargó activa, así que `TareaEliminadaError` solo puede venir de una carrera con
 * otra baja: se informa como no encontrada, igual que si la baja hubiera llegado antes.
 */
export function mapearErrorDeTarea(error: DomainError, tareaId: string): DomainError {
  return error instanceof TareaEliminadaError ? new TareaNoEncontradaError(tareaId) : error;
}

/**
 * Error de una escritura condicionada que no aplicó (T10, JD-W1): otra acción cambió la tarea
 * entre que el caso de uso la cargó y la escribió. Se relee para responder con el estado actual:
 * si ya no está activa, `TareaNoEncontradaError` (404), igual que si la baja hubiera llegado
 * antes; si sigue activa, `siSigueActiva`. Puede ser el error de la operación (el 409 de
 * completar o descompletar, para que el frontend refresque la lista) o una función que lo decide
 * a partir de la tarea releída (T13: el permiso o el completado cambiaron).
 */
export async function errorDeEscrituraRechazada(
  tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId'>,
  tareaId: string,
  siSigueActiva: DomainError | ((actual: TareaTicketEntity) => Promise<DomainError>),
): Promise<DomainError> {
  const actual = await tareaRepo.buscarPorId(tareaId);
  if (!actual || actual.isDeleted()) return new TareaNoEncontradaError(tareaId);
  return siSigueActiva instanceof DomainError ? siSigueActiva : siSigueActiva(actual);
}

/**
 * Error de un completar o descompletar cuya escritura no aplicó (T13). Con la tarea ya releída y
 * activa: si el actor perdió el permiso (le reasignaron la tarea, JD-S2), el rechazo de siempre
 * (`rechazar`: 403, o 404 si ya no ve el ticket); si no, `porEstado`, el 409 del estado actual.
 */
export function errorDeCompletadoRechazado(
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>,
  ticket: TicketEntity,
  actor: ActorTarea,
  accion: 'completar' | 'descompletar',
  porEstado: (actual: TareaTicketEntity) => DomainError,
): (actual: TareaTicketEntity) => Promise<DomainError> {
  return async (actual) =>
    puedeCompletarTarea(actor, ticket, actual)
      ? porEstado(actual)
      : rechazar(ticketRepo, ticket, actor, accion);
}

/**
 * Resuelve el id del tipo de operación. El catálogo lo siembra una migración: si falta, es un
 * fallo de infraestructura y no un error del caller (mismo `throw` defensivo que
 * `AsignarTicketUseCase`).
 */
export async function resolverTipoOperacion(
  tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
  codigo: CodigoOperacionTarea,
): Promise<string> {
  const id = await tipoOperacionRepo.findIdByCodigo(codigo);
  if (!id) {
    throw new Error(
      `Catálogo de tipo_operacion inconsistente: no existe "${codigo}" en el tenant activo.`,
    );
  }
  return id;
}

/**
 * Entrada del historial de una acción sobre una tarea (CA8). Pública, con el actor como autor y
 * la descripción de la tarea como texto, para que el historial se lea sin cruzar tablas.
 */
export function operacionDeTarea(params: {
  tarea: TareaTicketEntity;
  tipoOperacionId: string;
  autorId: string;
  metadata?: Record<string, unknown>;
}): OperacionTicketEntity {
  return OperacionTicketEntity.create({
    ticketId: params.tarea.ticketId,
    tipoOperacionId: params.tipoOperacionId,
    descripcion: params.tarea.descripcion,
    estadoAnteriorId: null,
    estadoNuevoId: null,
    autorId: params.autorId,
    esInterno: false,
    metadata: { tarea_id: params.tarea.id, ...params.metadata },
  });
}
