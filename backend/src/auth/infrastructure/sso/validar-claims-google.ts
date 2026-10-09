import { SsoRechazadoError } from '../../domain/errors/sso.errors';
import { IdentidadSsoVerificada } from '../../domain/sso/identidad-sso-verificada';

function esTextoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}

/**
 * Valida los claims de un ID token de Google que `jwtVerify` ya acepto (ADR-3). Cada rechazo
 * lanza `SsoRechazadoError` con su `motivo`; `hd` se acepta y no se filtra.
 *
 * @param emisores emisores aceptados, de `ConfigProveedorSso.emisores`.
 */
export function validarClaimsGoogle(
  claims: Readonly<Record<string, unknown>>,
  nonceEsperado: string,
  emisores: readonly string[],
): IdentidadSsoVerificada {
  if (typeof claims.iss !== 'string' || !emisores.includes(claims.iss)) {
    throw new SsoRechazadoError('TOKEN_INVALIDO');
  }
  if (typeof claims.nonce !== 'string' || claims.nonce !== nonceEsperado) {
    throw new SsoRechazadoError('TOKEN_INVALIDO');
  }
  if (!esTextoNoVacio(claims.sub)) throw new SsoRechazadoError('TOKEN_INVALIDO');
  // Booleano estricto: la cadena "true" no verifica nada.
  if (claims.email_verified !== true) throw new SsoRechazadoError('EMAIL_NO_VERIFICADO');
  if (!esTextoNoVacio(claims.email)) throw new SsoRechazadoError('EMAIL_NO_VERIFICADO');
  return { subject: claims.sub, email: claims.email };
}
