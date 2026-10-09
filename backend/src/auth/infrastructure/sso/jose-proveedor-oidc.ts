import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { SsoNoDisponibleError, SsoRechazadoError } from '../../domain/errors/sso.errors';
import {
  IProveedorOidc,
  ParametrosAutorizacionSso,
  VerificarCodigoSso,
} from '../../domain/ports/proveedor-oidc.port';
import { IdentidadSsoVerificada } from '../../domain/sso/identidad-sso-verificada';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';
import { ConfigProveedorSso, IConfiguracionSso } from './configuracion-sso';
import { validarClaimsGoogle } from './validar-claims-google';
import { validarClaimsMicrosoft } from './validar-claims-microsoft';

const TIMEOUT_MS = 10_000;
const TOLERANCIA_RELOJ_S = 30;

type ConjuntoJwks = ReturnType<typeof createRemoteJWKSet>;

/** Errores de `jose` que significan "este token no vale"; cualquier otro es un fallo de infraestructura. */
function esTokenInvalido(error: unknown): boolean {
  return (
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTExpired ||
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported ||
    error instanceof errors.JWKSNoMatchingKey
  );
}

/**
 * JoseProveedorOidc — adaptador OIDC sobre `jose` 6 y `fetch` (sdd/login-sso, ADR-2). Es el unico
 * importador de `jose` en produccion. Un token que no pasa lanza `SsoRechazadoError`; una respuesta
 * no 2xx del `/token` o una caida de red lanzan un error comun (500), nunca un rechazo.
 */
export class JoseProveedorOidc implements IProveedorOidc {
  private readonly jwksPorUrl = new Map<string, ConjuntoJwks>();

  constructor(private readonly configuracion: IConfiguracionSso) {}

  construirUrlAutorizacion(proveedor: ProveedorSso, parametros: ParametrosAutorizacionSso): string {
    const config = this.configDe(proveedor);
    const url = new URL(config.urlAutorizacion);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'openid email profile',
      state: parametros.state,
      nonce: parametros.nonce,
      code_challenge: parametros.codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
      prompt: 'select_account',
    }).toString();
    return url.toString();
  }

  async verificarCodigo(
    proveedor: ProveedorSso,
    datos: VerificarCodigoSso,
  ): Promise<IdentidadSsoVerificada> {
    const config = this.configDe(proveedor);
    const idToken = await this.canjearCodigo(config, datos);
    let claims: Record<string, unknown>;
    try {
      // Sin `issuer`: lo comparan los validadores (Microsoft usa el `tid` del propio token).
      const { payload } = await jwtVerify(idToken, this.jwksDe(config.urlJwks), {
        algorithms: ['RS256'],
        audience: config.clientId,
        clockTolerance: TOLERANCIA_RELOJ_S,
      });
      claims = payload;
    } catch (error) {
      if (esTokenInvalido(error)) throw new SsoRechazadoError('TOKEN_INVALIDO');
      throw error;
    }
    if (proveedor === 'GOOGLE') {
      return validarClaimsGoogle(claims, datos.nonce, config.emisores ?? []);
    }
    return validarClaimsMicrosoft(claims, datos.nonce, config.plantillaEmisor ?? '');
  }

  private configDe(proveedor: ProveedorSso): ConfigProveedorSso {
    const config = this.configuracion.obtener(proveedor);
    if (config === null) throw new SsoNoDisponibleError();
    return config;
  }

  private jwksDe(url: string): ConjuntoJwks {
    let jwks = this.jwksPorUrl.get(url);
    if (jwks === undefined) {
      jwks = createRemoteJWKSet(new URL(url), { timeoutDuration: TIMEOUT_MS });
      this.jwksPorUrl.set(url, jwks);
    }
    return jwks;
  }

  /** `client_secret_post` con PKCE; devuelve el `id_token` crudo. */
  private async canjearCodigo(
    config: ConfigProveedorSso,
    datos: VerificarCodigoSso,
  ): Promise<string> {
    const respuesta = await fetch(config.urlToken, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: datos.code,
        code_verifier: datos.codeVerifier,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) {
      throw new Error(`El endpoint de token del proveedor respondio ${respuesta.status}.`);
    }
    const cuerpo: unknown = await respuesta.json();
    const idToken =
      typeof cuerpo === 'object' && cuerpo !== null
        ? (cuerpo as Record<string, unknown>).id_token
        : undefined;
    if (typeof idToken !== 'string' || idToken === '') {
      throw new Error('La respuesta del endpoint de token no trae id_token.');
    }
    return idToken;
  }
}
