import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio de `HorarioLaboralSemanal` (sdd/horario-laboral-por-cliente,
 * WU-2). Mismo patrón que `feriados.errors.ts`: cada error extiende
 * `DomainError` y se modela con `Result.fail()`, nunca `throw`. Los tres
 * mapean a HTTP 422 (D9 de `design.md`).
 */

/**
 * El array de días recibido no tiene exactamente 7 entradas, o no cubre
 * exactamente `0..6` una sola vez cada uno (falta un día, sobra un día, o
 * hay un `diaSemana` repetido o fuera de rango). Cubre las dos primeras
 * validaciones de `HorarioLaboralSemanal.crear()`.
 */
export class HorarioLaboralDiasInvalidosError extends DomainError {
  readonly code = 'HORARIO_LABORAL_DIAS_INVALIDOS';

  constructor(detalle: string) {
    super(
      `El horario laboral debe tener exactamente 7 días, uno por cada día de la semana ` +
        `(0 a 6, sin repetir). ${detalle}`,
    );
  }
}

/**
 * La ventana de un día individual es inválida: un solo extremo es `null`
 * (el otro no), o ambos son números pero no cumplen
 * `0 <= aperturaMinuto < cierreMinuto <= 1440`.
 */
export class VentanaLaboralInvalidaError extends DomainError {
  readonly code = 'VENTANA_LABORAL_INVALIDA';

  constructor(dia: number) {
    super(
      `El día ${dia} tiene una ventana horaria inválida. Debe estar cerrado (apertura y ` +
        `cierre ambos nulos) o tener apertura y cierre numéricos, con ` +
        `0 <= apertura < cierre <= 1440.`,
    );
  }
}

/** Los 7 días del horario quedaron cerrados. Debe quedar al menos uno abierto. */
export class HorarioLaboralSinDiasAbiertosError extends DomainError {
  readonly code = 'HORARIO_LABORAL_SIN_DIAS_ABIERTOS';

  constructor() {
    super(
      'El horario laboral debe tener al menos un día abierto. No se puede guardar con los 7 días cerrados.',
    );
  }
}

/** Unión de errores que puede devolver `HorarioLaboralSemanal.crear()`. */
export type HorarioLaboralInvalidoError =
  | HorarioLaboralDiasInvalidosError
  | VentanaLaboralInvalidaError
  | HorarioLaboralSinDiasAbiertosError;
