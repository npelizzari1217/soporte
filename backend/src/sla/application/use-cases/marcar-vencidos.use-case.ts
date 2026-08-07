import { ISlaTicketQueryRepository } from '../../domain/ports/i-sla-ticket-query.repository';
import { SlaVencidoEvent } from '../../domain/events/sla-vencido.event';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * MarcarVencidosUseCase — barrido de vencimiento de SLA (S4, S6). Marca
 * `vencido=true` en todos los tickets vencibles del tenant ACTIVO
 * (`TenantContext` — el binding por tenant lo resuelve el caller,
 * `SlaSweepScheduler`/`ITenantEnumerator`, SB5/SB6) y emite `sla.vencido`
 * por cada uno.
 *
 * S6 (sin auto-escalado): este use case SOLO marca `vencido` + emite el
 * evento — nunca toca `prioridadId` (el puerto `ISlaTicketQueryRepository`
 * no expone superficie de escritura de prioridad, invariante estructural).
 *
 * Aislamiento por ticket: un fallo al marcar UN ticket no aborta el resto
 * del barrido — se registra como no-marcado y se continúa (mismo criterio
 * de aislamiento que el barrido multi-tenant, ADR-P3, pero a nivel de fila).
 *
 * Ref spec: sdd/premium/spec S4, S6. Ref design: ADR-P3, ADR-P4. Tarea: SB1.
 */
export class MarcarVencidosUseCase {
  constructor(
    private readonly slaTicketQueryRepo: Pick<
      ISlaTicketQueryRepository,
      'findVencibles' | 'marcarVencido'
    >,
    private readonly eventPublisher: IDomainEventPublisher,
  ) {}

  /** @returns la cantidad de tickets efectivamente marcados como vencidos. */
  async execute(): Promise<number> {
    const vencibles = await this.slaTicketQueryRepo.findVencibles(new Date());

    let marcados = 0;
    for (const ticket of vencibles) {
      try {
        await this.slaTicketQueryRepo.marcarVencido(ticket.id);
      } catch {
        // Aislamiento por ticket: un fallo de persistencia en ESTE ticket no
        // aborta el resto del barrido — se omite su evento y se continúa.
        continue;
      }
      marcados += 1;

      try {
        this.eventPublisher.publish(
          new SlaVencidoEvent({
            ticketId: ticket.id,
            asignadoId: ticket.asignadoId,
            solicitanteId: ticket.solicitanteId,
          }),
        );
      } catch {
        // log-and-swallow (ADR-6): el ticket ya quedó marcado vencido=true;
        // un fallo del publisher no revierte el marcado.
      }
    }

    return marcados;
  }
}
