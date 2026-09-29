/**
 * 3.4 TEST — Unit tests de templateResetPassword/templateResetConfirmado.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "El link de reset
 * se construye solo desde APP_BASE_URL". Ref design: ADR-7. Tarea: 3.4.
 */
import { templateResetConfirmado, templateResetPassword } from './reset-password-email.template';

const DATOS_BASE = {
  nombre: 'Ana',
  token: 'a1b2c3d4e5f6',
  appBaseUrl: 'https://soporte.miempresa.com',
  vigenciaMinutos: 60,
};

describe('templateResetPassword', () => {
  it('el link empieza con appBaseUrl, lleva el token en el fragmento (#) y refleja la vigencia', () => {
    const msg = templateResetPassword(DATOS_BASE);
    const linkEsperado = 'https://soporte.miempresa.com/restablecer-password#token=a1b2c3d4e5f6';

    expect(msg.text).toContain(linkEsperado);
    expect(msg.html).toContain(`href="${linkEsperado}"`);
    expect(msg.text).toContain('60 minutos');
  });

  /** Abuso: un link armado desde `Host` habilitaría phishing con dominio propio.
   *  La plantilla no recibe `Host`; este test detecta si alguien lo agregara. */
  it('el link nunca usa otro origen que appBaseUrl', () => {
    const msg = templateResetPassword({ ...DATOS_BASE, appBaseUrl: 'https://otro-origen.evil' });
    expect(msg.html).toContain('href="https://otro-origen.evil/restablecer-password#token=');
  });

  it('escapa el nombre en el html pero no en el text', () => {
    const msg = templateResetPassword({ ...DATOS_BASE, nombre: 'Ana <script>alert(1)</script>' });

    expect(msg.html).not.toContain('<script>alert(1)</script>');
    expect(msg.html).toContain('&lt;script&gt;');
    expect(msg.text).toContain('Ana <script>alert(1)</script>');
  });
});

describe('templateResetConfirmado', () => {
  it('menciona al usuario y que la contraseña fue restablecida, escapando el nombre en el html', () => {
    const msg = templateResetConfirmado({ nombre: 'Ana <b>x</b>' });

    expect(msg.subject).toContain('restablecida');
    expect(msg.text).toContain('Ana <b>x</b>');
    expect(msg.html).not.toContain('<b>x</b>');
    expect(msg.html).toContain('&lt;b&gt;');
  });

  /** [W3] wording de la decisión 3 del dueño (proposal.md): "contactá a tu administrador". */
  it('deriva al usuario a su administrador, no a "soporte"', () => {
    const msg = templateResetConfirmado({ nombre: 'Ana' });

    expect(msg.text).toContain('contactá a tu administrador');
    expect(msg.html).toContain('contactá a tu administrador');
    expect(msg.text).not.toContain('contactá a soporte');
  });
});
