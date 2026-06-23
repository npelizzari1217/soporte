import { DomainError } from '../../../shared/domain/result';

// ─── Application-level errors (use case failures) ────────────────────────────

/**
 * Error de validación: la cantidad de un ítem de compra debe ser mayor a 0.
 *
 * Ref spec: [SPEC:compras/Tabla items_compra — CHECK cantidad > 0]
 * Tarea: 4.A.1 / 4.A.2
 */
export class CantidadInvalidaError extends DomainError {
  readonly code = 'CANTIDAD_INVALIDA';

  constructor(cantidad: number) {
    super(`La cantidad debe ser mayor a 0, se recibió: ${cantidad}`);
  }
}

/**
 * Error de validación: la moneda del presupuesto no es un código ISO 4217 aceptado.
 * Valores válidos: ARS, USD, EUR.
 *
 * Ref spec: [SPEC:compras/Tabla presupuestos — moneda ISO 4217]
 * Tarea: 4.A.1 / 4.A.2
 */
export class MonedaInvalidaError extends DomainError {
  readonly code = 'MONEDA_INVALIDA';

  constructor(moneda: string) {
    super(`La moneda "${moneda}" no es válida. ` + `Valores ISO 4217 aceptados: ARS, USD, EUR.`);
  }
}

/**
 * Error de validación: el ticket cuyo satélite se intenta crear no es de tipo COMPRAS.
 *
 * Ref spec: [SPEC:compras/Satélite obligatorio — solo tickets de tipo COMPRAS]
 * Tarea: 4.B.1 / 4.B.2
 */
export class TicketNoEsComprasError extends DomainError {
  readonly code = 'TICKET_NO_ES_COMPRAS';

  constructor(tipoCodigo: string) {
    super(
      `El ticket es de tipo "${tipoCodigo}", no de tipo "COMPRAS". ` +
        `No se puede crear el satélite ticket_compra para un ticket que no es de tipo COMPRAS.`,
    );
  }
}

/**
 * Error de búsqueda: el satélite ticket_compra no existe para el ticket indicado.
 * Puede indicar que el ticket no es de tipo COMPRAS o que el satélite no fue creado.
 *
 * Ref spec: [SPEC:compras/Satélite obligatorio]
 * Tarea: 4.B.3 / 4.B.5
 */
export class TicketCompraNoEncontradoError extends DomainError {
  readonly code = 'TICKET_COMPRA_NO_ENCONTRADO';

  constructor(ticketId: string) {
    super(
      `No se encontró ticket_compra para el ticket "${ticketId}". ` +
        `El ticket puede no ser de tipo COMPRAS o el satélite no fue creado correctamente.`,
    );
  }
}

/**
 * Error de validación: el ticket de compra no tiene ítems activos para enviar a aprobación.
 * Se requiere al menos un ítem con deleted_at IS NULL.
 *
 * Ref spec: [SPEC:compras/Gestión de ítems — al menos un ítem activo para aprobación]
 * Tarea: 4.B.3 / 4.B.4
 */
export class SinItemsActivosError extends DomainError {
  readonly code = 'SIN_ITEMS_ACTIVOS';

  constructor(ticketCompraId: string) {
    super(
      `El ticket_compra "${ticketCompraId}" no tiene ítems activos (deleted_at IS NULL). ` +
        `Se requiere al menos un ítem para enviar a aprobación.`,
    );
  }
}

/**
 * Error de validación: el motivo de rechazo es obligatorio al rechazar un ticket de compra.
 * El campo motivo_rechazo MUST ser una cadena no vacía cuando la decisión es RECHAZADO.
 *
 * Ref spec: [SPEC:compras/Rechazo requiere motivo]
 * Tarea: 4.B.5 / 4.B.6
 */
export class MotivoRechazoRequeridoError extends DomainError {
  readonly code = 'MOTIVO_RECHAZO_REQUERIDO';

  constructor() {
    super(
      `El motivo de rechazo es obligatorio al rechazar un ticket de compra. ` +
        `Proveer un texto descriptivo en el campo motivo_rechazo.`,
    );
  }
}

/**
 * Error de búsqueda: el ítem de compra con el id indicado no existe o fue eliminado.
 * HTTP 404 semántico.
 *
 * Ref spec: [SPEC:compras/Gestión de ítems]
 * Tarea: 4.D.1 / 4.D.2
 */
export class ItemCompraNoEncontradoError extends DomainError {
  readonly code = 'ITEM_COMPRA_NO_ENCONTRADO';

  constructor(itemId: string) {
    super(`Ítem de compra con id "${itemId}" no encontrado o fue eliminado (soft delete).`);
  }
}

/**
 * Error de búsqueda: el presupuesto con el id indicado no existe o fue eliminado.
 * HTTP 404 semántico.
 *
 * Ref spec: [SPEC:compras/Selección única de presupuesto]
 * Tarea: 4.B.7 / 4.B.8
 */
export class PresupuestoNoEncontradoError extends DomainError {
  readonly code = 'PRESUPUESTO_NO_ENCONTRADO';

  constructor(presupuestoId: string) {
    super(`Presupuesto con id "${presupuestoId}" no encontrado o fue eliminado (soft delete).`);
  }
}
