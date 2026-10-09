import { DomainError } from '../../../shared/domain/result';

/**
 * Causas internas de un rechazo SSO (ADR-7). Solo van al log: la respuesta es siempre la misma.
 */
export const MOTIVOS_SSO_RECHAZADO = [
  'ESTADO_INVALIDO',
  'TOKEN_INVALIDO',
  'EMAIL_NO_VERIFICADO',
  'BLOQUEADO',
  'SIN_USUARIO',
  'AMBIGUO',
  'INACTIVO',
  'ROOT',
  'SIN_MEMBRESIA',
  'OTRA_CUENTA',
] as const;

export type MotivoSsoRechazado = (typeof MOTIVOS_SSO_RECHAZADO)[number];

/**
 * SsoRechazadoError — cualquier rechazo del login SSO. El mensaje es generico a proposito:
 * el `motivo` es interno y nunca debe llegar al usuario (SL13).
 * → HTTP 401 en la capa de presentacion.
 */
export class SsoRechazadoError extends DomainError {
  readonly code = 'AUTH_SSO_RECHAZADO';

  constructor(readonly motivo: MotivoSsoRechazado) {
    super('No se pudo iniciar sesion con el proveedor.');
  }
}

/** Proveedor sin su par de configuracion en el entorno (SC2). → HTTP 404 en la capa de presentacion. */
export class SsoNoDisponibleError extends DomainError {
  readonly code = 'AUTH_SSO_NO_DISPONIBLE';

  constructor() {
    super('El proveedor no esta disponible.');
  }
}
