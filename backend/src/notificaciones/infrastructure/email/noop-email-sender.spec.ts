/**
 * N3 [UNIT] — NoOpEmailSender: degrada a log-only (N2) enmascarando el
 * destinatario y sin loguear el cuerpo del mensaje (N5).
 *
 * Ref spec: sdd/premium/spec N1, N2, N5. Ref design: ADR-P7. Tarea: N3/N4.
 */
import { NoOpEmailSender } from './noop-email-sender';

describe('NoOpEmailSender', () => {
  it('loguea el envío que se habría hecho, con el destinatario enmascarado', async () => {
    const logger = { log: vi.fn() };
    const sender = new NoOpEmailSender(logger);

    await sender.send({ to: 'juan@dominio.com', subject: 'Ticket actualizado', text: 'cuerpo' });

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('to=j***@d***.com'));
  });

  it('[CRITICAL] NUNCA loguea el cuerpo (text/html) del mensaje', async () => {
    const logger = { log: vi.fn() };
    const sender = new NoOpEmailSender(logger);

    await sender.send({
      to: 'juan@dominio.com',
      subject: 'Asunto',
      text: 'CONTENIDO SECRETO DEL TICKET',
      html: '<p>CONTENIDO SECRETO HTML</p>',
    });

    const logged = logger.log.mock.calls[0][0] as string;
    expect(logged).not.toContain('CONTENIDO SECRETO');
  });

  it('resuelve sin lanzar (never fail-fast, N2)', async () => {
    const logger = { log: vi.fn() };
    const sender = new NoOpEmailSender(logger);

    await expect(sender.send({ to: 'x@y.com', subject: 's', text: 't' })).resolves.toBeUndefined();
  });
});
