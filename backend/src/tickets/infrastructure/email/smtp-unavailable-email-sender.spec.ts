/**
 * RED→GREEN: SmtpUnavailableEmailSender — EmailSenderPort de resguardo usado
 * por el `useFactory` de EMAIL_SENDER en `tickets.module.ts` cuando
 * `NodemailerEmailSender.fromEnv()` no pudo validar la config SMTP al
 * cablear el módulo (ver deviación documentada en STATE.md, Apply Progress
 * PR3, y el comentario del wiring en `tickets.module.ts`).
 *
 * Contrato: NUNCA lanza — `send()` siempre resuelve `Result.fail(EmailError)`
 * con la causa original (config faltante), preservando el patrón
 * "NUNCA throw" del port (D7) incluso en este caso de borde.
 *
 * Tarea: 3.8 (PR3, notif-email-estado-ticket) — deviación documentada.
 */
import { SmtpUnavailableEmailSender } from './smtp-unavailable-email-sender';
import { Email } from '../../domain/value-objects/email.vo';
import { EmailError } from '../../domain/errors/email.errors';
import { EmailMessage } from '../../domain/ports/i-email-sender.port';

describe('SmtpUnavailableEmailSender', () => {
  const to = Email.create('usuario@dominio.com').getValue();

  function makeMessage(): EmailMessage {
    return { to, subject: 'Asunto', body: { type: 'text', content: 'contenido' } };
  }

  it('send() retorna Result.fail(EmailError) con la causa de config preservada, NUNCA throw', async () => {
    const sender = new SmtpUnavailableEmailSender('Faltan variables de entorno: SMTP_HOST');

    const result = await sender.send(makeMessage());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EmailError);
    expect(result.getError().code).toBe('EMAIL_SEND_FAILED');
    expect(result.getError().causa).toContain('SMTP_HOST');
  });

  it('enmascara el destinatario en el error — nunca expone el email en claro', async () => {
    const sender = new SmtpUnavailableEmailSender('config inválida');

    const result = await sender.send(makeMessage());

    expect(result.getError().destinatarioEnmascarado).toBe('u***@dominio.com');
    expect(result.getError().message).not.toContain('usuario@dominio.com');
  });

  it('nunca lanza incluso si se invoca send() repetidamente', async () => {
    const sender = new SmtpUnavailableEmailSender('config inválida');

    await expect(sender.send(makeMessage())).resolves.not.toThrow();
    await expect(sender.send(makeMessage())).resolves.not.toThrow();
  });
});
