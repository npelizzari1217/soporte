/**
 * PreventivoGeneradoNotificacionListener — adapter `@OnEvent` que conecta
 * `preventivo.generado` ([R11], `GenerarPreventivosUseCase`/WU-5-WU-6) con el
 * envío de email al RESPONSABLE del plan + ADMINISTRADORES del tenant.
 * Calcado de `SlaVencidoNotificacionListener` (S4, N3/N4).
 *
 * ALS/TenantContext (ADR-P8): el barrido (`PreventivoSweepScheduler` →
 * `GenerarPreventivosUseCase`) emite el evento vía
 * `txRunner.alCommitear()`, que corre DENTRO del `tenantContext.run()`
 * abierto por el scheduler para ese tenant — este handler hereda el
 * `clienteId` activo, usado para `resolverAdministradores`. Si no hay
 * TenantContext activo (defensivo, no debería ocurrir en el flujo real), se
 * omite la resolución de administradores sin fallar el resto.
 *
 * Aislamiento por-destinatario (N4): cada `send()` (responsable, cada
 * administrador) se envuelve en su propio try/catch — un destinatario que
 * falla NUNCA bloquea el envío a los demás. El handler completo además está
 * envuelto en try/catch total (ADR-6): un fallo inesperado (ej. el ticket no
 * carga) NUNCA se propaga hacia el emisor síncrono del evento — y por lo
 * tanto NUNCA aborta el ciclo de generación que lo disparó (6.3).
 *
 * `preventivo.recordatorio` (odd/preventivo-anticipacion S4) entra por el
 * mismo adapter porque comparte los colaboradores y el envío aislado: va SOLO
 * al responsable que trae el evento (el actual del plan), nunca a los
 * administradores ni al asignado del ticket.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Notificación solo al generar".
 * Ref design: ADR-PV2 (flujo de datos), ADR-P8. Tarea: 6.2.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { PreventivoGeneradoEvent } from '../../../preventivo/domain/events/preventivo-generado.event';
import { PreventivoRecordatorioEvent } from '../../../preventivo/domain/events/preventivo-recordatorio.event';
import {
  ContactoUsuario,
  IUsuarioContactoResolver,
} from '../../domain/ports/i-usuario-contacto-resolver';
import { EmailMessage, IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import {
  templatePreventivoGenerado,
  templatePreventivoRecordatorio,
} from '../../domain/templates/email-templates';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { entorno } from '../../../config/entorno';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

@Injectable()
export class PreventivoGeneradoNotificacionListener {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly contactoResolver: Pick<
      IUsuarioContactoResolver,
      'resolverContacto' | 'resolverAdministradores'
    >,
    private readonly emailSender: Pick<IEmailSender, 'send'>,
    private readonly tenantContext: Pick<TenantContext, 'get'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  /**
   * Maneja `preventivo.generado`: notifica por email al responsable del plan
   * y a los administradores del tenant activo sobre el ticket de
   * mantenimiento recién generado (ver JSDoc de la clase para ALS/TenantContext
   * y aislamiento por-destinatario).
   *
   * @param event Evento de generación de preventivo (sin PII — solo IDs).
   * @returns No devuelve nada; el envío a cada destinatario se aísla en
   *   `enviarSeguro` (N4), y cualquier fallo inesperado del handler completo
   *   se loguea y se traga (ADR-6), nunca se propaga hacia el barrido.
   */
  @OnEvent('preventivo.generado')
  async onPreventivoGenerado(event: PreventivoGeneradoEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket) {
        return;
      }

      const plantilla = templatePreventivoGenerado({
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: entorno.APP_BASE_URL,
        // S3 (odd/preventivo-anticipacion): la fecha del ciclo del plan.
        fechaObjetivo: ticket.fechaObjetivo,
      });

      const destinatarios: ContactoUsuario[] = [];

      const contactoResponsable = await this.contactoResolver.resolverContacto(event.responsableId);
      if (contactoResponsable) {
        destinatarios.push(contactoResponsable);
      }

      const clienteId = this.tenantContext.get()?.clienteId;
      if (clienteId) {
        const administradores = await this.contactoResolver.resolverAdministradores(clienteId);
        destinatarios.push(...administradores);
      }

      await Promise.all(
        destinatarios.map((destinatario) => this.enviarSeguro(destinatario, plantilla)),
      );
    } catch (err) {
      // log-and-swallow (ADR-6): un fallo inesperado (ej. el ticket no
      // carga) nunca se propaga hacia el barrido que emitió el evento. Se
      // loguea (no catch vacío) para que el fallo quede visible sin abortar
      // el ciclo de generación (6.3).
      this.logger.error(
        `PreventivoGeneradoNotificacionListener: fallo al notificar generación de preventivo (ticketId=${event.ticketId}): ${String(err)}`,
      );
    }
  }

  /**
   * Maneja `preventivo.recordatorio` (S4): un correo al responsable del
   * evento, la víspera de la fecha objetivo. El reclamo ya marcó el ticket
   * antes de publicar, así que un fallo acá no se reintenta: se loguea.
   *
   * @param event Recordatorio reclamado por el barrido (sin PII — solo IDs).
   * @returns No devuelve nada; todo fallo se loguea y se traga (ADR-6).
   */
  @OnEvent('preventivo.recordatorio')
  async onPreventivoRecordatorio(event: PreventivoRecordatorioEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket || !ticket.fechaObjetivo) {
        return;
      }

      const contacto = await this.contactoResolver.resolverContacto(event.responsableId);
      if (!contacto) {
        return;
      }

      const plantilla = templatePreventivoRecordatorio({
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: entorno.APP_BASE_URL,
        fechaObjetivo: ticket.fechaObjetivo,
      });
      await this.enviarSeguro(contacto, plantilla);
    } catch (err) {
      // log-and-swallow (ADR-6): nunca se propaga hacia el barrido que lo publicó.
      this.logger.error(
        `PreventivoGeneradoNotificacionListener: fallo al enviar el recordatorio de preventivo (ticketId=${event.ticketId}): ${String(err)}`,
      );
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
    } catch (err) {
      // log-and-swallow por-destinatario (N4): el resto de los envíos sigue.
      // Se loguea (no catch vacío) para que el fallo de ESTE destinatario
      // quede visible sin bloquear a los demás.
      this.logger.error(
        `PreventivoGeneradoNotificacionListener: fallo al enviar email a destinatario (email=${destinatario.email}): ${String(err)}`,
      );
    }
  }
}
