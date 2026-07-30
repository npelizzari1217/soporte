/**
 * SmtpUnavailableEmailSender — EmailSenderPort de resguardo cuando la config
 * SMTP no pudo validarse al cablear `tickets.module.ts`.
 *
 * DEVIACIÓN DE DISEÑO documentada (ver STATE.md, Apply Progress PR3):
 * `loadEmailConfig()`/`NodemailerEmailSender.fromEnv()` siguen lanzando por
 * diseño (D7, Requirement 7 nota infra) cuando se invocan directamente —
 * eso NO cambia, y sigue siendo el comportamiento correcto para un boot de
 * producción con config real ausente. Lo que cambia es DÓNDE se tolera ese
 * throw: el `useFactory` de `EMAIL_SENDER` en `tickets.module.ts` lo captura
 * y sustituye por ESTE sender, en vez de dejar que aborte
 * `moduleRef.compile()`/`.init()`.
 *
 * Motivo: varios tests de wiring YA EXISTENTES (equipos/compras/
 * reparaciones/tickets/app.module) bootstrapean el grafo de DI completo de
 * `TicketsModule` sin `SMTP_*` configurado — igual que `PrismaService` ya
 * tolera `DATABASE_URL_MASTER ?? ''` en `shared.module.ts` para el mismo
 * motivo (conexión real diferida al primer uso, no al bootstrap). Si
 * `EMAIL_SENDER` lanzara al bootstrap, esos tests (hoy verdes) romperían.
 *
 * Contrato: NUNCA lanza. `send()` siempre resuelve `Result.fail(EmailError)`
 * con la causa de config preservada — el fallo de notificación por email
 * queda visible en logs (vía el listener) en el primer intento real de
 * envío, sin abortar el arranque de la app en entornos donde el DI graph se
 * bootstrapea sin SMTP (tests) ni bloquear ninguna transición de ticket
 * (R5/R6: el envío de email nunca es parte del camino crítico).
 *
 * Tarea: 3.8 (PR3, notif-email-estado-ticket)
 */
import { Result } from '../../../shared/domain/result';
import { EmailSenderPort, EmailMessage } from '../../domain/ports/i-email-sender.port';
import { EmailError } from '../../domain/errors/email.errors';

export class SmtpUnavailableEmailSender implements EmailSenderPort {
  constructor(private readonly motivo: string) {}

  async send(email: EmailMessage): Promise<Result<void, EmailError>> {
    return Result.fail(
      new EmailError(email.to.mask(), `SMTP no disponible: ${this.motivo}`, 'EMAIL_SEND_FAILED'),
    );
  }
}
