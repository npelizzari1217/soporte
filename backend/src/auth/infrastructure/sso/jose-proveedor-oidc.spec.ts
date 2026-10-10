import { iniciarIdpFalso, IdpFalso } from '../../../testing/idp-falso';
import { SsoNoDisponibleError, SsoRechazadoError } from '../../domain/errors/sso.errors';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';
import { ConfigProveedorSso, IConfiguracionSso } from '../../domain/ports/configuracion-sso.port';
import { JoseProveedorOidc } from './jose-proveedor-oidc';

const NONCE = 'nonce-guardado';
const TID = 'tenant-1';
const CLIENT_ID = 'client-id-prueba';
const DATOS = { code: 'codigo-1', codeVerifier: 'verifier-1', nonce: NONCE };

let idp: IdpFalso;

function configuracion(urlToken = idp.urlToken, urlJwks = idp.urlJwks): IConfiguracionSso {
  const base: ConfigProveedorSso = {
    clientId: CLIENT_ID,
    clientSecret: 'secreto-prueba',
    urlAutorizacion: 'https://idp.example/authorize',
    urlToken,
    urlJwks,
    redirectUri: 'https://app.example/api/auth/sso/google/callback',
  };
  return {
    obtener: (proveedor: ProveedorSso) =>
      proveedor === 'GOOGLE'
        ? { ...base, emisores: ['https://accounts.google.com', 'accounts.google.com'] }
        : { ...base, plantillaEmisor: 'https://login.microsoftonline.com/{tid}/v2.0' },
  };
}

function claimsGoogle(sobrescribir: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'sub-1',
    nonce: NONCE,
    email: 'ana@empresa.com',
    email_verified: true,
    ...sobrescribir,
  };
}

function claimsMicrosoft(sobrescribir: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: `https://login.microsoftonline.com/${TID}/v2.0`,
    aud: CLIENT_ID,
    tid: TID,
    oid: 'oid-1',
    ver: '2.0',
    nonce: NONCE,
    email: 'ana@empresa.com',
    xms_edov: true,
    ...sobrescribir,
  };
}

async function motivoDe(promesa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof SsoRechazadoError) return error.motivo;
    throw error;
  }
  return undefined;
}

describe('JoseProveedorOidc', () => {
  beforeAll(async () => {
    idp = await iniciarIdpFalso();
  });
  afterAll(() => idp.cerrar());
  beforeEach(() => {
    idp.llamadasToken.length = 0;
  });

  async function verificar(
    claims: Record<string, unknown>,
    firma?: Parameters<IdpFalso['firmar']>[1],
    proveedor: ProveedorSso = 'GOOGLE',
  ) {
    idp.responderToken({ idToken: await idp.firmar(claims, firma) });
    return new JoseProveedorOidc(configuracion()).verificarCodigo(proveedor, DATOS);
  }

  it('Google valido devuelve subject y email, y el /token usa client_secret_post con PKCE', async () => {
    await expect(verificar(claimsGoogle())).resolves.toEqual({
      subject: 'sub-1',
      email: 'ana@empresa.com',
    });
    expect(idp.llamadasToken).toHaveLength(1);
    expect(Object.fromEntries(idp.llamadasToken[0])).toEqual({
      grant_type: 'authorization_code',
      code: 'codigo-1',
      code_verifier: 'verifier-1',
      redirect_uri: 'https://app.example/api/auth/sso/google/callback',
      client_id: CLIENT_ID,
      client_secret: 'secreto-prueba',
    });
  });

  it('Microsoft valido devuelve tid:oid y el email', async () => {
    await expect(verificar(claimsMicrosoft(), 'RS256', 'MICROSOFT')).resolves.toEqual({
      subject: `${TID}:oid-1`,
      email: 'ana@empresa.com',
    });
  });

  const ahora = () => Math.floor(Date.now() / 1000);
  it.each([
    ['firma de otra clave', () => verificar(claimsGoogle(), 'RS256-clave-ajena')],
    ['aud distinto', () => verificar(claimsGoogle({ aud: 'otro-client' }))],
    ['iss distinto en Google', () => verificar(claimsGoogle({ iss: 'https://evil.example' }))],
    ['vencido', () => verificar(claimsGoogle({ exp: ahora() - 120 }))],
    ['nbf futuro', () => verificar(claimsGoogle({ nbf: ahora() + 120 }))],
    ['nonce distinto', () => verificar(claimsGoogle({ nonce: 'otro' }))],
    ['alg none', () => verificar(claimsGoogle(), 'none')],
    ['alg HS256', () => verificar(claimsGoogle(), 'HS256')],
    [
      'Microsoft con iss distinto del tid',
      () => verificar(claimsMicrosoft({ tid: 'otro-tenant' }), 'RS256', 'MICROSOFT'),
    ],
    [
      'Microsoft con ver 1.0',
      () => verificar(claimsMicrosoft({ ver: '1.0' }), 'RS256', 'MICROSOFT'),
    ],
  ])('rechaza con TOKEN_INVALIDO: %s', async (_caso, ejecutar) => {
    await expect(motivoDe(ejecutar())).resolves.toBe('TOKEN_INVALIDO');
  });

  it('rechaza con EMAIL_NO_VERIFICADO cuando el proveedor no verifico el email', async () => {
    await expect(motivoDe(verificar(claimsGoogle({ email_verified: false })))).resolves.toBe(
      'EMAIL_NO_VERIFICADO',
    );
  });

  it('una respuesta no 2xx del /token lanza un error comun, no un rechazo', async () => {
    idp.responderToken({ estado: 502 });
    const error = await new JoseProveedorOidc(configuracion())
      .verificarCodigo('GOOGLE', DATOS)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SsoRechazadoError);
  });

  it('una caida de red lanza un error comun, no un rechazo', async () => {
    const caido = await iniciarIdpFalso();
    const urlToken = caido.urlToken;
    await caido.cerrar();
    const error = await new JoseProveedorOidc(configuracion(urlToken))
      .verificarCodigo('GOOGLE', DATOS)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SsoRechazadoError);
  });

  it('un proveedor sin configuracion lanza SsoNoDisponibleError', () => {
    const oidc = new JoseProveedorOidc({ obtener: () => null });
    const parametros = { state: 's', nonce: 'n', codeChallenge: 'c' };
    expect(() => oidc.construirUrlAutorizacion('GOOGLE', parametros)).toThrow(SsoNoDisponibleError);
  });

  it('arma la URL de autorizacion con los parametros de ADR-2', () => {
    const url = new URL(
      new JoseProveedorOidc(configuracion()).construirUrlAutorizacion('GOOGLE', {
        state: 'st',
        nonce: 'no',
        codeChallenge: 'ch',
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe('https://idp.example/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: 'https://app.example/api/auth/sso/google/callback',
      scope: 'openid email profile',
      state: 'st',
      nonce: 'no',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      response_mode: 'query',
      prompt: 'select_account',
    });
  });
});
