import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TIPO_OPERACION_BORRADO } from '../../domain/constants/tipos-operacion-borrado.constants';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  TicketNoEncontradoError,
  TicketsBorradosSoloAdministradorError,
} from '../../domain/errors/tickets.errors';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { resolverTipoOperacion } from '../services/tareas-ticket.reglas';
import { AlcanceActorTicket } from '../services/visibilidad-ticket';

/** Entrada de `RecuperarTicketUseCase`: el ticket y el alcance del actor, que lo carga la interface. */
export interface RecuperarTicketDto extends AlcanceActorTicket {
  ticketId: string;
}

/**
 * RecuperarTicketUseCase — deshace el borrado lógico de un ticket
 * (odd/tasks/permisos-por-tipo-ticket.md, S8, L41).
 *
 * - Solo ADMINISTRADOR y ROOT (alcance sin restricción): para cualquier otro actor es 403, antes
 *   de leer el ticket, así que no confirma si existe ni si está borrado.
 * - 404 si el ticket no existe o no está borrado.
 * - Limpia `deleted_at` y nada más: el ticket vuelve con el estado y los datos que tenía.
 * - La recuperación queda en el historial (`TICKET_RECUPERADO`, con autor y fecha), en la misma
 *   transacción, como entrada interna: la ve quien tiene `OBSERVAR` sobre el tipo
 *   (odd/tasks/permisos-por-tipo-ticket.md, L45).
 */
export class RecuperarTicketUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'recuperarSiBorrado'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * @param dto Ticket y alcance del actor.
   * @returns El ticket recuperado; 403 si el actor no es administrador; 404 si no está borrado.
   */
  async execute(dto: RecuperarTicketDto): Promise<Result<TicketEntity, DomainError>> {
    if (dto.permisosPorTipo !== null) {
      return Result.fail(new TicketsBorradosSoloAdministradorError());
    }
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || !ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_BORRADO.RECUPERADO,
    );

    const recuperado = await this.txRunner.run(async () => {
      if (!(await this.ticketRepo.recuperarSiBorrado(ticket.id, this.ahora()))) return false;
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
      return true;
    });
    if (!recuperado) return Result.fail(new TicketNoEncontradoError(ticket.id));

    const actual = await this.ticketRepo.findById(ticket.id);
    if (!actual) return Result.fail(new TicketNoEncontradoError(ticket.id));
    return Result.ok(actual);
  }
}
