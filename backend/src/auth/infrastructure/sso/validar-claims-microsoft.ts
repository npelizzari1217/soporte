import { SsoRechazadoError } from '../../domain/errors/sso.errors';
import { IdentidadSsoVerificada } from '../../domain/sso/identidad-sso-verificada';

function esTextoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}

/**
 * Valida los claims de un ID token de Microsoft que `jwtVerify` ya acepto (ADR-3, defensa nOAuth).
 * `jwtVerify` corre SIN la opcion `issuer`: el emisor se compara aca, despues de la firma, contra
 * la plantilla armada con el `tid` del propio token. El email sale solo de `email` y solo con
 * `xms_edov === true`; `preferred_username`, `upn` y `unique_name` no se usan nunca.
 *
 * @param plantillaEmisor `ConfigProveedorSso.plantillaEmisor`, con `{tid}`.
 */
export function validarClaimsMicrosoft(
  claims: Readonly<Record<string, unknown>>,
  nonceEsperado: string,
  plantillaEmisor: string,
): IdentidadSsoVerificada {
  const { tid, oid } = claims;
  if (!esTextoNoVacio(tid) || !esTextoNoVacio(oid)) throw new SsoRechazadoError('TOKEN_INVALIDO');
  if (claims.iss !== plantillaEmisor.replace('{tid}', tid)) {
    throw new SsoRechazadoError('TOKEN_INVALIDO');
  }
  if (claims.ver !== '2.0') throw new SsoRechazadoError('TOKEN_INVALIDO');
  if (typeof claims.nonce !== 'string' || claims.nonce !== nonceEsperado) {
    throw new SsoRechazadoError('TOKEN_INVALIDO');
  }
  // Booleano estricto: la cadena "true" no verifica nada.
  if (claims.xms_edov !== true) throw new SsoRechazadoError('EMAIL_NO_VERIFICADO');
  if (!esTextoNoVacio(claims.email)) throw new SsoRechazadoError('EMAIL_NO_VERIFICADO');
  return { subject: `${tid}:${oid}`, email: claims.email };
}
