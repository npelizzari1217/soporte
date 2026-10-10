import { ProveedorSso } from '../sso/proveedores-sso';

/** Configuracion de un proveedor ya habilitado (sdd/login-sso, ADR-3). */
export interface ConfigProveedorSso {
  clientId: string;
  clientSecret: string;
  urlAutorizacion: string;
  urlToken: string;
  urlJwks: string;
  redirectUri: string;
  /** Emisores aceptados (Google). */
  emisores?: string[];
  /** Plantilla con `{tid}` (Microsoft). */
  plantillaEmisor?: string;
}

/**
 * IConfiguracionSso — puerto de la configuracion SSO (sdd/login-sso, ADR-3 y ADR-10). La
 * implementacion que lee el entorno vive en infraestructura.
 */
export interface IConfiguracionSso {
  /** `null` si el proveedor no tiene su par client id y client secret completo. */
  obtener(proveedor: ProveedorSso): ConfigProveedorSso | null;
}

export const CONFIGURACION_SSO = Symbol('IConfiguracionSso');
