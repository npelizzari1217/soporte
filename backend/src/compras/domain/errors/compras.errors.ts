import { DomainError } from '../../../shared/domain/result';

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
