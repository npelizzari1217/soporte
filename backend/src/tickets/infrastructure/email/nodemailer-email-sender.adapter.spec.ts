/**
 * 6.3/6.4/6.7 — RED: NodemailerEmailSender — adapter puro, arma el
 * transporter POR-ENVÍO desde una `SmtpConfig` explícita (no `process.env`,
 * no `fromEnv()`), sin cache entre envíos, sin importar `ISecretCipher`/
 * `PrismaService`/clientes Prisma.
 *
 * El adapter recibe `transportFactory` como seam de test (evita abrir
 * conexiones SMTP reales en unit tests) — reemplaza el `Transporter`
 * inyectado por constructor de PR2 (notif-email-estado-ticket), eliminado en
 * el swap de PR6 (runtime-config-table).
 *
 * Ref spec: Requirement 2 (secreto nunca fuera de memoria), Requirement 6
 * (fail-fast a send-time), Requirement 7 (adapter puro, arma transporter
 * por-envío), Requirement 9 (sin cache de transporter).
 * Ref tasks: PR6 6.3, 6.4, 6.7 (runtime-config-table).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  NodemailerEmailSender,
  EmailTransporter,
  SmtpTransportOptions,
} from './nodemailer-email-sender.adapter';
import { Email } from '../../domain/value-objects/email.vo';
import { EmailError } from '../../domain/errors/email.errors';
import { EmailMessage } from '../../domain/ports/i-email-sender.port';
import { SmtpConfig } from '../../../shared/domain/value-objects/smtp-config.vo';

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

  function makeConfig(
    overrides: Partial<Parameters<typeof SmtpConfig.create>[0]> = {},
  ): SmtpConfig {
    return SmtpConfig.create({
      host: 'smtp.dominio.com',
      port: 587,
      secure: false,
      user: 'no-reply@dominio.com',
      pass: 'super-secreto',
      from: 'Soporte <no-reply@dominio.com>',
      ...overrides,
    }).getValue();
  }

  function makeTransportFactory(sendMail: ReturnType<typeof vi.fn>) {
    const transporter: EmailTransporter = { sendMail };
    return vi.fn().mockReturnValue(transporter);
  }

  describe('send()', () => {
    it('arma el transporter POR-ENVÍO a partir de la SmtpConfig recibida (no process.env, no fromEnv) — R7 escenario 1', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transportFactory = makeTransportFactory(sendMail);
      const config = makeConfig();
      const adapter = new NodemailerEmailSender(transportFactory);

      const result = await adapter.send(makeMessage(), config);

      expect(result.isOk()).toBe(true);
      expect(transportFactory).toHaveBeenCalledWith({
        host: 'smtp.dominio.com',
        port: 587,
        secure: false,
        auth: { user: 'no-reply@dominio.com', pass: 'super-secreto' },
      } satisfies SmtpTransportOptions);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Soporte <no-reply@dominio.com>',
          to: 'usuario@dominio.com',
          subject: 'Asunto de prueba',
          html: '<p>contenido</p>',
        }),
      );
    });

    it('2 envíos consecutivos ⇒ 2 llamadas a transportFactory, sin cache (R9, deuda documentada)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

      await adapter.send(makeMessage(), makeConfig({ host: 'smtp-1.dominio.com' }));
      await adapter.send(makeMessage(), makeConfig({ host: 'smtp-2.dominio.com' }));

      expect(transportFactory).toHaveBeenCalledTimes(2);
      expect(transportFactory).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ host: 'smtp-1.dominio.com' }),
      );
      expect(transportFactory).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ host: 'smtp-2.dominio.com' }),
      );
    });

    it('retorna Result.fail(EmailError) con destinatario enmascarado cuando el transporter rechaza (nunca throw)', async () => {
      const sendMail = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

      const result = await adapter.send(makeMessage(), makeConfig());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailError);
      expect(result.getError().code).toBe('EMAIL_SEND_FAILED');
      expect(result.getError().destinatarioEnmascarado).toBe('u***@dominio.com');
      expect(result.getError().causa).toContain('Connection refused');
    });

    it('nunca lanza — send() siempre resuelve la promesa incluso ante fallo del transporter', async () => {
      const sendMail = vi.fn().mockRejectedValue(new Error('timeout'));
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

      await expect(adapter.send(makeMessage(), makeConfig())).resolves.not.toThrow();
    });

    it('enmascara el email del destinatario dentro de la "causa" del error cuando el rechazo SMTP lo incluye en claro (R7)', async () => {
      const sendMail = vi
        .fn()
        .mockRejectedValue(
          new Error('550 5.1.1 <usuario@dominio.com>: Recipient address rejected: User unknown'),
        );
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

      const result = await adapter.send(makeMessage(), makeConfig());

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error.causa).not.toContain('usuario@dominio.com');
      expect(error.causa).toContain('u***@dominio.com');
      expect(error.message).not.toContain('usuario@dominio.com');
    });

    it('redacta el secreto SMTP (config.pass) si aparece en claro dentro de la "causa" del error (R2, defensa extra)', async () => {
      const sendMail = vi
        .fn()
        .mockRejectedValue(new Error('535 Authentication failed for password super-secreto'));
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

      const result = await adapter.send(makeMessage(), makeConfig({ pass: 'super-secreto' }));

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error.causa).not.toContain('super-secreto');
      expect(error.causa).toContain('********');
    });

    it('body type "text" envía como texto plano', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

      await adapter.send(
        makeMessage({ body: { type: 'text', content: 'texto plano' } }),
        makeConfig(),
      );

      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'texto plano' }));
    });

    it('body type "template" compila subject.hbs/body.hbs desde email-templates/ e interpola los datos', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

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
        makeConfig(),
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
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

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
        makeConfig(),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.html).not.toContain('<img');
      expect(call.html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&amp;&#39;');
    });

    it('elimina CR/LF de los valores interpolados en el subject — previene header injection SMTP (hardening, R7)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

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
        makeConfig(),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.subject).not.toMatch(/[\r\n]/);
      expect(call.subject).toContain('SOP-2026-00042Bcc: atacante@evil.com');
    });

    it('elimina CR/LF del subject cuando el body es type "text" — previene header injection SMTP (Judgment Day PR2 Ronda 3, issue D)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

      await adapter.send(
        makeMessage({
          subject: 'Asunto\r\nBcc: atacante@evil.com',
          body: { type: 'text', content: 'texto plano' },
        }),
        makeConfig(),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.subject).not.toMatch(/[\r\n]/);
      expect(call.subject).toBe('AsuntoBcc: atacante@evil.com');
    });

    it('elimina CR/LF del subject cuando el body es type "html" — previene header injection SMTP (Judgment Day PR2 Ronda 3, issue D)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

      await adapter.send(
        makeMessage({
          subject: 'Asunto\r\nBcc: atacante@evil.com',
          body: { type: 'html', content: '<p>contenido</p>' },
        }),
        makeConfig(),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.subject).not.toMatch(/[\r\n]/);
      expect(call.subject).toBe('AsuntoBcc: atacante@evil.com');
    });

    it('NO escapa entidades HTML en el subject (texto plano del header, distinto contexto que el body HTML)', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc123' });
      const transportFactory = makeTransportFactory(sendMail);
      const adapter = new NodemailerEmailSender(transportFactory);

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
        makeConfig(),
      );

      const call = sendMail.mock.calls[0][0];
      expect(call.subject).toContain('SOP & 2026');
      expect(call.subject).not.toContain('&amp;');
    });
  });

  describe('auditoría estructural de imports (R7 escenario 2)', () => {
    it('el archivo fuente NUNCA importa ISecretCipher, PrismaService, getMasterClient ni getTenantClient', () => {
      const source = fs.readFileSync(
        path.join(__dirname, 'nodemailer-email-sender.adapter.ts'),
        'utf8',
      );
      const codeLines = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
      const code = codeLines.join('\n');

      expect(code).not.toMatch(/from ['"].*i-secret-cipher['"]/);
      expect(code).not.toMatch(/SECRET_CIPHER/);
      expect(code).not.toMatch(/ISecretCipher/);
      expect(code).not.toMatch(/PrismaService/);
      expect(code).not.toMatch(/getMasterClient/);
      expect(code).not.toMatch(/getTenantClient/);
      expect(code).not.toMatch(/from ['"].*email-config['"]/);
    });
  });
});
