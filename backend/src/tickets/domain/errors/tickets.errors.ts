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
 * Error de validación HTTP 422: el `nuevoEstadoCodigo` enviado por el usuario
 * no existe en el catálogo de estados del tenant.
 *
 * Semánticamente distinto de `EstadoCatalogoNoEncontradoError`:
 * - Este error surge de la entrada del usuario (el código destino que envía en el body).
 *   → HTTP 422 Unprocessable Entity.
 * - `EstadoCatalogoNoEncontradoError` surge cuando el estado ACTUAL del ticket
 *   (campo estadoId en DB) no tiene registro en el catálogo → corrupción de datos → HTTP 500.
 *
 * Ref spec: [SPEC:tickets-core/Transición válida]
 * Tarea: fix CRITICAL-1 verify PR-11
 */
export class EstadoDestinoInvalidoError extends DomainError {
  readonly code = 'ESTADO_DESTINO_INVALIDO';

  constructor(codigoDestino: string) {
    super(
      `El código de estado destino "${codigoDestino}" no existe en el catálogo de estados del tenant.`,
    );
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
 * Error de validación cross-DB: el asignado_id no existe en master.usuarios
 * con activo = TRUE, o no pertenece al tenant del JWT.
 *
 * HTTP 422 semántico — la asignación fue rechazada antes de modificar el ticket.
 *
 * Ref spec: [SPEC:tickets-core/Asignado debe ser elegible para el tipo de ticket]
 * Tarea: 3.C.4
 */
export class AsignadoInvalidoError extends DomainError {
  readonly code = 'ASIGNADO_INVALIDO';

  constructor(asignadoId: string) {
    super(
      `El asignado "${asignadoId}" no existe en master.usuarios con activo=TRUE, ` +
        `está eliminado, o no pertenece al tenant activo.`,
    );
  }
}

/**
 * Error de elegibilidad: el asignado_id no tiene registro en usuario_tipos_ticket
 * para el tipo de ticket del ticket a asignar.
 *
 * HTTP 422 semántico — la elegibilidad es independiente de los permisos RBAC.
 * Un usuario puede tener permiso ticket:asignar pero no estar habilitado para
 * atender tickets de un tipo específico.
 *
 * Ref spec: [SPEC:tickets-core/Elegibilidad de asignación separada de permisos]
 * Tarea: 3.C.4
 */
export class AsignadoNoElegibleError extends DomainError {
  readonly code = 'ASIGNADO_NO_ELEGIBLE';

  constructor(asignadoId: string, tipoTicketId: string) {
    super(
      `El usuario "${asignadoId}" no está habilitado para atender tickets de tipo ` +
        `"${tipoTicketId}". Verificar usuario_tipos_ticket.`,
    );
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

// ─── S2 — Errores de edición de ticket ───────────────────────────────────────

/**
 * Error de dominio: el ticket está en estado terminal (CERRADO/CANCELADO) y no puede
 * ser editado. HTTP 422 semántico.
 *
 * Ref spec: [SPEC:tickets-core/Edición rechazada — ticket en estado terminal]
 */
export class TicketNoEditableError extends DomainError {
  readonly code = 'TICKET_NO_EDITABLE';

  constructor(estadoCodigo: string) {
    super(
      `El ticket no puede ser editado porque se encuentra en estado terminal "${estadoCodigo}".`,
    );
  }
}

/**
 * Error de dominio: el título enviado está vacío o contiene solo espacios en blanco.
 * HTTP 422 semántico — invariante de la entidad.
 *
 * Ref spec: [SPEC:tickets-core/Edición exitosa de campos de datos]
 */
export class TituloInvalidoError extends DomainError {
  readonly code = 'TITULO_INVALIDO';

  constructor() {
    super('El título del ticket no puede estar vacío o contener solo espacios en blanco.');
  }
}

/**
 * Error de validación FK: la prioridad enviada por el usuario no existe en el
 * catálogo de prioridades del tenant. HTTP 422 semántico.
 *
 * Ref spec: tickets-editar-borrar locked decision L4
 */
export class PrioridadNoEncontradaError extends DomainError {
  readonly code = 'PRIORIDAD_NO_ENCONTRADA';

  constructor(prioridadId: string) {
    super(`La prioridad con id "${prioridadId}" no existe en el catálogo del tenant.`);
  }
}

/**
 * Error de validación FK: el cicloId enviado por el usuario no existe en el
 * catálogo de ciclos del tenant. HTTP 422 semántico.
 *
 * Ref spec: tickets-editar-borrar locked decision L4
 */
export class CicloNoEncontradoError extends DomainError {
  readonly code = 'CICLO_NO_ENCONTRADO';

  constructor(cicloId: string) {
    super(`El ciclo con id "${cicloId}" no existe en el catálogo del tenant.`);
  }
}
