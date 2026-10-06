/**
 * RelojSlaListener — adapter @OnEvent que conecta `ticket.transicionado` (post-commit, solo si la
 * transición afecta el reloj) con `ConsolidarRelojSlaUseCase` (sdd/sla-primera-respuesta-y-pausa, ADR-3).
 *
 * Log-and-swallow: un fallo nunca vuelve al emisor (la transición ya comiteó); el ticket queda con
 * `sla_reloj_pendiente` y el barrido lo reconcilia.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConsolidarRelojSlaUseCase } from '../../application/use-cases/consolidar-reloj-sla.use-case';
import { TicketTransicionadoEvent } from '../../../tickets/domain/events/ticket-transicionado.event';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

@Injectable()
export class RelojSlaListener {
  constructor(
    private readonly consolidar: Pick<ConsolidarRelojSlaUseCase, 'execute'>,
    private readonly logger: ILogger,
  ) {}

  @OnEvent('ticket.transicionado')
  async onTicketTransicionado(event: TicketTransicionadoEvent): Promise<void> {
    try {
      await this.consolidar.execute(event.ticketId);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`SLA_RELOJ_ERROR | ticket=${event.ticketId} | error=${mensaje}`);
    }
  }
}
