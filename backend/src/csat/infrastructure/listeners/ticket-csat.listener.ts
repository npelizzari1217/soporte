/**
 * TicketCsatListener — adapter @OnEvent que conecta `ticket.estado_cambiado`
 * con la emisión de la encuesta de satisfacción (WU6, tarea 6.2).
 *
 * Filtro PROPIO y deliberado: `estadoNuevoCodigo === 'CERRADO'`.
 * `esEstadoNotificable` (tickets/domain/policies) NO se reusa acá — esa
 * política también dispara en `RESUELTO` (notificaciones de N3), y reusarla
 * mandaría encuestas de tickets que todavía no cerraron.
 *
 * Orden de los lookups, cortando lo antes posible:
 * 1. Filtro de estado (sin tocar ningún repo si no es CERRADO).
 * 2. `TenantContext.get().clienteId` — el mismo tenant que cerró el ticket
 *    (el handler corre síncrono en el call-stack de `emit()`, ADR-P8).
 * 3. `CLIENTE_REPOSITORY.findById` → si `csatHabilitado` es falso, no emite.
 * 4. `TICKET_REPOSITORY.findById` → numero/titulo/solicitanteId (el evento
 *    no lleva PII, mismo criterio que `TicketNotificacionListener`).
 * 5. `IContactoSolicitanteResolver.resolver` → email del solicitante (registrado o externo).
 * 6. `EmitirEncuestaUseCase.ejecutar` — revoca previos, genera y persiste el
 *    token, envía el mail.
 *
 * Log-and-swallow total: un fallo en cualquier paso (incluido el envío del
 * mail dentro del use case) NUNCA se propaga hacia el emisor síncrono — la
 * transición de estado ya committeó. Se loguea (no catch vacío) para que el
 * fallo quede visible sin voltear el cierre.
 *
 * Ref spec: sdd/csat/spec, Requirement "Emisión de token al cierre del
 * ticket" (escenario "Transición a RESUELTO no emite"), "Fallo de mail no
 * revierte el cierre". Ref design: flujo de datos, ADR-C3. Tarea: 6.2.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { TicketEstadoCambiadoEvent } from '../../../tickets/domain/events/ticket-estado-cambiado.event';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IContactoSolicitanteResolver } from '../../../notificaciones/domain/ports/i-contacto-solicitante-resolver';
import { EmitirEncuestaUseCase } from '../../application/use-cases/emitir-encuesta.use-case';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { entorno } from '../../../config/entorno';

/** Único estado que dispara la emisión (filtro propio — ver JSDoc de la clase). */
const ESTADO_CERRADO = 'CERRADO';

@Injectable()
export class TicketCsatListener {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    private readonly contactoResolver: Pick<IContactoSolicitanteResolver, 'resolver'>,
    private readonly emitirEncuestaUseCase: Pick<EmitirEncuestaUseCase, 'ejecutar'>,
    private readonly tenantContext: Pick<TenantContext, 'get'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  /**
   * Maneja `ticket.estado_cambiado`: si el nuevo estado es CERRADO y el
   * cliente tiene CSAT habilitado, emite la encuesta de satisfacción al
   * solicitante (ver JSDoc de la clase para el orden completo de lookups).
   *
   * @param event Evento de cambio de estado (sin PII — solo IDs y códigos).
   * @returns No devuelve nada; cualquier fallo se loguea y se traga (ver
   *   JSDoc de la clase), nunca se propaga hacia el emisor síncrono.
   */
  @OnEvent('ticket.estado_cambiado')
  async onTicketEstadoCambiado(event: TicketEstadoCambiadoEvent): Promise<void> {
    if (event.estadoNuevoCodigo !== ESTADO_CERRADO) {
      return;
    }

    try {
      const clienteId = this.tenantContext.get()?.clienteId;
      if (!clienteId) {
        return;
      }

      const cliente = await this.clienteRepo.findById(clienteId);
      if (!cliente?.csatHabilitado) {
        return;
      }

      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket) {
        return;
      }

      const contacto = await this.contactoResolver.resolver(ticket);
      if (!contacto) {
        return;
      }

      await this.emitirEncuestaUseCase.ejecutar({
        clienteId,
        ticketId: ticket.id,
        numeroTicket: ticket.numero,
        tituloTicket: ticket.titulo,
        destinatarioEmail: contacto.email,
        appBaseUrl: entorno.APP_BASE_URL,
      });
    } catch (err) {
      // log-and-swallow: un fallo acá (incluido el envío del mail) nunca
      // revierte ni afecta el cierre del ticket ya committeado.
      this.logger.error(
        `TicketCsatListener: fallo al emitir la encuesta de satisfacción (ticketId=${event.ticketId}): ${String(err)}`,
      );
    }
  }
}
