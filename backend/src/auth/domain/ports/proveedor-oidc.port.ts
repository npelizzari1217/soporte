import { IdentidadSsoVerificada } from '../sso/identidad-sso-verificada';
import { ProveedorSso } from '../sso/proveedores-sso';

export interface ParametrosAutorizacionSso {
  state: string;
  nonce: string;
  /** Desafio PKCE S256 ya calculado. */
  codeChallenge: string;
}

export interface VerificarCodigoSso {
  code: string;
  codeVerifier: string;
  /** Nonce guardado al iniciar el flujo. */
  nonce: string;
}

/**
 * IProveedorOidc — puerto del protocolo OIDC (sdd/login-sso, ADR-2 y ADR-3). Sin `jose`:
 * el adaptador lo oculta.
 */
export interface IProveedorOidc {
  /** URL de autorizacion del proveedor; lanza `SsoNoDisponibleError` si no esta configurado. */
  construirUrlAutorizacion(proveedor: ProveedorSso, parametros: ParametrosAutorizacionSso): string;
  /**
   * Canjea el codigo, verifica el ID token y valida los claims. Un token que no pasa lanza
   * `SsoRechazadoError`; un fallo de red o un 5xx del proveedor se propaga como error comun.
   */
  verificarCodigo(
    proveedor: ProveedorSso,
    datos: VerificarCodigoSso,
  ): Promise<IdentidadSsoVerificada>;
}

export const PROVEEDOR_OIDC = Symbol('IProveedorOidc');
