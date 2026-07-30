import { EmailError, ResolverEmailError } from './email.errors';
import { DomainError } from '../../../shared/domain/result';

/**
 * 2.3 — RED: EmailError/ResolverEmailError — códigos distinguibles,
 * destinatario SIEMPRE enmascarado en el error (nunca el email en claro).
 *
 * Ref spec: Requirement 7 Scenario "Result.fail tipado", Requirement 8
 * Scenario "email nulo".
 * Ref tasks: PR2 2.3
 */
describe('EmailError', () => {
  it('extiende DomainError y expone code, destinatarioEnmascarado y causa', () => {
    const error = new EmailError('u***@dominio.com', 'timeout SMTP', 'EMAIL_SEND_FAILED');

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('EMAIL_SEND_FAILED');
    expect(error.destinatarioEnmascarado).toBe('u***@dominio.com');
    expect(error.causa).toBe('timeout SMTP');
  });

  it('usa EMAIL_SEND_FAILED como código por defecto cuando no se especifica', () => {
    const error = new EmailError('u***@dominio.com', 'conexión rechazada');

    expect(error.code).toBe('EMAIL_SEND_FAILED');
  });

  it('acepta el código EMAIL_INVALIDO explícitamente', () => {
    const error = new EmailError('(vacío)', 'formato inválido', 'EMAIL_INVALIDO');

    expect(error.code).toBe('EMAIL_INVALIDO');
  });

  it('el mensaje del error nunca incluye el email completo en claro', () => {
    const error = new EmailError('u***@dominio.com', 'timeout SMTP');

    expect(error.message).not.toContain('usuario@dominio.com');
  });
});

describe('ResolverEmailError', () => {
  it('distingue USUARIO_NO_ENCONTRADO de EMAIL_NO_DISPONIBLE', () => {
    const noEncontrado = new ResolverEmailError(
      'USUARIO_NO_ENCONTRADO',
      'Solicitante no encontrado en master.Usuario',
    );
    const noDisponible = new ResolverEmailError(
      'EMAIL_NO_DISPONIBLE',
      'Email vacío o no resoluble',
    );

    expect(noEncontrado.code).toBe('USUARIO_NO_ENCONTRADO');
    expect(noDisponible.code).toBe('EMAIL_NO_DISPONIBLE');
  });

  it('extiende DomainError', () => {
    const error = new ResolverEmailError('USUARIO_NO_ENCONTRADO', 'no existe');

    expect(error).toBeInstanceOf(DomainError);
  });
});
