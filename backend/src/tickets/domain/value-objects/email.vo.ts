import { Result } from '../../../shared/domain/result';
import { EmailError } from '../errors/email.errors';
import { maskEmailLike } from '../mask-email-like';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Símbolo bien-conocido de Node para personalizar `util.inspect()` (el que
 * usa `console.log` internamente). Se usa `Symbol.for(...)` — el MISMO
 * registro global que `util.inspect.custom` — en vez de `import 'util'`,
 * para no violar clean-arch (domain no depende de builtins de Node). `const`
 * con inicializador `Symbol.for(...)` es tipado por TS como `unique symbol`,
 * válido como nombre de miembro computado de clase.
 */
const NODE_INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom');

/**
 * Email — Value Object self-validating para direcciones de correo del dominio.
 *
 * Centraliza la validación de formato (Requirement 8 "email nulo/vacío" =
 * fallo de `Email.create`) y el enmascarado para logs (Requirement 7: NUNCA
 * loguear el email completo en claro — ej. "u***@dominio.com"). Esto cubre
 * interpolación implícita (`toString()`), `JSON.stringify()` (`toJSON()`) y
 * la inspección de Node (`console.log`, vía `NODE_INSPECT_CUSTOM`) — las
 * tres formas en que el objeto puede filtrar el valor crudo en claro
 * (Judgment Day PR2 Ronda 2, issue B).
 *
 * `#value` es un private field REAL de ECMAScript (no solo `private` de
 * TS, que es únicamente compile-time): a diferencia de un campo `private`
 * de TS, `#value` no aparece en `Object.keys()`/`Object.values()` ni se
 * copia via spread (`{...email}`) — ninguna de esas vías puede filtrar el
 * email crudo pese a que `toJSON()`/`inspect.custom` ya lo cubrían
 * (Judgment Day PR2 Ronda 3, issue B — el `private` de TS solo bloqueaba
 * el acceso en tiempo de compilación, no en runtime).
 *
 * Ref design: D8.
 * Tarea: 2.1/2.2 (PR2, notif-email-estado-ticket)
 */
export class Email {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static create(raw: string): Result<Email, EmailError> {
    const trimmed = (raw ?? '').trim();

    if (!EMAIL_FORMAT.test(trimmed)) {
      return Result.fail(
        new EmailError(
          maskEmailLike(trimmed),
          'Formato de email inválido o vacío',
          'EMAIL_INVALIDO',
        ),
      );
    }

    return Result.ok(new Email(trimmed));
  }

  /** Valor crudo del email — para persistencia/adapters. NUNCA para logs. */
  value(): string {
    return this.#value;
  }

  /** Enmascarado apto para logs: "u***@dominio.com". */
  mask(): string {
    return maskEmailLike(this.#value);
  }

  equals(other: Email): boolean {
    return this.#value === other.#value;
  }

  /**
   * Representación en string apta para interpolación implícita (template
   * literals, concatenación, logging). Delega en `mask()` — NUNCA el valor
   * crudo — para no reintroducir el riesgo de fuga de Requirement 7 si el
   * VO se interpola accidentalmente en un mensaje o log.
   */
  toString(): string {
    return this.mask();
  }

  /**
   * Enmascarado usado por `JSON.stringify(email)` / `JSON.stringify({ email })`.
   * Sin esto, `JSON.stringify` serializaría el valor crudo tal cual,
   * exponiendo el email completo en claro pese a que `toString()` ya lo
   * protegía (Requirement 7 — Judgment Day PR2 Ronda 2, issue B).
   */
  toJSON(): string {
    return this.mask();
  }

  /**
   * Personaliza `util.inspect()` (usado internamente por `console.log`) para
   * que inspeccionar el objeto directamente (`console.log(email)`) muestre
   * el valor enmascarado en vez del valor crudo en claro.
   */
  [NODE_INSPECT_CUSTOM](): string {
    return this.mask();
  }
}
