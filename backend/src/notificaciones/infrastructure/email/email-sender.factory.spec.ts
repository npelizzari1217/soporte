/**
 * N3 [UNIT] — RED→GREEN: resolveEmailSender — factory de degradación (N2,
 * CRÍTICO beta). SMTP_HOST+USER+PASSWORD presentes ⇒ SmtpEmailSender;
 * ausentes/incompletos ⇒ NoOpEmailSender. Construir NUNCA lanza (no
 * fail-fast en el arranque, aunque falte config SMTP completa).
 *
 * Ref spec: sdd/premium/spec N1, N2. Ref design: ADR-P7. Tarea: N3/N4.
 */
import { resolveEmailSender } from './email-sender.factory';
import { SmtpEmailSender } from './smtp-email-sender';
import { NoOpEmailSender } from './noop-email-sender';

describe('resolveEmailSender', () => {
  function makeLogger() {
    return { log: vi.fn() };
  }

  it('SMTP_HOST + SMTP_USER + SMTP_PASSWORD presentes → SmtpEmailSender', () => {
    const sender = resolveEmailSender(
      { SMTP_HOST: 'smtp.test.com', SMTP_USER: 'user@test.com', SMTP_PASSWORD: 'secret' },
      makeLogger(),
    );

    expect(sender).toBeInstanceOf(SmtpEmailSender);
  });

  it('env SMTP_* completamente ausente → NoOpEmailSender', () => {
    const sender = resolveEmailSender({}, makeLogger());

    expect(sender).toBeInstanceOf(NoOpEmailSender);
  });

  it('config SMTP incompleta (falta SMTP_PASSWORD) → NoOpEmailSender', () => {
    const sender = resolveEmailSender(
      { SMTP_HOST: 'smtp.test.com', SMTP_USER: 'user@test.com' },
      makeLogger(),
    );

    expect(sender).toBeInstanceOf(NoOpEmailSender);
  });

  it('config SMTP incompleta (falta SMTP_HOST) → NoOpEmailSender', () => {
    const sender = resolveEmailSender(
      { SMTP_USER: 'user@test.com', SMTP_PASSWORD: 'secret' },
      makeLogger(),
    );

    expect(sender).toBeInstanceOf(NoOpEmailSender);
  });

  it('[CRITICAL] construir NUNCA lanza, aun con env vacío/undefined (no fail-fast)', () => {
    expect(() => resolveEmailSender({}, makeLogger())).not.toThrow();
    expect(() =>
      resolveEmailSender(
        { SMTP_HOST: 'x', SMTP_USER: 'y', SMTP_PASSWORD: 'z', SMTP_PORT: 'no-es-numero' },
        makeLogger(),
      ),
    ).not.toThrow();
  });
});
