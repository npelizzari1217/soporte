import { DomainError } from '../../../shared/domain/result';

// ─── Application-level errors (use case failures) ────────────────────────────

/**
 * Error de validación cross-DB: el solicitante_id no existe en master.usuarios
 * con deleted_at IS NULL o no pertenece al tenant del JWT.
 *
 * Ref spec: [SPEC:tickets-core/Validación soft refs cross-DB]
 * Tarea: 3.C.2
 */
export class SolicitanteInvalidoError extends DomainError {
  readonly code = 'SOLICITANTE_INVALIDO';

  constructor(solicitanteId: string) {
    super(
      `El solicitante "${solicitanteId}" no existe en master.usuarios, ` +
        `está eliminado, o no pertenece al tenant activo.`,
    );
  }
}

/**
 * Error de catálogo: un estado esperado no se encontró en la tabla estados del tenant.
 * Ocurre cuando el catálogo no fue sembrado correctamente en provisioning.
 *
 * Ref spec: [SPEC:tickets-core/Estado inicial ABIERTO, Transición válida]
 * Tarea: 3.C.2, 3.C.6
 */
export class EstadoCatalogoNoEncontradoError extends DomainError {
  readonly code = 'ESTADO_CATALOGO_NO_ENCONTRADO';

  constructor(codigoOId: string) {
    super(
      `Estado "${codigoOId}" no encontrado en el catálogo de estados del tenant. ` +
        `Verificar que el seed de provisioning fue ejecutado correctamente.`,
    );
  }
}

/**
 * Error de catálogo: el tipo de ticket no se encontró en tipos_ticket del tenant.
 * Indica un tipoId inválido o catálogo no inicializado.
 *
 * Tarea: 3.C.2, 3.C.6
 */
export class TipoTicketNoEncontradoError extends DomainError {
  readonly code = 'TIPO_TICKET_NO_ENCONTRADO';

  constructor(tipoId: string) {
    super(`Tipo de ticket con id "${tipoId}" no encontrado en el catálogo del tenant.`);
  }
}

/**
 * Error de catálogo: el tipo de operación no se encontró en tipo_operacion del tenant.
 * Indica que el catálogo de operaciones no fue sembrado correctamente.
 *
 * Tarea: 3.C.2, 3.C.6
 */
export class TipoOperacionNoEncontradoError extends DomainError {
  readonly code = 'TIPO_OPERACION_NO_ENCONTRADO';

  constructor(codigo: string) {
    super(
      `Tipo de operación "${codigo}" no encontrado en el catálogo del tenant. ` +
        `Verificar que el seed de provisioning fue ejecutado correctamente.`,
    );
  }
}

/**
 * Error de búsqueda: el ticket con el id indicado no existe.
 * HTTP 404 semántico.
 *
 * Tarea: 3.C.6
 */
export class TicketNoEncontradoError extends DomainError {
  readonly code = 'TICKET_NO_ENCONTRADO';

  constructor(ticketId: string) {
    super(`Ticket con id "${ticketId}" no encontrado.`);
  }
}

/**
 * Error de dominio: la transición de estado fue rechazada.
 * Puede ser porque la entidad viola invariantes (soft-delete, estado terminal)
 * o porque la máquina de estados del tipo de ticket la prohíbe.
 * HTTP 422 semántico — el estado NO fue modificado.
 *
 * Ref spec: [SPEC:tickets-core/Transición inválida rechazada]
 * Tarea: 3.C.6
 */
export class TransicionInvalidaError extends DomainError {
  readonly code = 'TRANSICION_INVALIDA';

  constructor(desde: string, hacia: string, razon?: string) {
    const base = `Transición de estado inválida: "${desde}" → "${hacia}".`;
    super(razon ? `${base} ${razon}` : base);
  }
}

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
