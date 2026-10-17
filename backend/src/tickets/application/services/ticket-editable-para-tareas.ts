import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TareaTicketNoEditableError } from '../../domain/errors/tareas.errors';
import { IBloqueoTicketRepository } from '../../domain/ports/i-bloqueo-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';

/**
 * Estados en los que las tareas del ticket pasan a solo lectura (odd/ticket-cerrado-solo-lectura,
 * S1). RESUELTO queda fuera a propósito (decisión L2): descompletar una tarea de un ticket
 * RESUELTO lo devuelve a EN_PROCESO (odd/estado-por-tareas, S4), y eso tiene que seguir
 * pudiéndose.
 */
export const ESTADOS_SIN_CAMBIOS_DE_TAREAS: Readonly<Record<string, 'cerrado' | 'cancelado'>> = {
  CERRADO: 'cerrado',
  CANCELADO: 'cancelado',
};

/**
 * Decide si un ticket acepta cambios en sus tareas. Corre DESPUÉS de la autorización del actor:
 * un 404/403 sigue mandando antes que el 422 de esta regla, y la regla no tiene excepción por
 * rol (ROOT tampoco).
 */
export class VerificadorTicketEditable {
  constructor(
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly bloqueoRepo: Pick<IBloqueoTicketRepository, 'estaBloqueadoPorCompra'>,
  ) {}

  async verificar(ticket: TicketEntity): Promise<Result<void, DomainError>> {
    // Catálogo FIJO garantizado por el seed: su ausencia es un bug de infraestructura, no un
    // error del caller (mismo throw defensivo que `CrearComentarioUseCase`).
    const estado = await this.estadoRepo.findById(ticket.estadoId);
    if (!estado) {
      throw new Error(
        `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
      );
    }
    const motivo = ESTADOS_SIN_CAMBIOS_DE_TAREAS[estado.codigo];
    if (motivo) return Result.fail(new TareaTicketNoEditableError(motivo));

    if (await this.bloqueoRepo.estaBloqueadoPorCompra(ticket.id)) {
      return Result.fail(new TareaTicketNoEditableError('bloqueado'));
    }
    return Result.ok(undefined);
  }
}
