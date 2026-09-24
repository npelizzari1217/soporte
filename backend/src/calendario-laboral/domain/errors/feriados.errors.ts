import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio del módulo `calendario-laboral/feriados` (WU1,
 * sdd/feriados-configurables). Foundation compartido para las dos
 * capacidades (`feriados-globales`, `feriados-cliente`) — algunos recién se
 * lanzan desde WU3/WU4. Mismo patrón que `equipos/domain/errors/equipos.errors.ts`:
 * cada error extiende `DomainError` y se modela con `Result.fail()`, nunca `throw`.
 */

/** Fecha inválida: no matchea `'YYYY-MM-DD'` o no existe (ej. `2026-02-30`). → HTTP 422 (D7). */
export class FechaCalendarioInvalidaError extends DomainError {
  readonly code = 'FECHA_CALENDARIO_INVALIDA';

  constructor(valorRecibido: string) {
    super(
      `"${valorRecibido}" no es una fecha de calendario válida. Se espera el formato ` +
        `'YYYY-MM-DD' y una fecha que exista realmente en el calendario.`,
    );
  }
}

/** Ya existe un feriado (global, o del mismo cliente) para esa fecha. → HTTP 422 (D7 / D4). */
export class FeriadoFechaDuplicadaError extends DomainError {
  readonly code = 'FERIADO_FECHA_DUPLICADA';

  constructor(fecha: string) {
    super(`Ya existe un feriado registrado para la fecha "${fecha}".`);
  }
}

/** Un cliente intentó agregar como propia una fecha ya global (WU4, D4). → HTTP 422. */
export class FeriadoFechaEsGlobalError extends DomainError {
  readonly code = 'FERIADO_FECHA_ES_GLOBAL';

  constructor(fecha: string) {
    super(
      `La fecha "${fecha}" ya es un feriado del calendario global. No se puede agregar ` +
        `como feriado propio del cliente.`,
    );
  }
}

/** El feriado (global o de cliente) con el id indicado no existe. → HTTP 404. */
export class FeriadoNoEncontradoError extends DomainError {
  readonly code = 'FERIADO_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Feriado con id "${id}" no encontrado.`);
  }
}
