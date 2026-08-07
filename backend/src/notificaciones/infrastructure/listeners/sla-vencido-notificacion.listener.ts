/**
 * SlaVencidoNotificacionListener — adapter @OnEvent que conecta
 * `sla.vencido` (S4, `MarcarVencidosUseCase`/PR-SLA-2) con el envío de email
 * al ASIGNADO + ADMINISTRADORES del tenant (N3/N4). Diferido de PR-SLA-2
 * (SB7/SB8) — entregado en esta corrida junto al resto de PR-N.
 *
 * ALS/TenantContext (ADR-P8): el job SLA (`SlaSweepScheduler`) emite el
 * evento DENTRO de `tenantContext.run()` — este handler corre
 * sincrónicamente en ese mismo call-stack y hereda el `clienteId` activo,
 * usado para `resolverAdministradores`. Si por algún motivo no hay
 * TenantContext activo (defensivo, no debería ocurrir en el flujo real), se
 * omite la resolución de administradores sin fallar el resto.
 *
 * Aislamiento por-destinatario (N4): cada `send()` (asignado, cada
 * administrador) se envuelve en su propio try/catch — un destinatario que
 * falla NUNCA bloquea el envío a los demás. El handler completo además está
 * envuelto en try/catch total (ADR-6): un fallo inesperado (ej. el ticket no
 * carga) NUNCA se propaga hacia el emisor síncrono del evento.
 *
 * Ref spec: sdd/premium/spec S4, N3, N4. Ref design: ADR-P4, ADR-P8. Tarea: SB7/SB8.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { SlaVencidoEvent } from '../../../sla/domain/events/sla-vencido.event';
import {
  ContactoUsuario,
  IUsuarioContactoResolver,
} from '../../domain/ports/i-usuario-contacto-resolver';
import { EmailMessage, IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { templateSlaVencido } from '../../domain/templates/email-templates';
import { TenantContext } from '../../../shared/tenancy/tenant-context';

@Injectable()
export class SlaVencidoNotificacionListener {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly contactoResolver: Pick<
      IUsuarioContactoResolver,
      'resolverContacto' | 'resolverAdministradores'
    >,
    private readonly emailSender: Pick<IEmailSender, 'send'>,
    private readonly tenantContext: Pick<TenantContext, 'get'>,
  ) {}

  @OnEvent('sla.vencido')
  async onSlaVencido(event: SlaVencidoEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket) {
        return;
      }

      const plantilla = templateSlaVencido({
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: process.env.APP_BASE_URL ?? '',
      });

      const destinatarios: ContactoUsuario[] = [];

      if (event.asignadoId) {
        const contactoAsignado = await this.contactoResolver.resolverContacto(event.asignadoId);
        if (contactoAsignado) {
          destinatarios.push(contactoAsignado);
        }
      }

      const clienteId = this.tenantContext.get()?.clienteId;
      if (clienteId) {
        const administradores = await this.contactoResolver.resolverAdministradores(clienteId);
        destinatarios.push(...administradores);
      }

      await Promise.all(
        destinatarios.map((destinatario) => this.enviarSeguro(destinatario, plantilla)),
      );
    } catch {
      // log-and-swallow (ADR-6): un fallo inesperado (ej. el ticket no
      // carga) nunca se propaga hacia el job SLA que emitió el evento.
    }
  }

  /**
   * Envía a UN destinatario con aislamiento total (N4): un fallo de
   * transporte para este destinatario NUNCA impide el envío a los demás.
   */
  private async enviarSeguro(
    destinatario: ContactoUsuario,
    plantilla: Omit<EmailMessage, 'to'>,
  ): Promise<void> {
    try {
      await this.emailSender.send({ to: destinatario.email, ...plantilla });
    } catch {
      // log-and-swallow por-destinatario (N4): el resto de los envíos sigue.
    }
  }
}
