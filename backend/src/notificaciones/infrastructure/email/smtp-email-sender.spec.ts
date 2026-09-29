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

  /**
   * Regresion: el log volcaba el `error.message` crudo de nodemailer, y muchos
   * servidores SMTP devuelven el usuario dentro de la respuesta 535. Mismo
   * criterio que `SmtpConnectionVerifier` (D6): allowlist cerrado, nunca un
   * scrub del mensaje.
   */
  describe('log de error saneado: nunca el mensaje crudo del servidor', () => {
    function errorSmtp(message: string, extra: Record<string, unknown>): Error {
      return Object.assign(new Error(message), extra);
    }

    it('[CRITICAL] un 535 que trae el usuario en el mensaje loguea solo el codigo y el status SMTP', async () => {
      sendMailMock.mockRejectedValue(
        errorSmtp(
          'Invalid login: 535-5.7.8 Username and Password not accepted for soporte@cliente.com',
          { code: 'EAUTH', responseCode: 535, response: '535-5.7.8 ... soporte@cliente.com' },
        ),
      );
      const { sender, logger } = makeSender();

      await sender.send({ to: 'destino@test.com', subject: 'Asunto', text: 'Cuerpo' });

      const logged = logger.log.mock.calls[0][0] as string;
      expect(logged).not.toContain('soporte@cliente.com');
      expect(logged).not.toContain('Invalid login');
      expect(logged).toContain('code=EAUTH');
      expect(logged).toContain('smtp=535');
    });

    it('un code fuera del allowlist se loguea como OTRO, sin su texto', async () => {
      sendMailMock.mockRejectedValue(errorSmtp('fail', { code: 'EINVENTADO-usuario@x.com' }));
      const { sender, logger } = makeSender();

      await sender.send({ to: 'destino@test.com', subject: 'Asunto', text: 'Cuerpo' });

      const logged = logger.log.mock.calls[0][0] as string;
      expect(logged).toContain('code=OTRO');
      expect(logged).not.toContain('usuario@x.com');
    });

    it('un responseCode que no es un numero de status SMTP no se loguea', async () => {
      sendMailMock.mockRejectedValue(
        errorSmtp('fail', { code: 'EAUTH', responseCode: '535 usuario@x.com' }),
      );
      const { sender, logger } = makeSender();

      await sender.send({ to: 'destino@test.com', subject: 'Asunto', text: 'Cuerpo' });

      const logged = logger.log.mock.calls[0][0] as string;
      expect(logged).toContain('smtp=-');
      expect(logged).not.toContain('usuario@x.com');
    });

    it('un rechazo que no es un Error (un string) se loguea como OTRO sin su texto', async () => {
      sendMailMock.mockRejectedValue('535 usuario@x.com');
      const { sender, logger } = makeSender();

      await sender.send({ to: 'destino@test.com', subject: 'Asunto', text: 'Cuerpo' });

      const logged = logger.log.mock.calls[0][0] as string;
      expect(logged).toContain('code=OTRO');
      expect(logged).not.toContain('usuario@x.com');
    });
  });
});
