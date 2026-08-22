import { Result } from '../../../shared/domain/result';
import { PuntajeInvalidoError } from '../errors/csat.errors';

/**
 * PuntajeCsat — value object del puntaje de la encuesta de satisfacción
 * (1 a 5 estrellas, entero). Espejo en dominio del CHECK
 * `puntaje BETWEEN 1 AND 5` de `encuestas_satisfaccion` (design, TENANT) —
 * la autoridad es el dominio, el CHECK es backstop.
 *
 * `typeof valor !== 'number'` cubre el caso defensivo de un caller que no
 * pasó por el DTO tipado (ej. un valor llegado como string desde un cliente
 * que no serializa JSON correctamente).
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)" — "puntaje fuera de rango → 400, sin escritura". Tarea: 4.3.
 */
export class PuntajeCsat {
  private constructor(private readonly _valor: number) {}

  /**
   * Construye un `PuntajeCsat` validado. `Result.fail(PuntajeInvalidoError)`
   * si `valor` no es un entero entre 1 y 5.
   */
  static create(valor: number): Result<PuntajeCsat, PuntajeInvalidoError> {
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > 5) {
      return Result.fail(new PuntajeInvalidoError(valor));
    }
    return Result.ok(new PuntajeCsat(valor));
  }

  /** El puntaje validado, como entero 1-5. */
  get valor(): number {
    return this._valor;
  }
}
