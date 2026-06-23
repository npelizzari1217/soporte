import { DomainError } from '../../../shared/domain/result';

/**
 * Error de validación de archivo: tamano_bytes debe ser mayor a 0.
 * Ref spec: [SPEC:tickets-core/archivos — CHECK tamano_bytes > 0]
 */
export class ArchivoTamanoCeroError extends DomainError {
  readonly code = 'ARCHIVO_TAMANO_CERO';

  constructor(tamanoBytes: bigint) {
    super(`tamano_bytes debe ser mayor a 0, se recibió: ${tamanoBytes.toString()}`);
  }
}
