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

/**
 * Error del numerador: el código de tipo de ticket no tiene un prefijo registrado.
 * Ref spec: [SPEC:tickets-core/Numeración legible de tickets]
 */
export class TipoTicketDesconocidoError extends DomainError {
  readonly code = 'TIPO_TICKET_DESCONOCIDO';

  constructor(tipoCodigo: string, validos: string[]) {
    super(
      `NumeradorTicket: codigo de tipo desconocido "${tipoCodigo}". ` +
        `Valores válidos: ${validos.join(', ')}`,
    );
  }
}

/**
 * Error del numerador: la secuencia anual superaría los 5 dígitos (> 99999).
 * Evita generar números con 6+ dígitos que rompen el formato esperado.
 * Ref spec: [SPEC:tickets-core/Numeración legible de tickets]
 */
export class SecuenciaAgotadaError extends DomainError {
  readonly code = 'SECUENCIA_AGOTADA';

  constructor(tipoCodigo: string, anio: number) {
    super(
      `NumeradorTicket: la secuencia de "${tipoCodigo}" para el año ${anio} ` +
        `superó el máximo de 99999. No se pueden generar más números en este ciclo.`,
    );
  }
}
