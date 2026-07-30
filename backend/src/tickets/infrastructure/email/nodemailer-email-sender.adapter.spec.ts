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
import { NodemailerEmailSender, EmailTransporter } from './nodemailer-email-sender.adapter';
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
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

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
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      const result = await adapter.send(makeMessage());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailError);
      expect(result.getError().code).toBe('EMAIL_SEND_FAILED');
      expect(result.getError().destinatarioEnmascarado).toBe('u***@dominio.com');
      expect(result.getError().causa).toContain('Connection refused');
    });

    it('nunca lanza — send() siempre resuelve la promesa incluso ante fallo del transporter', async () => {
      const sendMail = vi.fn().mockRejectedValue(new Error('timeout'));
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      await expect(adapter.send(makeMessage())).resolves.not.toThrow();
    });

    it('enmascara el email del destinatario dentro de la "causa" del error cuando el rechazo SMTP lo incluye en claro (R7)', async () => {
      const sendMail = vi
        .fn()
        .mockRejectedValue(
          new Error('550 5.1.1 <usuario@dominio.com>: Recipient address rejected: User unknown'),
        );
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      const result = await adapter.send(makeMessage());

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error.causa).not.toContain('usuario@dominio.com');
      expect(error.causa).toContain('u***@dominio.com');
      expect(error.message).not.toContain('usuario@dominio.com');
    });

    it('body type "text" envía como texto plano', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      await adapter.send(makeMessage({ body: { type: 'text', content: 'texto plano' } }));

      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'texto plano' }));
    });

    it('body type "template" compila subject.hbs/body.hbs desde email-templates/ e interpola los datos', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

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

    it('escapa entidades HTML de los datos del template en el body — previene XSS (tituloTicket con markup)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      await adapter.send(
        makeMessage({
          body: {
            type: 'template',
            name: 'cambio-estado',
            data: {
              numero: 'SOP-2026-00042',
              tituloTicket: `"><img src=x onerror=alert(1)>&'`,
              estadoAnteriorCodigo: 'EN_PROGRESO',
              estadoNuevoCodigo: 'RESUELTO',
            },
          },
        }),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.html).not.toContain('<img');
      expect(call.html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&amp;&#39;');
    });

    it('elimina CR/LF de los valores interpolados en el subject — previene header injection SMTP (hardening, R7)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      await adapter.send(
        makeMessage({
          body: {
            type: 'template',
            name: 'cambio-estado',
            data: {
              numero: 'SOP-2026-00042\r\nBcc: atacante@evil.com',
              tituloTicket: 'Ticket',
              estadoAnteriorCodigo: 'EN_PROGRESO',
              estadoNuevoCodigo: 'RESUELTO',
            },
          },
        }),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.subject).not.toMatch(/[\r\n]/);
      expect(call.subject).toContain('SOP-2026-00042Bcc: atacante@evil.com');
    });

    it('elimina CR/LF del subject cuando el body es type "text" — previene header injection SMTP (Judgment Day PR2 Ronda 3, issue D)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      await adapter.send(
        makeMessage({
          subject: 'Asunto\r\nBcc: atacante@evil.com',
          body: { type: 'text', content: 'texto plano' },
        }),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.subject).not.toMatch(/[\r\n]/);
      expect(call.subject).toBe('AsuntoBcc: atacante@evil.com');
    });

    it('elimina CR/LF del subject cuando el body es type "html" — previene header injection SMTP (Judgment Day PR2 Ronda 3, issue D)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      await adapter.send(
        makeMessage({
          subject: 'Asunto\r\nBcc: atacante@evil.com',
          body: { type: 'html', content: '<p>contenido</p>' },
        }),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.subject).not.toMatch(/[\r\n]/);
      expect(call.subject).toBe('AsuntoBcc: atacante@evil.com');
    });

    it('NO escapa entidades HTML en el subject (texto plano del header, distinto contexto que el body HTML)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transporter: EmailTransporter = { sendMail };
      const adapter = new NodemailerEmailSender(transporter, 'Soporte <no-reply@dominio.com>');

      await adapter.send(
        makeMessage({
          body: {
            type: 'template',
            name: 'cambio-estado',
            data: {
              numero: 'SOP & 2026',
              tituloTicket: 'Ticket',
              estadoAnteriorCodigo: 'EN_PROGRESO',
              estadoNuevoCodigo: 'RESUELTO',
            },
          },
        }),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.subject).toContain('SOP & 2026');
      expect(call.subject).not.toContain('&amp;');
    });
  });
});
