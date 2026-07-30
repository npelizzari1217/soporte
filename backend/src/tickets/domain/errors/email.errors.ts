import { DomainError } from '../../../shared/domain/result';

export type EmailErrorCode = 'EMAIL_INVALIDO' | 'EMAIL_SEND_FAILED';

/**
 * EmailError — error de dominio para fallos relacionados al VO `Email` o al
 * envío vía `EmailSenderPort`.
 *
 * `destinatarioEnmascarado` es responsabilidad del caller (típicamente
 * `Email.mask()`) — este tipo NUNCA debe recibir el email completo en claro,
 * así el error es seguro de loguear tal cual (Requirement 7).
 *
 * Ref spec: Requirement 7 Scenario "Result.fail tipado", Requirement 8
 * Scenario "email nulo".
 * Ref design: §5.
 * Tarea: 2.3/2.4 (PR2, notif-email-estado-ticket)
 */
export class EmailError extends DomainError {
  readonly code: EmailErrorCode;

  constructor(
    readonly destinatarioEnmascarado: string,
    readonly causa: string,
    code: EmailErrorCode = 'EMAIL_SEND_FAILED',
  ) {
    super(`Error de email hacia "${destinatarioEnmascarado}": ${causa}`);
    this.code = code;
  }
}

export type ResolverEmailErrorCode = 'USUARIO_NO_ENCONTRADO' | 'EMAIL_NO_DISPONIBLE';

/**
 * ResolverEmailError — error de dominio del resolver cross-DB del email del
 * solicitante. Código distinguible (Requirement 8) para que el handler
 * (PR3) pueda loguear con precisión sin adivinar la causa del fallo.
 *
 * Tarea: 2.3/2.4 (PR2, notif-email-estado-ticket)
 */
export class ResolverEmailError extends DomainError {
  readonly code: ResolverEmailErrorCode;

  constructor(code: ResolverEmailErrorCode, mensaje: string) {
    super(mensaje);
    this.code = code;
  }
}
