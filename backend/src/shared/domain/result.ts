/**
 * DomainError — clase base para todos los errores tipados del dominio.
 *
 * Los errores esperados del dominio se modelan con Result.fail(error),
 * NO con throw. Solo los errores verdaderamente excepcionales/irrecuperables
 * (bugs, fallos de infraestructura) usan throw.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Fix para el prototype chain en TypeScript cuando se extiende Error
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Result<T, E> — tipo de resultado explícito para operaciones que pueden fallar
 * de forma esperada.
 *
 * Uso:
 *   - Result.ok(value)    → operación exitosa
 *   - Result.fail(error)  → fallo esperado con error tipado
 *
 * Este patrón elimina los throws "silenciosos" del dominio y fuerza al
 * consumidor a manejar explícitamente los caminos de error.
 */
export class Result<T, E extends DomainError> {
  private readonly _isOk: boolean;
  private readonly _value: T | undefined;
  private readonly _error: E | undefined;

  private constructor(isOk: boolean, value?: T, error?: E) {
    this._isOk = isOk;
    this._value = value;
    this._error = error;
  }

  // ─── Constructores estáticos ──────────────────────────────────────────────

  /** Crea un resultado exitoso con el valor dado. */
  static ok<T, E extends DomainError>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  /** Crea un resultado fallido con el error dado. */
  static fail<T, E extends DomainError>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  // ─── Predicados ──────────────────────────────────────────────────────────

  /** Retorna true si el resultado es exitoso. */
  isOk(): boolean {
    return this._isOk;
  }

  /** Retorna true si el resultado es un fallo. */
  isFail(): boolean {
    return !this._isOk;
  }

  // ─── Extractores ─────────────────────────────────────────────────────────

  /**
   * Retorna el valor si el resultado es ok.
   * @throws Error si el resultado es un fallo.
   */
  getValue(): T {
    if (!this._isOk) {
      throw new Error(
        `Result.getValue() llamado sobre un resultado fallido. ` +
          `Error: ${this._error?.message ?? 'unknown'}`,
      );
    }
    return this._value as T;
  }

  /**
   * Retorna el error si el resultado es un fallo.
   * @throws Error si el resultado es ok.
   */
  getError(): E {
    if (this._isOk) {
      throw new Error(`Result.getError() llamado sobre un resultado exitoso.`);
    }
    return this._error as E;
  }

  /**
   * Retorna el valor si ok; lanza el error de dominio si falla.
   * Útil en los límites de infraestructura donde se tolera el throw.
   */
  getOrThrow(): T {
    if (!this._isOk) {
      throw this._error;
    }
    return this._value as T;
  }

  // ─── Transformaciones ─────────────────────────────────────────────────────

  /**
   * Aplica una función de transformación sobre el valor si el resultado es ok.
   * Si el resultado es fallo, propaga el error sin llamar a la función.
   *
   * @param fn  Función pura que transforma el valor de T a U.
   */
  map<U>(fn: (value: T) => U): Result<U, E> {
    if (!this._isOk) {
      return Result.fail<U, E>(this._error as E);
    }
    return Result.ok<U, E>(fn(this._value as T));
  }
}
