/**
 * TicketAsignadoNotificacionListener — adapter `@OnEvent` que conecta `ticket.asignado`
 * (`TicketAsignadoEvent`, publicado post-commit por las altas con regla y por la asignación manual)
 * con el mail a la persona asignada (`notificacion-asignacion` N2). Molde:
 * `PreventivoGeneradoNotificacionListener`.
 *
 * - El mail sale siempre, también en la autoasignación (N3): no hay rama de omisión por actor.
 * - El evento lleva solo ids: el listener carga ticket, tipo, prioridad y contacto (N6). El
 *   `TenantContext` lo hereda del alcance abierto por quien publicó (petición HTTP, formulario
 *   público o barrido de preventivos).
 * - Sin correo configurado el emisor ya registra `EMAIL_CLIENTE_SIN_CONFIG` y no lanza (N4).
 * - Aislamiento total (N5): el handler nunca propaga una excepción. Los logs llevan el `ticketId`
 *   y un código; nunca la dirección, el nombre ni el error crudo.
 * - No deduplica contra `preventivo.generado` (N7).
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { IPrioridadRepository } from '../../../tickets/domain/ports/i-prioridad.repository';
import { TicketAsignadoEvent } from '../../../tickets/domain/events/ticket-asignado.event';
import { IUsuarioContactoResolver } from '../../domain/ports/i-usuario-contacto-resolver';
import { IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { templateTicketAsignado } from '../../domain/templates/email-templates';
import { entorno } from '../../../config/entorno';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

@Injectable()
export class TicketAsignadoNotificacionListener {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly tipoRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findById'>,
    private readonly contactoResolver: Pick<IUsuarioContactoResolver, 'resolverContacto'>,
    private readonly emailSender: Pick<IEmailSender, 'send'>,
    private readonly logger: Pick<ILogger, 'log' | 'error'>,
  ) {}

  /**
   * Maneja `ticket.asignado`: avisa por mail a la persona asignada. Nunca lanza (N5).
   *
   * @param event Evento de asignación (solo ids y origen).
   */
  @OnEvent('ticket.asignado')
  async onTicketAsignado(event: TicketAsignadoEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket) {
        this.logger.log(`TICKET_ASIGNADO_SIN_TICKET (ticketId=${event.ticketId})`);
        return;
      }

      const contacto = await this.contactoResolver.resolverContacto(event.asignadoId);
      if (!contacto) {
        this.logger.log(`TICKET_ASIGNADO_SIN_CONTACTO (ticketId=${event.ticketId})`);
        return;
      }

      const [tipo, prioridad] = await Promise.all([
        this.tipoRepo.findById(ticket.tipoId),
        this.prioridadRepo.findById(ticket.prioridadId),
      ]);

      const plantilla = templateTicketAsignado({
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: entorno.APP_BASE_URL,
        origen: event.origen,
        tipoNombre: tipo?.nombre ?? null,
        prioridadNombre: prioridad?.nombre ?? null,
      });

      await this.emailSender.send({ to: contacto.email, ...plantilla });
    } catch {
      // Log-and-swallow (N5): sin el error crudo, que puede traer la dirección del destinatario.
      this.logger.error(`TICKET_ASIGNADO_FALLO_NOTIFICACION (ticketId=${event.ticketId})`);
    }
  }
}
