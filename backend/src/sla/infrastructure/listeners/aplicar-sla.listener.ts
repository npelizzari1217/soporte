/**
 * AplicarSlaListener — adapter @OnEvent que conecta `ticket.creado`/
 * `ticket.reprioritizado` (Fase 2, aditivo GATE G3) con `AplicarSlaUseCase`
 * (S2/S3).
 *
 * ALS/TenantContext (ADR-P8): el handler de EventEmitter2 corre
 * SINCRÓNICAMENTE en el call-stack de `emit()` — hereda el TenantContext del
 * scope emisor (request HTTP de CrearTicket/EditarTicket, o
 * `tenantContext.run()` del job de barrido SLA — aunque este listener en
 * particular solo se dispara desde altas/ediciones HTTP). Por eso los repos
 * inyectados en `AplicarSlaUseCase` (vía `TenantContext.getClient()`) ven el
 * tenant correcto sin recibirlo explícitamente.
 *
 * Log-and-swallow (ADR-6): un fallo del use case NUNCA debe propagarse hacia
 * el emisor síncrono — la creación/edición del ticket ya committeó. Desde
 * D10 (sdd/feriados-configurables WU5a) el fallo se loguea vía el puerto
 * `ILogger` (`logger.error`, mismo puerto/nivel que usa el barrido de SLA en
 * `sla-sweep.scheduler.ts:55-56`) en vez de swallowear en silencio total.
 *
 * Ref spec: sdd/premium/spec S2, S3; sdd/feriados-configurables "A failed
 * SLA calculation is logged, not silent". Ref design: ADR-P2, ADR-P8, D10.
 * Tarea: SA13, 5.3.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AplicarSlaUseCase } from '../../application/use-cases/aplicar-sla.use-case';
import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';
import { TicketReprioritizadoEvent } from '../../../tickets/domain/events/ticket-reprioritizado.event';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

@Injectable()
export class AplicarSlaListener {
  constructor(
    private readonly aplicarSlaUseCase: Pick<AplicarSlaUseCase, 'alCrear' | 'alReprioritizar'>,
    private readonly logger: ILogger,
  ) {}

  @OnEvent('ticket.creado')
  async onTicketCreado(event: TicketCreadoEvent): Promise<void> {
    try {
      await this.aplicarSlaUseCase.alCrear({
        ticketId: event.ticketId,
        prioridadId: event.prioridadId,
      });
    } catch (error) {
      // log-and-swallow (ADR-6): un fallo del cálculo de SLA nunca revierte
      // ni afecta la creación del ticket ya committeada, pero desde D10
      // queda registrado (nunca silencioso del todo).
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(
        `SLA_APLICAR_ERROR | evento=ticket.creado | ticket=${event.ticketId} | error=${mensaje}`,
      );
    }
  }

  @OnEvent('ticket.reprioritizado')
  async onTicketReprioritizado(event: TicketReprioritizadoEvent): Promise<void> {
    try {
      await this.aplicarSlaUseCase.alReprioritizar({
        ticketId: event.ticketId,
        prioridadId: event.prioridadId,
      });
    } catch (error) {
      // log-and-swallow (ADR-6), con registro vía ILogger desde D10.
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(
        `SLA_APLICAR_ERROR | evento=ticket.reprioritizado | ticket=${event.ticketId} | error=${mensaje}`,
      );
    }
  }
}
