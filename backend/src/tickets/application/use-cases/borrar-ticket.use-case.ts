import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TIPO_OPERACION_BORRADO } from '../../domain/constants/tipos-operacion-borrado.constants';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import {
  TicketConPendientesNoBorrableError,
  TicketNoEncontradoError,
  TicketPreventivoNoBorrableError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IBloqueoTicketRepository } from '../../domain/ports/i-bloqueo-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { TIPO_CODIGO_PREVENTIVO } from '../../domain/tipos-ticket.constants';
import { bloquearTicketActivo } from '../services/bloquear-ticket-activo';
import { esAlcanceDeAdministrador, verificarTicketModificable } from '../services/solo-comentarios';
import { resolverTipoOperacion } from '../services/tareas-ticket.reglas';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

/** Entrada de `BorrarTicketUseCase`: el ticket y el alcance del actor, que lo carga la interface. */
export interface BorrarTicketDto extends AlcanceActorTicket {
  ticketId: string;
}

/**
 * BorrarTicketUseCase — borrado lógico de un ticket (odd/tasks/permisos-por-tipo-ticket.md, S8,
 * L39-L41).
 *
 * - Acceso por el punto único (`cargarTicketParaOperar`, D2): 404 si el actor no ve el ticket, 403
 *   si lo ve sin `BORRADO` sobre su tipo. Un ticket ya borrado es 404.
 * - En RESUELTO, CERRADO y CANCELADO solo lo borran ADMINISTRADOR y ROOT: para cualquier otro
 *   actor es el 422 de `TicketSoloComentariosError` (odd/cerrado-solo-comentarios, L11). Va antes
 *   que el de pendientes: en esos estados ese actor tampoco puede resolverlas.
 * - Si no, se borra salvo que tenga tareas pendientes (activas y sin completar) o
 *   compras vinculadas: 422 que nombra qué resolver (L40). Las tareas completadas,
 *   los adjuntos, los comentarios y el historial no frenan: quedan con el ticket.
 * - Un ticket de tipo PREVENTIVO no se borra, ni siquiera un administrador: 422 (L45). Lo genera el
 *   barrido a partir de un plan, y borrarlo haría que el barrido abra otro del mismo plan. Se
 *   evalúa después del acceso: sin `BORRADO` sobre el tipo, manda el 403.
 * - Solo se escribe `deleted_at`: el estado y el resto de los datos no cambian, y por eso la
 *   recuperación lo devuelve tal cual estaba.
 * - El borrado queda en el historial (`TICKET_BORRADO`, con autor y fecha), en la misma
 *   transacción, como entrada interna: la ve quien tiene `OBSERVAR` sobre el tipo (L45). Los chequeos corren dentro de ella, después de tomar el lock del ticket, para
 *   evaluar lo que ya escribió quien lo tenía: el estado se mira sobre el ticket releído, no
 *   sobre el cargado antes de la transacción.
 */
export class BorrarTicketUseCase {
  constructor(
    private readonly ticketRepo: Pick<
      ITicketRepository,
      'findById' | 'esVisiblePara' | 'bloquear' | 'borrarSiActivo'
    >,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findIdByCodigo'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    private readonly bloqueoRepo: Pick<IBloqueoTicketRepository, 'comprasVinculadas'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * @param dto Ticket y alcance del actor.
   * @returns Ok; 404 si no lo ve o ya está borrado; 403 sin `BORRADO`; 422 si es PREVENTIVO,
   *   si está resuelto, cerrado o cancelado y el actor no es administrador, o si tiene pendientes.
   */
  async execute(dto: BorrarTicketDto): Promise<Result<void, DomainError>> {
    const cargado = await cargarTicketParaOperar(this.ticketRepo, dto.ticketId, dto, 'BORRADO');
    if (cargado.isFail()) return Result.fail(cargado.getError());
    const ticket = cargado.getValue();
    if (ticket.tipoId === (await this.tipoTicketRepo.findIdByCodigo(TIPO_CODIGO_PREVENTIVO))) {
      return Result.fail(new TicketPreventivoNoBorrableError());
    }

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_BORRADO.BORRADO,
    );

    return this.txRunner.run(async (): Promise<Result<void, DomainError>> => {
      const actual = await bloquearTicketActivo(this.ticketRepo, ticket.id);
      if (!actual) return Result.fail(new TicketNoEncontradoError(ticket.id));
      const modificable = await verificarTicketModificable(
        this.estadoRepo,
        actual,
        esAlcanceDeAdministrador(dto),
      );
      if (modificable.isFail()) return Result.fail(modificable.getError());

      const [tareas, compras] = await Promise.all([
        this.tareaRepo.listarPorTicket(ticket.id),
        this.bloqueoRepo.comprasVinculadas(ticket.id),
      ]);
      const tareasPendientes = tareas.filter((tarea) => !tarea.completada).length;
      if (tareasPendientes > 0 || compras.length > 0) {
        return Result.fail(new TicketConPendientesNoBorrableError(tareasPendientes, compras));
      }

      if (!(await this.ticketRepo.borrarSiActivo(ticket.id, this.ahora()))) {
        return Result.fail(new TicketNoEncontradoError(ticket.id));
      }
      await this.operacionRepo.save(
        OperacionTicketEntity.create({
          ticketId: ticket.id,
          tipoOperacionId,
          descripcion: null,
          estadoAnteriorId: null,
          estadoNuevoId: null,
          autorId: dto.actorId,
          esInterno: true,
          metadata: null,
        }),
      );
      return Result.ok(undefined);
    });
  }
}
