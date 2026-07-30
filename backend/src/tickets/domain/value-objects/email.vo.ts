import { Result } from '../../../shared/domain/result';
import { EmailError } from '../errors/email.errors';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email — Value Object self-validating para direcciones de correo del dominio.
 *
 * Centraliza la validación de formato (Requirement 8 "email nulo/vacío" =
 * fallo de `Email.create`) y el enmascarado para logs (Requirement 7: NUNCA
 * loguear el email completo en claro — ej. "u***@dominio.com").
 *
 * Ref design: D8.
 * Tarea: 2.1/2.2 (PR2, notif-email-estado-ticket)
 */
export class Email {
  private constructor(private readonly _value: string) {}

  static create(raw: string): Result<Email, EmailError> {
    const trimmed = (raw ?? '').trim();

    if (!EMAIL_FORMAT.test(trimmed)) {
      return Result.fail(
        new EmailError(
          Email.maskRaw(trimmed),
          'Formato de email inválido o vacío',
          'EMAIL_INVALIDO',
        ),
      );
    }

    return Result.ok(new Email(trimmed));
  }

  /** Valor crudo del email — para persistencia/adapters. NUNCA para logs. */
  value(): string {
    return this._value;
  }

  /** Enmascarado apto para logs: "u***@dominio.com". */
  mask(): string {
    return Email.maskRaw(this._value);
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  private static maskRaw(raw: string): string {
    if (raw.length === 0) return '(vacío)';

    const at = raw.indexOf('@');
    if (at <= 0) {
      return `${raw.slice(0, 1)}***`;
    }

    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1);
    return `${local.slice(0, 1)}***@${domain}`;
  }
}
