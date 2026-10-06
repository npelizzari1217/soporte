/**
 * ReanudarPorComentarioListener — adapter @OnEvent que conecta `ticket.comentado` con la
 * reanudación automática de un ticket en ESPERANDO_CLIENTE (sdd/sla-primera-respuesta-y-pausa,
 * ADR-5, `ticket-esperando-cliente` R3).
 *
 * Se apoya en que `TicketComentadoEvent` se emite SOLO para comentarios públicos: un comentario
 * interno nunca llega acá. Recarga el ticket y exige estado ESPERANDO_CLIENTE y que el autor sea el
 * solicitante; entonces transiciona a EN_PROCESO por el arco normal (`actorEsCorrector: false`),
 * con el solicitante como autor, así que queda un CAMBIO_ESTADO real en el timeline y el reloj se
 * reanuda por la vía normal (`ticket.transicionado`).
 *
 * Log-and-swallow: el comentario ya comiteó. Un segundo comentario concurrente recibe
 * `TransicionInvalidaError` (el ticket ya no espera): se loguea y se ignora.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TicketComentadoEvent } from '../../domain/events/ticket-comentado.event';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { TransicionarEstadoUseCase } from '../../application/use-cases/transicionar-estado.use-case';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

@Injectable()
export class ReanudarPorComentarioListener {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly transicionar: Pick<TransicionarEstadoUseCase, 'execute'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  @OnEvent('ticket.comentado')
  async onTicketComentado(event: TicketComentadoEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket || ticket.isDeleted()) return;
      if (ticket.solicitanteId === null || ticket.solicitanteId !== event.autorId) return;

      const estado = await this.estadoRepo.findById(ticket.estadoId);
      if (estado?.codigo !== 'ESPERANDO_CLIENTE') return;

      const resultado = await this.transicionar.execute({
        ticketId: ticket.id,
        nuevoEstadoCodigo: 'EN_PROCESO',
        autorId: event.autorId,
        actorEsCorrector: false,
      });
      if (resultado.isFail()) {
        this.logger.error(
          `REANUDAR_POR_COMENTARIO_IGNORADO | ticket=${event.ticketId} | motivo=${resultado.getError().message}`,
        );
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(
        `REANUDAR_POR_COMENTARIO_ERROR | ticket=${event.ticketId} | error=${mensaje}`,
      );
    }
  }
}
