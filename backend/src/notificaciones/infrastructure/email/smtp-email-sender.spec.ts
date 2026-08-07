/**
 * N3 [UNIT] — SmtpEmailSender: envío real vía nodemailer + swallow de fallos
 * de transporte (N2). Escrito junto al adapter (mismo criterio documentado
 * en sdd/premium/apply-progress módulo SLA para adaptadores mecánicos): la
 * cobertura de comportamiento (swallow, masked log) se verifica acá.
 *
 * Ref spec: sdd/premium/spec N1, N2, N5. Ref design: ADR-P7. Tarea: N3/N4.
 */
import { SmtpEmailSender } from './smtp-email-sender';

const sendMailMock = vi.fn();

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
}));

describe('SmtpEmailSender', () => {
  function makeSender() {
    const logger = { log: vi.fn() };
    const sender = new SmtpEmailSender(
      {
        host: 'smtp.test.com',
        port: 587,
        user: 'u',
        pass: 'p',
        from: 'from@test.com',
        secure: false,
      },
      logger,
    );
    return { sender, logger };
  }

  beforeEach(() => {
    sendMailMock.mockReset();
  });

  it('envía el mensaje vía transporter.sendMail con el remitente configurado', async () => {
    sendMailMock.mockResolvedValue(undefined);
    const { sender } = makeSender();

    await sender.send({ to: 'destino@test.com', subject: 'Asunto', text: 'Cuerpo' });

    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'from@test.com',
      to: 'destino@test.com',
      subject: 'Asunto',
      text: 'Cuerpo',
      html: undefined,
    });
  });

  it('[CRITICAL] un fallo de transporte NUNCA se propaga (log-and-swallow, N2)', async () => {
    sendMailMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { sender } = makeSender();

    await expect(
      sender.send({ to: 'destino@test.com', subject: 'Asunto', text: 'Cuerpo' }),
    ).resolves.toBeUndefined();
  });

  it('[CRITICAL] el log de error NUNCA expone el email en claro (N5, enmascarado)', async () => {
    sendMailMock.mockRejectedValue(new Error('fail'));
    const { sender, logger } = makeSender();

    await sender.send({ to: 'sensible@dominio.com', subject: 'Asunto', text: 'Cuerpo' });

    const logged = logger.log.mock.calls[0][0] as string;
    expect(logged).not.toContain('sensible@dominio.com');
    expect(logged).toContain('s***@d***.com');
  });
});
