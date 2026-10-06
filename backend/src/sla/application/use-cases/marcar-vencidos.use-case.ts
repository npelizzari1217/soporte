import { ISlaTicketQueryRepository } from '../../domain/ports/i-sla-ticket-query.repository';
import { IRelojSlaRepository } from '../../domain/ports/i-reloj-sla.repository';
import { ConsolidarRelojSlaUseCase } from './consolidar-reloj-sla.use-case';
import { SlaVencidoEvent } from '../../domain/events/sla-vencido.event';
import { SlaPrimeraRespuestaVencidaEvent } from '../../domain/events/sla-primera-respuesta-vencida.event';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

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
 * sdd/sla-primera-respuesta-y-pausa (ADR-4, sla-reloj-activo R4): el barrido corre en tres pasos.
 * 1. Reconcilia los `sla_reloj_pendiente` (huérfano de pausa: falló el listener). Un pendiente que no
 *    se pudo reconciliar sigue pendiente y el paso 2 lo excluye, para no marcar con un vencimiento viejo.
 * 2. Marca vencidos solo con el reloj corriendo (`ESTADOS_RELOJ_CORRE`, que incluye a los previos). El
 *    evento sale solo si el `updateMany` afectó 1 fila: una marca ya puesta permanece y no se re-notifica.
 *
 * 3. Marca las primeras respuestas vencidas (ADR-6, `sla-primera-respuesta` R4). Sin pausa: la espera no
 *    las excluye. Mismo criterio que el paso 2: evento solo si el CAS afectó 1 fila.
 *
 * Ref spec: sdd/premium/spec S4, S6. Ref design: ADR-P3, ADR-P4. Tarea: SB1.
 */
export class MarcarVencidosUseCase {
  constructor(
    private readonly relojRepo: Pick<IRelojSlaRepository, 'findPendientes'>,
    private readonly consolidar: Pick<ConsolidarRelojSlaUseCase, 'execute'>,
    private readonly slaTicketQueryRepo: Pick<
      ISlaTicketQueryRepository,
      | 'findVencibles'
      | 'marcarVencido'
      | 'findPrimerasRespuestasVencidas'
      | 'marcarPrimeraRespuestaVencida'
    >,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  /** @returns la cantidad de tickets efectivamente marcados como vencidos (resolución). */
  async execute(): Promise<number> {
    for (const ticketId of await this.relojRepo.findPendientes()) {
      try {
        await this.consolidar.execute(ticketId);
      } catch {
        // Aislamiento por ticket: sigue pendiente y el paso 2 no lo marca.
      }
    }

    const ahora = new Date();
    const vencibles = await this.slaTicketQueryRepo.findVencibles(ahora);

    let marcados = 0;
    for (const ticket of vencibles) {
      try {
        if (!(await this.slaTicketQueryRepo.marcarVencido(ticket.id))) continue;
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

    try {
      await this.barrerPrimerasRespuestas(ahora);
    } catch (error) {
      // Aislamiento del paso 3: un fallo de la búsqueda no rechaza el barrido ya hecho en el paso 2.
      this.logger.error(`SLA_PRIMERA_RESPUESTA_BARRIDO_FALLO | ${String(error)}`);
    }

    return marcados;
  }

  /** Paso 3. Aislado del paso 2: un fallo acá no cambia el conteo de resolución ni lo aborta. */
  private async barrerPrimerasRespuestas(ahora: Date): Promise<void> {
    const vencidas = await this.slaTicketQueryRepo.findPrimerasRespuestasVencidas(ahora);
    for (const ticket of vencidas) {
      try {
        if (!(await this.slaTicketQueryRepo.marcarPrimeraRespuestaVencida(ticket.id))) continue;
      } catch {
        continue;
      }
      try {
        this.eventPublisher.publish(
          new SlaPrimeraRespuestaVencidaEvent({
            ticketId: ticket.id,
            asignadoId: ticket.asignadoId,
            solicitanteId: ticket.solicitanteId,
          }),
        );
      } catch {
        // log-and-swallow (ADR-6): el ticket ya quedó marcado; el publisher no revierte el marcado.
      }
    }
  }
}
