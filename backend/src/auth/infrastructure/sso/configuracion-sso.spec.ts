import { ConfiguracionSsoDesdeEntorno } from './configuracion-sso';

const BASE = 'https://soporte.sesitec.net';

function crear(env: NodeJS.ProcessEnv) {
  return new ConfiguracionSsoDesdeEntorno(BASE, env);
}

describe('ConfiguracionSsoDesdeEntorno', () => {
  it.each([
    ['falta el client id', { SSO_GOOGLE_CLIENT_SECRET: 's' }],
    ['falta el client secret', { SSO_GOOGLE_CLIENT_ID: 'i' }],
    ['el client id esta vacio', { SSO_GOOGLE_CLIENT_ID: '', SSO_GOOGLE_CLIENT_SECRET: 's' }],
    [
      'el client secret es solo espacios',
      { SSO_GOOGLE_CLIENT_ID: 'i', SSO_GOOGLE_CLIENT_SECRET: '   ' },
    ],
    ['no hay ninguna variable', {}],
  ])('devuelve null si %s', (_caso, env) => {
    expect(crear(env).obtener('GOOGLE')).toBeNull();
  });

  it('con el par completo devuelve las URLs fijadas y la redirectUri derivada', () => {
    const config = crear({
      SSO_GOOGLE_CLIENT_ID: 'gid',
      SSO_GOOGLE_CLIENT_SECRET: 'gsecret',
    }).obtener('GOOGLE');
    expect(config).toEqual({
      clientId: 'gid',
      clientSecret: 'gsecret',
      urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth',
      urlToken: 'https://oauth2.googleapis.com/token',
      urlJwks: 'https://www.googleapis.com/oauth2/v3/certs',
      emisores: ['https://accounts.google.com', 'accounts.google.com'],
      redirectUri: `${BASE}/api/auth/sso/google/callback`,
    });
  });

  it('Microsoft lleva la plantilla del emisor y su propia redirectUri', () => {
    const config = crear({
      SSO_MICROSOFT_CLIENT_ID: 'mid',
      SSO_MICROSOFT_CLIENT_SECRET: 'msecret',
    }).obtener('MICROSOFT');
    expect(config).toMatchObject({
      urlAutorizacion: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      urlToken: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      urlJwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
      plantillaEmisor: 'https://login.microsoftonline.com/{tid}/v2.0',
      redirectUri: `${BASE}/api/auth/sso/microsoft/callback`,
    });
    expect(config?.emisores).toBeUndefined();
  });

  it('los proveedores se habilitan por separado', () => {
    const configuracion = crear({ SSO_GOOGLE_CLIENT_ID: 'i', SSO_GOOGLE_CLIENT_SECRET: 's' });
    expect(configuracion.obtener('GOOGLE')).not.toBeNull();
    expect(configuracion.obtener('MICROSOFT')).toBeNull();
  });

  it('lee el entorno en cada llamada', () => {
    const env: NodeJS.ProcessEnv = {};
    const configuracion = crear(env);
    expect(configuracion.obtener('GOOGLE')).toBeNull();
    env.SSO_GOOGLE_CLIENT_ID = 'i';
    env.SSO_GOOGLE_CLIENT_SECRET = 's';
    expect(configuracion.obtener('GOOGLE')).not.toBeNull();
    env.SSO_GOOGLE_CLIENT_SECRET = '';
    expect(configuracion.obtener('GOOGLE')).toBeNull();
  });

  it('la redirectUri sale de la base configurada, no de la peticion', () => {
    const otra = new ConfiguracionSsoDesdeEntorno('http://localhost:5173', {
      SSO_GOOGLE_CLIENT_ID: 'i',
      SSO_GOOGLE_CLIENT_SECRET: 's',
    });
    expect(otra.obtener('GOOGLE')?.redirectUri).toBe(
      'http://localhost:5173/api/auth/sso/google/callback',
    );
  });
});
