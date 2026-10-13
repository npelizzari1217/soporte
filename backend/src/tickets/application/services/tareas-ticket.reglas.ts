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
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { esTicketVisiblePara } from './visibilidad-ticket';

/**
 * Reglas compartidas por los casos de uso de tareas de un ticket (odd/tareas-con-tecnico, T2).
 *
 * El permiso de modificación depende del módulo del TIPO del ticket, que se conoce recién al
 * cargarlo. Por eso se chequea acá y no en `AccionesGuard`: `@RequiereAcciones` es metadata fija
 * por ruta y no puede elegir entre `TICKETS:MODIFICACION` y `EDILICIA:MODIFICACION` según el
 * ticket. Es el mismo criterio que `tienePermisoVerTodos`: el controller resuelve el JWT con
 * `puedeEjecutar` y la aplicación recibe el resultado, sin conocer el JWT.
 */

/** Quién ejecuta la acción, tal como lo arma el controller a partir del JWT. */
export interface ActorTarea {
  /** `sub` del JWT. */
  id: string;
  /** ROOT (`is_global_admin`) o ADMINISTRADOR del cliente activo. */
  esAdministrador: boolean;
  /** `puedeEjecutar(user, 'TICKETS:VER_TODOS')`: decide si el actor ve el ticket. */
  tienePermisoVerTodos: boolean;
  /**
   * Módulos (`MODULOS` de `shared/domain/modulos.ts`) en los que el actor tiene
   * `<MODULO>:MODIFICACION`, calculados con `puedeEjecutar`. Los cuatro módulos de un tipo de
   * ticket (TICKETS, COMPRAS, EDILICIA, EQUIPOS) declaran `MODIFICACION` en `CATALOGO_MODULOS`.
   */
  modulosConModificacion: readonly string[];
}

/**
 * Lo que los casos de uso de tareas necesitan del repositorio de tickets: cargar el ticket y decidir
 * si el actor lo ve (`esTicketVisiblePara`, CA10).
 */
export type TicketRepoDeTareas = Pick<ITicketRepository, 'findById' | 'esVisiblePara'>;

/** Carga el ticket activo, o `TicketNoEncontradoError`. */
export async function cargarTicket(
  ticketRepo: Pick<ITicketRepository, 'findById'>,
  ticketId: string,
): Promise<Result<TicketEntity, DomainError>> {
  const ticket = await ticketRepo.findById(ticketId);
  if (!ticket || ticket.isDeleted()) return Result.fail(new TicketNoEncontradoError(ticketId));
  return Result.ok(ticket);
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
 * Rechazo de un actor sin permiso. Si ni siquiera ve el ticket, se responde como si no existiera
 * (mismo criterio que `ObtenerTicketUseCase`); si lo ve, es un 403. El técnico de una tarea activa
 * ve el ticket (CA10), así que lo que no puede hacer le da 403.
 */
export async function rechazar(
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>,
  ticket: TicketEntity,
  actor: ActorTarea,
  accion: string,
): Promise<DomainError> {
  return (await esTicketVisiblePara(ticketRepo, ticket, actor.id, actor.tienePermisoVerTodos))
    ? new TareaAccionNoPermitidaError(accion)
    : new TicketNoEncontradoError(ticket.id);
}

/**
 * CA3: crean, asignan y borran tareas el responsable del ticket, el ADMINISTRADOR o ROOT, y además
 * con el permiso de modificación del módulo del tipo.
 */
export function puedeGestionarTareas(
  actor: ActorTarea,
  ticket: TicketEntity,
  moduloDelTipo: string,
): boolean {
  const esResponsable = ticket.asignadoId !== null && ticket.asignadoId === actor.id;
  return (
    (esResponsable || actor.esAdministrador) && actor.modulosConModificacion.includes(moduloDelTipo)
  );
}

/**
 * Carga el ticket y su tipo, y aplica `puedeGestionarTareas`. Devuelve el ticket y el módulo del
 * tipo, que la asignación necesita para la elegibilidad del técnico.
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
  const ticketResult = await cargarTicket(deps.ticketRepo, ticketId);
  if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
  const ticket = ticketResult.getValue();

  const tipo = await deps.tipoTicketRepo.findById(ticket.tipoId);
  if (!tipo) return Result.fail(new TipoTicketNoEncontradoError(ticket.tipoId));
  if (!puedeGestionarTareas(actor, ticket, tipo.modulo)) {
    return Result.fail(await rechazar(deps.ticketRepo, ticket, actor, accion));
  }
  return Result.ok({ ticket, modulo: tipo.modulo });
}

/** CA4: completan y descompletan el técnico de la tarea, el responsable, el ADMINISTRADOR o ROOT. */
export function puedeCompletarTarea(
  actor: ActorTarea,
  ticket: TicketEntity,
  tarea: TareaTicketEntity,
): boolean {
  if (actor.esAdministrador) return true;
  if (ticket.asignadoId !== null && ticket.asignadoId === actor.id) return true;
  return tarea.tecnicoId !== null && tarea.tecnicoId === actor.id;
}

/**
 * La tarea ya se cargó activa, así que `TareaEliminadaError` solo puede venir de una carrera con
 * otra baja: se informa como no encontrada, igual que si la baja hubiera llegado antes.
 */
export function mapearErrorDeTarea(error: DomainError, tareaId: string): DomainError {
  return error instanceof TareaEliminadaError ? new TareaNoEncontradaError(tareaId) : error;
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
