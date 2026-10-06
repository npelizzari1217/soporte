/**
 * NotificadorVencimientoSla — entrega común de los avisos de vencimiento de SLA (resolución y primera
 * respuesta, `sla-primera-respuesta` R4). Se extrajo de `SlaVencidoNotificacionListener`: cada listener
 * le pasa su plantilla y el notificador resuelve a quién y cómo.
 *
 * Destinatarios: el asignado más los administradores del tenant ACTIVO, deduplicados por email (sin
 * distinguir mayúsculas): un administrador que además es el asignado recibe un solo mail.
 *
 * ALS/TenantContext (ADR-P8): el barrido emite el evento dentro de `tenantContext.run()` y el handler
 * hereda el `clienteId` activo; sin TenantContext se omiten los administradores sin fallar el resto.
 *
 * Aislamiento (N4, ADR-6): cada `send()` va en su propio try/catch y todo el flujo en un try/catch
 * total: nada se propaga hacia el emisor síncrono del evento.
 */
import { ITicketRepository } from '../../tickets/domain/ports/i-ticket.repository';
import {
  ContactoUsuario,
  IUsuarioContactoResolver,
} from '../domain/ports/i-usuario-contacto-resolver';
import { EmailMessage, IEmailSender } from '../../shared/domain/ports/i-email-sender';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { ILogger } from '../../shared/domain/ports/i-logger.port';
import { entorno } from '../../config/entorno';

/** Datos que el notificador le da a la plantilla de cada listener. */
export interface DatosPlantillaVencimiento {
  numero: string;
  titulo: string;
  ticketId: string;
  appBaseUrl: string;
}

export type PlantillaVencimiento = (datos: DatosPlantillaVencimiento) => Omit<EmailMessage, 'to'>;

export class NotificadorVencimientoSla {
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
   * @param origen Nombre del listener, solo para el log.
   * @returns Nunca lanza: un fallo inesperado se loguea y se traga (ADR-6).
   */
  async notificar(
    evento: { ticketId: string; asignadoId: string | null },
    plantilla: PlantillaVencimiento,
    origen: string,
  ): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(evento.ticketId);
      if (!ticket) return;

      const mensaje = plantilla({
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: entorno.APP_BASE_URL,
      });

      const destinatarios: ContactoUsuario[] = [];
      if (evento.asignadoId) {
        const asignado = await this.contactoResolver.resolverContacto(evento.asignadoId);
        if (asignado) destinatarios.push(asignado);
      }
      const clienteId = this.tenantContext.get()?.clienteId;
      if (clienteId) {
        destinatarios.push(...(await this.contactoResolver.resolverAdministradores(clienteId)));
      }

      await Promise.all(
        deduplicarPorEmail(destinatarios).map((d) => this.enviarSeguro(d, mensaje, origen)),
      );
    } catch (err) {
      this.logger.error(
        `${origen}: fallo al notificar vencimiento de SLA (ticketId=${evento.ticketId}): ${String(err)}`,
      );
    }
  }

  private async enviarSeguro(
    destinatario: ContactoUsuario,
    mensaje: Omit<EmailMessage, 'to'>,
    origen: string,
  ): Promise<void> {
    try {
      await this.emailSender.send({ to: destinatario.email, ...mensaje });
    } catch (err) {
      // log-and-swallow por destinatario (N4): el resto de los envíos sigue.
      this.logger.error(
        `${origen}: fallo al enviar email a destinatario (email=${destinatario.email}): ${String(err)}`,
      );
    }
  }
}

function deduplicarPorEmail(contactos: ContactoUsuario[]): ContactoUsuario[] {
  const vistos = new Set<string>();
  return contactos.filter((c) => {
    const clave = c.email.trim().toLowerCase();
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}
