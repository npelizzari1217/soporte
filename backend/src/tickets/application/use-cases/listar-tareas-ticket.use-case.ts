import { DomainError, Result } from '../../../shared/domain/result';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TareaAccionNoPermitidaError } from '../../domain/errors/tareas.errors';
import {
  TicketNoEncontradoError,
  TipoTicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { AvanceTareas, calcularAvanceTareas } from '../../domain/services/avance-tareas';
import { cargarTicket } from '../services/tareas-ticket.reglas';
import { esTicketVisiblePara } from '../services/visibilidad-ticket';

/** Módulo de los tickets de soporte: su lectura, además, exige ver el ticket. */
const MODULO_TICKETS = 'TICKETS';

export interface ListarTareasTicketDto {
  ticketId: string;
  actorId: string;
  /** `puedeEjecutar(user, 'TICKETS:VER_TODOS')`, igual que en `ObtenerTicketUseCase`. */
  tienePermisoVerTodos: boolean;
  /**
   * Módulos (`MODULOS`) en los que el actor tiene `<MODULO>:LECTURA`, calculados con
   * `puedeEjecutar` (ROOT y ADMINISTRADOR los tienen todos), igual que `modulosConModificacion`.
   */
  modulosConLectura: readonly string[];
}

export interface TareasDelTicket {
  /** Tareas activas, por `orden` y fecha de alta. */
  tareas: TareaTicketEntity[];
  avance: AvanceTareas;
}

/**
 * ListarTareasTicketUseCase — tareas activas de un ticket con su avance (odd/tareas-con-tecnico,
 * CA7).
 *
 * Quién lista (decisión del dueño del 2026-10-14, T12): el permiso de lectura del módulo del tipo.
 * - El técnico de una tarea activa del ticket, siempre (CA10).
 * - Si no, quien tiene `<MODULO>:LECTURA` del módulo del tipo. En el módulo TICKETS además tiene
 *   que ver el ticket (`esTicketVisiblePara`), igual que el listado y el detalle de `/tickets`. En
 *   los demás módulos (EDILICIA, COMPRAS, EQUIPOS) alcanza el permiso: sus listados por módulo ya
 *   muestran cada ítem a cualquiera que lo tenga, sin filtro por usuario.
 * - A cualquier otro: 404 si no ve el ticket, sin revelar que existe; 403 si lo ve.
 */
export class ListarTareasTicketUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
  ) {}

  async execute(dto: ListarTareasTicketDto): Promise<Result<TareasDelTicket, DomainError>> {
    const ticketResult = await cargarTicket(this.ticketRepo, dto.ticketId);
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    const tareas = await this.tareaRepo.listarPorTicket(ticket.id);
    const resultado = Result.ok({ tareas, avance: calcularAvanceTareas(tareas) });
    if (tareas.some((tarea) => tarea.tecnicoId === dto.actorId)) return resultado;

    const tipo = await this.tipoTicketRepo.findById(ticket.tipoId);
    if (!tipo) return Result.fail(new TipoTicketNoEncontradoError(ticket.tipoId));

    const leeElModulo = dto.modulosConLectura.includes(tipo.modulo);
    if (leeElModulo && tipo.modulo !== MODULO_TICKETS) return resultado;

    const veElTicket = await esTicketVisiblePara(
      this.ticketRepo,
      ticket,
      dto.actorId,
      dto.tienePermisoVerTodos,
    );
    if (leeElModulo && veElTicket) return resultado;
    return Result.fail(
      veElTicket
        ? new TareaAccionNoPermitidaError('listar')
        : new TicketNoEncontradoError(ticket.id),
    );
  }
}
