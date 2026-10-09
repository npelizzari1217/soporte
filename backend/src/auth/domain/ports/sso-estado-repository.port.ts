import { ProveedorSso } from '../sso/proveedores-sso';

/**
 * ISsoEstadoRepository — puerto del estado de un flujo SSO (sdd/login-sso, ADR-1).
 * Solo viajan hashes del `state` y del `bindingToken`: el valor crudo nunca se persiste.
 */
export interface NuevoSsoEstado {
  /** sha256 hex del `state` crudo. */
  stateHash: string;
  proveedor: ProveedorSso;
  nonce: string;
  codeVerifier: string;
  /** sha256 hex del `bindingToken` (cookie `sso_st`). */
  navegadorHash: string;
  /** Destino posterior al login, ya saneado. */
  siguiente: string | null;
  expiraAt: Date;
}

export interface SsoEstadoConsumido {
  nonce: string;
  codeVerifier: string;
  siguiente: string | null;
}

export interface ConsumirSsoEstado {
  stateHash: string;
  proveedor: ProveedorSso;
  navegadorHash: string;
}

export interface ISsoEstadoRepository {
  crear(estado: NuevoSsoEstado): Promise<void>;
  /**
   * CAS de un solo uso (ADR-1): marca el estado como usado solo si coinciden hash, proveedor y
   * navegador, no fue usado y no expiro. `null` cubre replay, vencido, inventado, proveedor
   * cruzado y navegador ajeno; en los dos ultimos la fila sigue consumible.
   */
  consumir(datos: ConsumirSsoEstado): Promise<SsoEstadoConsumido | null>;
}

export const SSO_ESTADO_REPOSITORY = Symbol('ISsoEstadoRepository');
