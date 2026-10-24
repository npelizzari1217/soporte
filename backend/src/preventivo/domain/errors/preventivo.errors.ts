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

/**
 * TituloDemasiadoLargoError — `titulo` excede el `@db.VarChar(255)` de la
 * columna (`plan-preventivo.entity.ts:TITULO_MAX_LENGTH`). Autoridad de
 * dominio: sin este guard, un título de más de 255 caracteres pasaba el DTO
 * (`@MinLength(1)` sin techo) y reventaba recién en el `INSERT` como un
 * `PrismaClientKnownRequestError` (P2000) sin mapear — 500 crudo alcanzable
 * por HTTP.
 *
 * Ref: hallazgo de revisión "los límites de la base son más estrictos que el
 * dominio". Tarea: fix post-verify (WU-8).
 */
export class TituloDemasiadoLargoError extends DomainError {
  readonly code = 'PREVENTIVO_TITULO_DEMASIADO_LARGO';

  constructor(largoRecibido: number) {
    super(`El título no puede superar los 255 caracteres, se recibieron ${largoRecibido}.`);
  }
}

/**
 * UbicacionDemasiadoLargaError — `ubicacion` (ya normalizada a mayúscula)
 * excede el `@db.VarChar(255)` de la columna
 * (`plan-preventivo.entity.ts:UBICACION_MAX_LENGTH`). Mismo incidente que
 * `TituloDemasiadoLargoError`, mismo guard.
 *
 * Ref: hallazgo de revisión "los límites de la base son más estrictos que el
 * dominio". Tarea: fix post-verify (WU-8).
 */
export class UbicacionDemasiadoLargaError extends DomainError {
  readonly code = 'PREVENTIVO_UBICACION_DEMASIADO_LARGA';

  constructor(largoRecibido: number) {
    super(`La ubicación no puede superar los 255 caracteres, se recibieron ${largoRecibido}.`);
  }
}

/**
 * IntervaloExcedeMaximoError — `intervalo_valor` supera el techo de negocio
 * (`plan-preventivo.entity.ts:INTERVALO_VALOR_MAXIMO`, 3650). Sin este
 * guard, un valor como `3_000_000_000` pasaba `Number.isInteger()`/
 * `@IsPositive()` sin problema y desbordaba el `int4` de la columna recién
 * en Postgres, otra vez como un `PrismaClientKnownRequestError` sin mapear.
 *
 * Ref: hallazgo de revisión "los límites de la base son más estrictos que el
 * dominio". Tarea: fix post-verify (WU-8).
 */
export class IntervaloExcedeMaximoError extends DomainError {
  readonly code = 'PREVENTIVO_INTERVALO_EXCEDE_MAXIMO';

  constructor(valorRecibido: number) {
    super(`El intervalo de cadencia no puede superar 3650, se recibió: ${valorRecibido}.`);
  }
}

/**
 * AnticipacionInvalidaError — `anticipacion_valor` debe ser un entero mayor o
 * igual a 0 (`planes_preventivo_anticipacion_valor_check`). El 0 es válido: es
 * el comportamiento previo a la anticipación (el ticket se genera el día del
 * ciclo).
 *
 * Ref: odd/preventivo-anticipacion S6.
 */
export class AnticipacionInvalidaError extends DomainError {
  readonly code = 'PREVENTIVO_ANTICIPACION_INVALIDA';

  constructor(valorRecibido: number) {
    super(`La anticipación debe ser un entero mayor o igual a 0, se recibió: ${valorRecibido}.`);
  }
}

/**
 * UnidadAnticipacionInvalidaError — `anticipacion_unidad` fuera del catálogo
 * cerrado `DIAS` | `MESES` (`planes_preventivo_anticipacion_unidad_check`).
 *
 * Ref: odd/preventivo-anticipacion S1.
 */
export class UnidadAnticipacionInvalidaError extends DomainError {
  readonly code = 'PREVENTIVO_UNIDAD_ANTICIPACION_INVALIDA';

  constructor(unidadRecibida: string) {
    super(`La unidad de anticipación "${unidadRecibida}" no es válida: debe ser DIAS o MESES.`);
  }
}

/**
 * AnticipacionNoMenorQueCadenciaError — la anticipación tiene que ser
 * estrictamente menor que la cadencia, comparadas en días con un mes = 30
 * días (`planes_preventivo_anticipacion_menor_cadencia_check`). Lo que
 * garantiza depende de las unidades:
 *
 * - Con la misma unidad (días contra días, meses contra meses), la fecha de
 *   generación de un ciclo cae siempre estrictamente después de la fecha del
 *   ciclo anterior.
 * - Con unidades mezcladas es una aproximación: un mes real tiene entre 28 y
 *   31 días, no 30. Por ejemplo, 29 días de anticipación contra una cadencia
 *   de 1 mes pasan la validación, y un ciclo del 01/03 se genera el 31/01,
 *   antes del ciclo anterior del 01/02. Lo que sí garantiza es que la
 *   anticipación no alcanza la cadencia medida con meses de 30 días.
 *
 * El texto lo arma el dominio con las dos magnitudes ya descriptas, para que
 * el usuario vea por qué se rechazó sin tener que hacer la cuenta.
 *
 * Ref: odd/preventivo-anticipacion S6.
 */
export class AnticipacionNoMenorQueCadenciaError extends DomainError {
  readonly code = 'PREVENTIVO_ANTICIPACION_NO_MENOR_QUE_CADENCIA';

  constructor(anticipacionDescripta: string, cadenciaDescripta: string) {
    super(
      `La anticipación (${anticipacionDescripta}) debe ser menor que la cadencia (${cadenciaDescripta}). Para comparar, un mes cuenta como 30 días.`,
    );
  }
}

/**
 * PlanNoEncontradoError — el plan de mantenimiento preventivo con el id
 * indicado no existe (o fue soft-deleted).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Baja de plan frena generación
 * sin borrar historial". Tarea: WU-4 (4.2).
 */
export class PlanNoEncontradoError extends DomainError {
  readonly code = 'PREVENTIVO_PLAN_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Plan de mantenimiento preventivo con id "${id}" no encontrado o fue eliminado.`);
  }
}
