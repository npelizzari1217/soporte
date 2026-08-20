/**
 * SmtpConnectionVerifier — handshake vía nodemailer + sanitización D6.
 * Adelantado desde WU5 (ver smtp-connection-verifier.ts). Cobertura acá deja
 * la tarea 5.2 de WU5 ("cada código mapeado + uno sin mapear") ya satisfecha.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D6.
 */
import { SmtpConnectionVerifier } from './smtp-connection-verifier';

const verifyMock = vi.fn();
const closeMock = vi.fn();

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ verify: verifyMock, close: closeMock })),
}));

describe('SmtpConnectionVerifier', () => {
  const config = { host: 'smtp.test.com', port: 587, user: 'u', password: 'p', secure: false };

  beforeEach(() => {
    verifyMock.mockReset();
    closeMock.mockReset();
  });

  it('ok=true y motivo=null cuando el handshake tiene éxito', async () => {
    verifyMock.mockResolvedValue(true);

    const result = await new SmtpConnectionVerifier().verify(config);

    expect(result).toEqual({ ok: true, motivo: null });
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it.each([
    ['EAUTH', 'Credenciales rechazadas por el servidor'],
    ['ECONNECTION', 'No se pudo conectar con el servidor'],
    ['ENOTFOUND', 'No se pudo conectar con el servidor'],
    ['ETIMEDOUT', 'El servidor no respondió a tiempo'],
    ['ESOCKET', 'Fallo de TLS'],
  ])('mapea el código %s al motivo saneado "%s"', async (code, motivoEsperado) => {
    const error = Object.assign(new Error('mensaje crudo del servidor con user@dominio.com'), {
      code,
    });
    verifyMock.mockRejectedValue(error);

    const result = await new SmtpConnectionVerifier().verify(config);

    expect(result).toEqual({ ok: false, motivo: motivoEsperado });
  });

  it('[CRITICAL] un código no mapeado cae al motivo genérico, nunca al mensaje crudo', async () => {
    const error = Object.assign(new Error('535 5.7.8 usuario@dominio.com auth failed'), {
      code: 'ECODIGOINEXISTENTE',
    });
    verifyMock.mockRejectedValue(error);

    const result = await new SmtpConnectionVerifier().verify(config);

    expect(result.motivo).toBe('Fallo de verificación');
    expect(result.motivo).not.toContain('usuario@dominio.com');
  });

  it('cierra el transporter incluso cuando el handshake falla', async () => {
    verifyMock.mockRejectedValue(new Error('boom'));

    await new SmtpConnectionVerifier().verify(config);

    expect(closeMock).toHaveBeenCalledOnce();
  });
});
