import { DomainError } from '../../../shared/domain/result';

/**
 * SegundoPasoRechazadoError — codigo erroneo, bloqueo, desafio invalido o secreto indescifrable.
 * Un unico mensaje generico: no distingue las causas (sdd/verificacion-dos-pasos, ADR-1).
 * → HTTP 401 en la capa de presentacion.
 */
export class SegundoPasoRechazadoError extends DomainError {
  readonly code = 'AUTH_SEGUNDO_PASO_RECHAZADO';

  constructor() {
    super('No se pudo verificar el segundo paso.');
  }
}

/** El secreto TOTP no descifra (clave rotada mal, AAD ajeno, payload roto). T12. */
export class SecretoTotpIndescifrableError extends DomainError {
  readonly code = 'AUTH_SECRETO_TOTP_INDESCIFRABLE';

  constructor() {
    super('El secreto TOTP no se pudo descifrar.');
  }
}
