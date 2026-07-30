/**
 * 2.14 (PR2, notif-email-estado-ticket) — Integración GATED: NodemailerEmailSender
 * contra un servidor SMTP de test real (maildev/mailhog), habilitada SOLO con
 * `SMTP_TEST=1`.
 *
 * Actualizado en PR6 (runtime-config-table, Dz6/Dz11): el adapter ya no lee
 * `process.env.SMTP_*` ni expone `fromEnv()` — la config se arma explícitamente
 * como `SmtpConfig` (el mismo VO que produce `IConfigResolver` en producción)
 * y se pasa a `send(email, config)`.
 *
 * Por defecto (sin `SMTP_TEST=1` en el entorno) esta suite se SALTEA
 * completa — no rompe `pnpm test` en máquinas/CI sin maildev/mailhog
 * corriendo. Ver skill `error-handling`/CLAUDE.md §5 punto 3: "integración
 * como capa fina y deliberada, gated cuando corresponde".
 *
 * Para correrla localmente:
 *   1. Levantar maildev: `docker run -p 1025:1025 -p 1080:1080 maildev/maildev`
 *      (o mailhog equivalente, puerto SMTP por defecto 1025).
 *   2. `SMTP_TEST=1 SMTP_TEST_HOST=localhost SMTP_TEST_PORT=1025 pnpm test -- nodemailer-email-sender.integration`
 *
 * Ref design: §8 tabla testing "Adapter nodemailer real"; §7.1 (PR6, transporter por-envío).
 * Ref tasks: PR2 2.14; PR6 6.5 (adaptado al nuevo contrato).
 */
import { NodemailerEmailSender } from './nodemailer-email-sender.adapter';
import { Email } from '../../domain/value-objects/email.vo';
import { SmtpConfig } from '../../../shared/domain/value-objects/smtp-config.vo';

const SMTP_TEST_ENABLED = process.env.SMTP_TEST === '1';

describe.skipIf(!SMTP_TEST_ENABLED)(
  'NodemailerEmailSender — integración real (SMTP_TEST=1)',
  () => {
    it('envía un mensaje real end-to-end a través de un servidor SMTP de test', async () => {
      const config = SmtpConfig.create({
        host: process.env.SMTP_TEST_HOST ?? 'localhost',
        port: process.env.SMTP_TEST_PORT ?? '1025',
        secure: false,
        user: process.env.SMTP_TEST_USER ?? 'test',
        pass: process.env.SMTP_TEST_PASS ?? 'test',
        from: process.env.SMTP_TEST_FROM ?? 'Soporte <no-reply@soporte.test>',
      }).getValue();

      const adapter = new NodemailerEmailSender();
      const to = Email.create('destinatario@soporte.test').getValue();

      const result = await adapter.send(
        {
          to,
          subject: 'Integración SMTP_TEST',
          body: {
            type: 'text',
            content: 'Mensaje de prueba de integración (nodemailer-email-sender).',
          },
        },
        config,
      );

      expect(result.isOk()).toBe(true);
    });
  },
);

// Documenta explícitamente el diferimiento cuando el gate está apagado —
// evita un "0 tests" silencioso que pase desapercibido en el resumen.
if (!SMTP_TEST_ENABLED) {
  describe('NodemailerEmailSender — integración real (SMTP_TEST no habilitado)', () => {
    it.skip('diferido: requiere SMTP_TEST=1 + maildev/mailhog local (ver comentario del archivo)', () => {
      // Intencionalmente vacío — skip documentado.
    });
  });
}
