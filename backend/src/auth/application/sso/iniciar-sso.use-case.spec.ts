/**
 * IniciarSsoUseCase (sdd/login-sso; SL9, SL10, SC2). Los parametros de la URL (scope,
 * response_mode, prompt, client_id, redirect_uri) los arma el adaptador y los cubre
 * `jose-proveedor-oidc.spec.ts`; aca se prueba lo que el caso de uso le entrega y lo que persiste.
 */
import type { Mocked } from 'vitest';
import { IniciarSsoUseCase, SSO_ESTADO_TTL_MS } from './iniciar-sso.use-case';
import { calcularCodeChallenge, sha256Hex } from './pkce';
import { SsoNoDisponibleError } from '../../domain/errors/sso.errors';
import { ConfigProveedorSso, IConfiguracionSso } from '../../domain/ports/configuracion-sso.port';
import { IProveedorOidc } from '../../domain/ports/proveedor-oidc.port';
import { ISsoEstadoRepository } from '../../domain/ports/sso-estado-repository.port';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';
import { unstubbed } from '../../../testing/mocks';

const AHORA = new Date('2026-10-10T12:00:00Z');

const config: ConfigProveedorSso = {
  clientId: 'id',
  clientSecret: 'secreto',
  urlAutorizacion: 'https://idp.test/auth',
  urlToken: 'https://idp.test/token',
  urlJwks: 'https://idp.test/jwks',
  redirectUri: 'https://soporte.test/api/auth/sso/google/callback',
};

describe('IniciarSsoUseCase', () => {
  let configuracion: Mocked<IConfiguracionSso>;
  let oidc: Mocked<IProveedorOidc>;
  let estados: Mocked<ISsoEstadoRepository>;
  let uc: IniciarSsoUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    configuracion = { obtener: vi.fn((_p: ProveedorSso) => config) };
    oidc = {
      construirUrlAutorizacion: vi.fn(() => 'https://idp.test/auth?x=1'),
      verificarCodigo: unstubbed('verificarCodigo'),
    };
    estados = { crear: vi.fn().mockResolvedValue(undefined), consumir: unstubbed('consumir') };
    uc = new IniciarSsoUseCase(configuracion, oidc, estados);
  });

  afterEach(() => vi.useRealTimers());

  it('devuelve el authorizeUrl del adaptador y el bindingToken', async () => {
    const out = await uc.execute({ proveedor: 'GOOGLE' });
    expect(out.authorizeUrl).toBe('https://idp.test/auth?x=1');
    expect(out.bindingToken.length).toBeGreaterThanOrEqual(43);
  });

  it('entrega al adaptador state, nonce y el desafio S256 del verifier guardado', async () => {
    await uc.execute({ proveedor: 'GOOGLE' });
    const [proveedor, params] = oidc.construirUrlAutorizacion.mock.calls[0];
    const guardado = estados.crear.mock.calls[0][0];
    expect(proveedor).toBe('GOOGLE');
    expect(params.nonce).toBe(guardado.nonce);
    expect(params.codeChallenge).toBe(calcularCodeChallenge(guardado.codeVerifier));
    expect(params.state).not.toBe(params.nonce);
  });

  it('persiste solo los hashes del state y del bindingToken, no los valores crudos', async () => {
    const out = await uc.execute({ proveedor: 'MICROSOFT' });
    const [, params] = oidc.construirUrlAutorizacion.mock.calls[0];
    const guardado = estados.crear.mock.calls[0][0];
    expect(guardado.stateHash).toBe(sha256Hex(params.state));
    expect(guardado.navegadorHash).toBe(sha256Hex(out.bindingToken));
    expect(guardado.proveedor).toBe('MICROSOFT');
    expect(JSON.stringify(guardado)).not.toContain(params.state);
    expect(JSON.stringify(guardado)).not.toContain(out.bindingToken);
  });

  it('expira a los 10 minutos', async () => {
    await uc.execute({ proveedor: 'GOOGLE' });
    expect(SSO_ESTADO_TTL_MS).toBe(600_000);
    expect(estados.crear.mock.calls[0][0].expiraAt).toEqual(new Date(AHORA.getTime() + 600_000));
  });

  it('guarda el siguiente tal como llega (ya saneado) y null si falta', async () => {
    await uc.execute({ proveedor: 'GOOGLE', siguiente: '/tickets' });
    await uc.execute({ proveedor: 'GOOGLE' });
    expect(estados.crear.mock.calls[0][0].siguiente).toBe('/tickets');
    expect(estados.crear.mock.calls[1][0].siguiente).toBeNull();
  });

  it('un proveedor sin configuracion lanza SsoNoDisponibleError sin tocar el adaptador ni la base', async () => {
    configuracion.obtener.mockReturnValue(null);
    await expect(uc.execute({ proveedor: 'GOOGLE' })).rejects.toBeInstanceOf(SsoNoDisponibleError);
    expect(oidc.construirUrlAutorizacion).not.toHaveBeenCalled();
    expect(estados.crear).not.toHaveBeenCalled();
  });
});
