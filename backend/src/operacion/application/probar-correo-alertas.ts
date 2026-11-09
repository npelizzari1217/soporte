import { SmtpConfig } from '../../notificaciones/infrastructure/email/smtp-email-sender';
import { IEmailConnectionVerifier } from '../../shared/domain/ports/i-email-connection-verifier.port';
import { IEmailSender } from '../../shared/domain/ports/i-email-sender';
import { IDestinatariosRoot } from './avisar-saturacion-a-root';

/** Resultado del correo de prueba: a quiénes salió, o por qué no salió. */
export type ResultadoCorreoPrueba =
  { ok: true; destinatarios: string[] } | { ok: false; motivo: string };

/**
 * ProbarCorreoAlertas — correo de prueba de las alertas de operación (odd/saturacion-conexiones,
 * S3), para confirmar antes de una saturación real que el aviso a ROOT llega.
 *
 * Primero verifica la conexión SMTP: `SmtpEmailSender` registra sus fallas sin propagarlas, así que
 * sin esta verificación el endpoint respondería "enviado" con el servidor de correo caído. El
 * motivo de una falla viene saneado del verificador, nunca del mensaje crudo del proveedor.
 */
export class ProbarCorreoAlertas {
  /**
   * @param smtp Cuenta SMTP del sistema, o `null` si no está configurada.
   * @param verificador Handshake SMTP con timeouts.
   * @param emailSender Envío por la misma cuenta.
   * @param destinatarios Los ROOT activos: los mismos que reciben las alertas.
   */
  constructor(
    private readonly smtp: SmtpConfig | null,
    private readonly verificador: IEmailConnectionVerifier,
    private readonly emailSender: IEmailSender,
    private readonly destinatarios: IDestinatariosRoot,
  ) {}

  /** @returns A quiénes se envió la prueba, o el motivo por el que no se pudo. */
  async execute(): Promise<ResultadoCorreoPrueba> {
    if (!this.smtp) {
      return {
        ok: false,
        motivo: 'Falta configurar la cuenta de correo del sistema (SMTP_*) en el servidor.',
      };
    }
    const verificacion = await this.verificador.verify({
      host: this.smtp.host,
      port: this.smtp.port,
      user: this.smtp.user,
      password: this.smtp.pass,
      secure: this.smtp.secure,
    });
    if (!verificacion.ok) {
      return {
        ok: false,
        motivo: `El servidor de correo no aceptó la conexión: ${verificacion.motivo ?? 'Fallo de verificación'}.`,
      };
    }
    const emails = await this.destinatarios.emailsDeRootActivos();
    if (emails.length === 0) {
      return { ok: false, motivo: 'No hay usuarios ROOT activos que reciban las alertas.' };
    }
    for (const to of emails) {
      await this.emailSender.send({
        to,
        subject: 'Soporte: correo de prueba de las alertas de operación',
        text:
          'Este es un correo de prueba. Si lo recibe, las alertas de operación de soporte (por ' +
          'ejemplo, cuando la base de datos se satura) le van a llegar a esta dirección. No hace ' +
          'falta responder.',
      });
    }
    return { ok: true, destinatarios: emails };
  }
}
