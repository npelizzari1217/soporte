/**
 * TicketNotificacionListener — adapter @OnEvent que conecta
 * `ticket.estado_cambiado`/`ticket.comentado` (Fase 2, ADR-6) con el envío de
 * email. El cambio de estado va al SOLICITANTE del ticket (N3); el comentario
 * público, a la contraparte de quien comentó (ver `onTicketComentado`).
 *
 * Flujo por evento: carga el ticket (`TICKET_REPOSITORY`, para
 * numero/titulo/solicitante — el evento NO lleva PII) → resuelve el
 * contacto del solicitante, registrado o externo (`IContactoSolicitanteResolver`) → si no resuelve
 * (usuario sin email/soft-deleted) se OMITE el envío (N4, no falla el
 * resto) → arma el `EmailMessage` con la plantilla correspondiente →
 * `IEmailSender.send()`.
 *
 * ALS/TenantContext (ADR-P8): el handler corre SINCRÓNICAMENTE en el
 * call-stack de `emit()` — hereda el TenantContext del scope emisor
 * (request HTTP de TransicionarEstado/CrearComentario), por lo que
 * `TICKET_REPOSITORY.findById` ve el tenant correcto.
 *
 * Log-and-swallow total (ADR-6): un fallo en cualquier paso NUNCA se
 * propaga hacia el emisor síncrono — la transición/comentario ya committeó.
 *
 * Ref spec: sdd/premium/spec N3, N4. Ref design: ADR-P8. Tarea: N7/N8.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { TicketEstadoCambiadoEvent } from '../../../tickets/domain/events/ticket-estado-cambiado.event';
import { TicketComentadoEvent } from '../../../tickets/domain/events/ticket-comentado.event';
import { IContactoSolicitanteResolver } from '../../domain/ports/i-contacto-solicitante-resolver';
import {
  ContactoUsuario,
  IUsuarioContactoResolver,
} from '../../domain/ports/i-usuario-contacto-resolver';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import {
  templateCambioEstado,
  templateComentarioPublico,
  templateEsperandoCliente,
} from '../../domain/templates/email-templates';
import { entorno } from '../../../config/entorno';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

@Injectable()
export class TicketNotificacionListener {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly contactoResolver: Pick<IContactoSolicitanteResolver, 'resolver'>,
    private readonly emailSender: Pick<IEmailSender, 'send'>,
    private readonly logger: Pick<ILogger, 'error'>,
    private readonly usuarioResolver: Pick<
      IUsuarioContactoResolver,
      'resolverContacto' | 'resolverAdministradores'
    >,
    private readonly tenantContext: Pick<TenantContext, 'get'>,
  ) {}

  /**
   * Maneja `ticket.estado_cambiado`: notifica por email al solicitante del
   * ticket sobre el cambio de estado (ver JSDoc de la clase para el flujo
   * completo: carga de ticket, resolución de contacto y plantilla).
   *
   * @param event Evento de cambio de estado (sin PII — solo IDs y códigos).
   * @returns No devuelve nada; si no hay ticket o no se resuelve el
   *   contacto, se omite el envío sin fallar (N4). Cualquier otro fallo se
   *   loguea y se traga (ADR-6), nunca se propaga hacia el emisor síncrono.
   */
  @OnEvent('ticket.estado_cambiado')
  async onTicketEstadoCambiado(event: TicketEstadoCambiadoEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket) {
        return;
      }

      const contacto = await this.contactoResolver.resolver(ticket);
      if (!contacto) {
        if (event.estadoNuevoCodigo === 'ESPERANDO_CLIENTE') {
          this.logger.error(
            `TicketNotificacionListener: el solicitante no tiene correo, no se envía el aviso de espera (ticketId=${event.ticketId})`,
          );
        }
        return;
      }

      const base = {
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: entorno.APP_BASE_URL,
        sinLink: contacto.esExterno,
      };
      // Al entrar a la espera el mail es el de espera (ticket-esperando-cliente R4), no el genérico.
      const plantilla =
        event.estadoNuevoCodigo === 'ESPERANDO_CLIENTE'
          ? templateEsperandoCliente(base)
          : templateCambioEstado({
              ...base,
              estadoAnteriorCodigo: event.estadoAnteriorCodigo,
              estadoNuevoCodigo: event.estadoNuevoCodigo,
            });

      await this.emailSender.send({ to: contacto.email, ...plantilla });
    } catch (err) {
      // log-and-swallow (ADR-6): un fallo acá nunca revierte ni afecta la
      // transición de estado ya committeada. Se loguea (no catch vacío) para
      // que el fallo quede visible sin voltear la transición.
      this.logger.error(
        `TicketNotificacionListener: fallo al notificar cambio de estado (ticketId=${event.ticketId}): ${String(err)}`,
      );
    }
  }

  /**
   * Maneja `ticket.comentado` (comentario público): avisa a la CONTRAPARTE de quien comentó
   * (odd/tasks/pedidos-2026-10-26.md, S1-S2).
   *
   * - Comenta el solicitante → el técnico asignado; sin asignado, los administradores del tenant.
   * - Comenta otro (técnico, administrador, integración) → el solicitante.
   * - Nadie recibe aviso de su propio comentario.
   *
   * @param event Evento de comentario (sin PII — solo IDs).
   * @returns No devuelve nada. Un destinatario sin contacto se omite, un envío que falla se loguea
   *   sin frenar a los demás, y ningún fallo se propaga hacia el emisor síncrono (ADR-6).
   */
  @OnEvent('ticket.comentado')
  async onTicketComentado(event: TicketComentadoEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket) {
        return;
      }
      const datos = {
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: entorno.APP_BASE_URL,
      };

      if (ticket.solicitanteId !== null && ticket.solicitanteId === event.autorId) {
        const destinatarios = await this.equipoDelTicket(ticket.asignadoId, event.autorId);
        for (const destinatario of destinatarios) {
          await this.enviarAislado(event.ticketId, {
            to: destinatario.email,
            ...templateComentarioPublico({ ...datos, sinLink: false }),
          });
        }
        return;
      }

      const contacto = await this.contactoResolver.resolver(ticket);
      if (!contacto) {
        return;
      }
      await this.emailSender.send({
        to: contacto.email,
        ...templateComentarioPublico({ ...datos, sinLink: contacto.esExterno }),
      });
    } catch (err) {
      // log-and-swallow (ADR-6): un fallo acá nunca revierte ni afecta el
      // comentario ya persistido. Se loguea (no catch vacío) para que el
      // fallo quede visible sin voltear el comentario.
      this.logger.error(
        `TicketNotificacionListener: fallo al notificar comentario (ticketId=${event.ticketId}): ${String(err)}`,
      );
    }
  }

  /**
   * Quién atiende el ticket del lado del soporte: el asignado o, sin asignado, los administradores
   * del tenant activo. Sin el autor y sin direcciones repetidas.
   */
  private async equipoDelTicket(
    asignadoId: string | null,
    autorId: string,
  ): Promise<ContactoUsuario[]> {
    if (asignadoId !== null) {
      if (asignadoId === autorId) return [];
      const asignado = await this.usuarioResolver.resolverContacto(asignadoId);
      return asignado ? [asignado] : [];
    }
    const clienteId = this.tenantContext.get()?.clienteId;
    if (clienteId === undefined) return [];
    const [administradores, autor] = await Promise.all([
      this.usuarioResolver.resolverAdministradores(clienteId),
      this.usuarioResolver.resolverContacto(autorId),
    ]);
    const vistos = new Set<string>(autor ? [autor.email.toLowerCase()] : []);
    return administradores.filter((admin) => {
      const clave = admin.email.toLowerCase();
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  }

  /** Un envío que falla se loguea sin frenar al siguiente destinatario. */
  private async enviarAislado(
    ticketId: string,
    mensaje: Parameters<IEmailSender['send']>[0],
  ): Promise<void> {
    try {
      await this.emailSender.send(mensaje);
    } catch {
      // Sin el error crudo: puede traer la dirección del destinatario.
      this.logger.error(
        `TicketNotificacionListener: fallo al avisar el comentario a un destinatario (ticketId=${ticketId})`,
      );
    }
  }
}
