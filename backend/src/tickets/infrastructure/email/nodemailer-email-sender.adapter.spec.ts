/**
 * 2.11 — RED: NodemailerEmailSender — éxito ⇒ Result.ok; fallo SMTP ⇒
 * Result.fail(EmailError) enmascarado, NUNCA throw.
 *
 * El adapter recibe un `Transporter` ya construido (seam de test — evita
 * abrir conexiones SMTP reales en unit tests). El wiring real
 * (`NodemailerEmailSender.fromEnv()`) se ejercita solo en el test de
 * integración gated (2.14).
 *
 * Ref spec: Requirement 7 Scenarios "ok"/"fail tipado".
 * Ref tasks: PR2 2.11
 */
import { NodemailerEmailSender } from './nodemailer-email-sender.adapter';
import { Email } from '../../domain/value-objects/email.vo';
import { EmailError } from '../../domain/errors/email.errors';
import { EmailMessage } from '../../domain/ports/i-email-sender.port';

describe('NodemailerEmailSender', () => {
  const to = Email.create('usuario@dominio.com').getValue();

  function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
    return {
      to,
      subject: 'Asunto de prueba',
      body: { type: 'html', content: '<p>contenido</p>' },
      ...overrides,
    };
  }

  describe('send()', () => {
    it('retorna Result.ok(undefined) cuando el transporter entrega el mensaje sin error', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const adapter = new NodemailerEmailSender(
        { sendMail } as any,
        'Soporte <no-reply@dominio.com>',
      );

      const result = await adapter.send(makeMessage());

      expect(result.isOk()).toBe(true);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Soporte <no-reply@dominio.com>',
          to: 'usuario@dominio.com',
          subject: 'Asunto de prueba',
          html: '<p>contenido</p>',
        }),
      );
    });

    it('retorna Result.fail(EmailError) con destinatario enmascarado cuando el transporter rechaza (nunca throw)', async () => {
      const sendMail = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const adapter = new NodemailerEmailSender(
        { sendMail } as any,
        'Soporte <no-reply@dominio.com>',
      );

      const result = await adapter.send(makeMessage());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailError);
      expect(result.getError().code).toBe('EMAIL_SEND_FAILED');
      expect(result.getError().destinatarioEnmascarado).toBe('u***@dominio.com');
      expect(result.getError().causa).toContain('Connection refused');
    });

    it('nunca lanza — send() siempre resuelve la promesa incluso ante fallo del transporter', async () => {
      const sendMail = vi.fn().mockRejectedValue(new Error('timeout'));
      const adapter = new NodemailerEmailSender(
        { sendMail } as any,
        'Soporte <no-reply@dominio.com>',
      );

      await expect(adapter.send(makeMessage())).resolves.not.toThrow();
    });

    it('body type "text" envía como texto plano', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const adapter = new NodemailerEmailSender(
        { sendMail } as any,
        'Soporte <no-reply@dominio.com>',
      );

      await adapter.send(makeMessage({ body: { type: 'text', content: 'texto plano' } }));

      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'texto plano' }));
    });

    it('body type "template" compila subject.hbs/body.hbs desde email-templates/ e interpola los datos', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const adapter = new NodemailerEmailSender(
        { sendMail } as any,
        'Soporte <no-reply@dominio.com>',
      );

      await adapter.send(
        makeMessage({
          body: {
            type: 'template',
            name: 'cambio-estado',
            data: {
              numero: 'SOP-2026-00042',
              tituloTicket: 'Impresora no enciende',
              estadoAnteriorCodigo: 'EN_PROGRESO',
              estadoNuevoCodigo: 'RESUELTO',
            },
          },
        }),
      );

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('SOP-2026-00042'),
          html: expect.stringContaining('Impresora no enciende'),
        }),
      );
      const call = sendMail.mock.calls[0][0];
      expect(call.html).toContain('RESUELTO');
      expect(call.html).toContain('EN_PROGRESO');
    });
  });
});
