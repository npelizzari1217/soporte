/**
 * 2.14 — Integración GATED: NodemailerEmailSender contra un servidor SMTP de
 * test real (maildev/mailhog), habilitada SOLO con `SMTP_TEST=1`.
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
 * Ref design: §8 tabla testing "Adapter nodemailer real".
 * Ref tasks: PR2 2.14
 */
import { NodemailerEmailSender } from './nodemailer-email-sender.adapter';
import { Email } from '../../domain/value-objects/email.vo';

const SMTP_TEST_ENABLED = process.env.SMTP_TEST === '1';

describe.skipIf(!SMTP_TEST_ENABLED)(
  'NodemailerEmailSender — integración real (SMTP_TEST=1)',
  () => {
    it('envía un mensaje real end-to-end a través de un servidor SMTP de test', async () => {
      const testEnv = {
        SMTP_HOST: process.env.SMTP_TEST_HOST ?? 'localhost',
        SMTP_PORT: process.env.SMTP_TEST_PORT ?? '1025',
        SMTP_USER: process.env.SMTP_TEST_USER ?? 'test',
        SMTP_PASS: process.env.SMTP_TEST_PASS ?? 'test',
        SMTP_FROM: process.env.SMTP_TEST_FROM ?? 'Soporte <no-reply@soporte.test>',
      } as NodeJS.ProcessEnv;

      const adapter = NodemailerEmailSender.fromEnv(testEnv);
      const to = Email.create('destinatario@soporte.test').getValue();

      const result = await adapter.send({
        to,
        subject: 'Integración SMTP_TEST',
        body: {
          type: 'text',
          content: 'Mensaje de prueba de integración (nodemailer-email-sender).',
        },
      });

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
