import { createHash, randomBytes } from 'node:crypto';

/**
 * Primitivas del flujo OIDC con PKCE (sdd/login-sso, SL9; RFC 7636). Todo valor aleatorio sale
 * de `node:crypto` y viaja en base64url, que cae dentro del alfabeto no reservado del RFC.
 */

/** 32 bytes aleatorios en base64url: 43 caracteres, el minimo que exige el RFC 7636. */
export function generarAleatorioUrl(): string {
  return randomBytes(32).toString('base64url');
}

/** `code_verifier` PKCE. */
export function generarCodeVerifier(): string {
  return generarAleatorioUrl();
}

/** `code_challenge` con metodo S256: base64url(sha256(verifier)), sin relleno. */
export function calcularCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

/** sha256 en hexadecimal: lo unico que se persiste del `state` y del `bindingToken`. */
export function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}
