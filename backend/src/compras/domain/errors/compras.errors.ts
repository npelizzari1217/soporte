import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio del módulo `compras/` (Fase 3, F3-C1..C6).
 *
 * Mismo patrón que `tickets/domain/errors/tickets.errors.ts`: cada error
 * extiende `DomainError`, expone un `code` estable y se modela con
 * `Result.fail()` — nunca `throw` para fallos esperados del dominio.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1..C6. Ref design: "Firmas TS
 * clave" (lista de errores de compras.errors.ts). Tarea: T2.7.
 */

/**
 * CompraNoEncontradaError — el `ticket_compra` con el id/ticketId indicado
 * no existe (o no fue creado — el ticket puede no ser de tipo COMPRAS).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-C2, F3-C3, F3-C4, F3-C5.
 */
export class CompraNoEncontradaError extends DomainError {
  readonly code = 'COMPRA_NO_ENCONTRADA';

  constructor(id: string) {
    super(`Ticket de compra con id "${id}" no encontrado.`);
  }
}

/**
 * CompraYaDecididaError — se intentó aprobar/rechazar un `ticket_compra`
 * que ya tiene una decisión registrada (`aprobado_en IS NOT NULL` o
 * `motivo_rechazo IS NOT NULL`). "Un solo paso" = una única decisión,
 * sin doble aprobación/rechazo (ADR-1).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-C4, F3-C5.
 */
export class CompraYaDecididaError extends DomainError {
  readonly code = 'COMPRA_YA_DECIDIDA';

  constructor(ticketCompraId: string) {
    super(
      `El ticket de compra "${ticketCompraId}" ya tiene una decisión registrada ` +
        `(aprobado o rechazado). No se admite una segunda decisión.`,
    );
  }
}

/**
 * MotivoRechazoRequeridoError — `motivoRechazo` es vacío/ausente al
 * rechazar un ticket de compra.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-C5.
 */
export class MotivoRechazoRequeridoError extends DomainError {
  readonly code = 'MOTIVO_RECHAZO_REQUERIDO';

  constructor() {
    super(
      'El motivo de rechazo es obligatorio al rechazar un ticket de compra. ' +
        'Proveer un texto descriptivo no vacío en motivoRechazo.',
    );
  }
}

/**
 * MonedaInvalidaError — el código de moneda del presupuesto no es un
 * código ISO 4217 aceptado (ARS, USD, EUR).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-C3.
 */
export class MonedaInvalidaError extends DomainError {
  readonly code = 'MONEDA_INVALIDA';

  constructor(moneda: string) {
    super(`La moneda "${moneda}" no es válida. Valores ISO 4217 aceptados: ARS, USD, EUR.`);
  }
}

/**
 * MontoInvalidoError — `montoTotal` de un presupuesto es negativo
 * (CHECK monto_total >= 0).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-C3.
 */
export class MontoInvalidoError extends DomainError {
  readonly code = 'MONTO_INVALIDO';

  constructor(montoTotal: number) {
    super(`montoTotal debe ser mayor o igual a 0, se recibió: ${montoTotal}`);
  }
}

/**
 * CantidadInvalidaError — `cantidad` de un ítem de compra es menor o
 * igual a 0 (CHECK cantidad > 0).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-C2.
 */
export class CantidadInvalidaError extends DomainError {
  readonly code = 'CANTIDAD_INVALIDA';

  constructor(cantidad: number) {
    super(`La cantidad debe ser mayor a 0, se recibió: ${cantidad}`);
  }
}

/**
 * PresupuestoNoEncontradoError — el presupuesto con el id indicado no
 * existe, fue eliminado (soft delete), o no pertenece al `ticket_compra`
 * indicado.
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-C3.
 */
export class PresupuestoNoEncontradoError extends DomainError {
  readonly code = 'PRESUPUESTO_NO_ENCONTRADO';

  constructor(presupuestoId: string) {
    super(`Presupuesto con id "${presupuestoId}" no encontrado o fue eliminado.`);
  }
}

/**
 * ItemNoEncontradoError — el ítem de compra con el id indicado no existe
 * o fue eliminado (soft delete).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-C2.
 */
export class ItemNoEncontradoError extends DomainError {
  readonly code = 'ITEM_NO_ENCONTRADO';

  constructor(itemId: string) {
    super(`Ítem de compra con id "${itemId}" no encontrado o fue eliminado.`);
  }
}
