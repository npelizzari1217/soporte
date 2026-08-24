import { DomainError } from '../../../shared/domain/result';

/**
 * ObjetivoInvalidoError — el objetivo del plan de mantenimiento preventivo
 * viola el XOR (spec "Objetivo excluyente del plan"): debe apuntar a
 * exactamente un `EquipoInformatico` O a una `ubicacion`, nunca ambos ni
 * ninguno. Autoridad de dominio de `planes_preventivo_objetivo_check`
 * (ADR-PV1) — el CHECK de Postgres es backstop, este error es quien debe
 * rechazar primero.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Objetivo excluyente del
 * plan". Ref design: ADR-PV1. Tarea: 3.1/3.2.
 */
export class ObjetivoInvalidoError extends DomainError {
  readonly code = 'PREVENTIVO_OBJETIVO_INVALIDO';

  constructor(tieneEquipo: boolean, tieneUbicacion: boolean) {
    super(
      tieneEquipo && tieneUbicacion
        ? 'El plan no puede apuntar a un equipo Y a una ubicación a la vez: el objetivo es excluyente.'
        : 'El plan debe apuntar a un equipo O a una ubicación: no se proveyó ninguno de los dos.',
    );
  }
}

/**
 * IntervaloInvalidoError — `intervalo_valor` debe ser un entero
 * estrictamente positivo (`planes_preventivo_intervalo_valor_check`).
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Recurrencia por tiempo,
 * anclada a fecha inmutable". Tarea: 3.1/3.2.
 */
export class IntervaloInvalidoError extends DomainError {
  readonly code = 'PREVENTIVO_INTERVALO_INVALIDO';

  constructor(valorRecibido: number) {
    super(`El intervalo de cadencia debe ser un entero positivo, se recibió: ${valorRecibido}.`);
  }
}

/**
 * UnidadIntervaloInvalidaError — `intervalo_unidad` fuera del catálogo
 * cerrado `DIAS` | `MESES` (`planes_preventivo_intervalo_unidad_check`).
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Recurrencia por tiempo,
 * anclada a fecha inmutable". Tarea: 3.1/3.2.
 */
export class UnidadIntervaloInvalidaError extends DomainError {
  readonly code = 'PREVENTIVO_UNIDAD_INTERVALO_INVALIDA';

  constructor(unidadRecibida: string) {
    super(`La unidad de intervalo "${unidadRecibida}" no es válida: debe ser DIAS o MESES.`);
  }
}
