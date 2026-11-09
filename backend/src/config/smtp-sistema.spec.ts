/**
 * [UNIT] Cuenta SMTP propia del sistema (odd/saturacion-conexiones, L7): la usan los avisos de
 * operación, que no pertenecen a ningún cliente.
 */
import { leerSmtpSistema } from './smtp-sistema';

const COMPLETA = {
  SMTP_HOST: 'smtp.sesitec.net',
  SMTP_PORT: '587',
  SMTP_USER: 'alertas@sesitec.net',
  SMTP_PASSWORD: 'secreto',
  SMTP_FROM: 'Soporte <alertas@sesitec.net>',
};

describe('leerSmtpSistema', () => {
  it('con las cinco variables arma la configuración; SMTP_SECURE es opcional y vale false', () => {
    expect(leerSmtpSistema(COMPLETA)).toEqual({
      host: 'smtp.sesitec.net',
      port: 587,
      user: 'alertas@sesitec.net',
      pass: 'secreto',
      from: 'Soporte <alertas@sesitec.net>',
      secure: false,
    });
    expect(leerSmtpSistema({ ...COMPLETA, SMTP_SECURE: 'true' })?.secure).toBe(true);
  });

  it.each(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'])(
    'sin %s (o vacía) no hay cuenta del sistema: devuelve null',
    (clave) => {
      expect(leerSmtpSistema({ ...COMPLETA, [clave]: undefined })).toBeNull();
      expect(leerSmtpSistema({ ...COMPLETA, [clave]: '  ' })).toBeNull();
    },
  );

  it('un puerto que no es número no arma una configuración rota', () => {
    expect(leerSmtpSistema({ ...COMPLETA, SMTP_PORT: 'abc' })).toBeNull();
  });
});
