/**
 * 3.1-3.4 — RED: NotificarCambioEstadoHandler.handle() — outcomes puros,
 * NUNCA throw.
 *
 * El handler es PURO (application/, sin decorators NestJS) y solo depende de
 * los 2 ports (ISolicitanteEmailResolver, EmailSenderPort) — sin over-mocking
 * (CLAUDE.md §5). Cada test cubre UN Scenario del spec:
 *   - 3.1: estado no-clave ⇒ 'skipped', sin llamar send() (R1)
 *   - 3.2: resolver falla (huérfano/sin email) ⇒ 'no-email', sin throw (R4)
 *   - 3.3: emailSender.send falla ⇒ 'send-failed', sin throw (R5)
 *   - 3.4: camino feliz ⇒ 'sent' (R2, parcial — sin use case real, ver PR4)
 *
 * Ref design: §5 (firma exacta), §8 (tabla testing).
 * Ref tasks: PR3 3.1-3.4.
 */
import { NotificarCambioEstadoHandler } from './notificar-cambio-estado.handler';
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';
import { ISolicitanteEmailResolver } from '../../domain/ports/i-solicitante-email.resolver';
import { EmailSenderPort, EmailMessage } from '../../domain/ports/i-email-sender.port';
import { Email } from '../../domain/value-objects/email.vo';
import { ResolverEmailError, EmailError } from '../../domain/errors/email.errors';
import { Result } from '../../../shared/domain/result';

function makeEvent(overrides: Partial<TicketEstadoCambiado> = {}): TicketEstadoCambiado {
  const base = new TicketEstadoCambiado(
    'ticket-1',
    'SOPORTE',
    'estado-anterior-id',
    'estado-nuevo-id',
    'EN_PROGRESO',
    'RESUELTO',
    'solicitante-1',
    'autor-1',
    'tenant-1',
    new Date('2026-07-30T12:00:00.000Z'),
  );
  return Object.assign(Object.create(TicketEstadoCambiado.prototype), base, overrides);
}

describe('NotificarCambioEstadoHandler', () => {
  let resolver: { resolver: ReturnType<typeof vi.fn> };
  let emailSender: { send: ReturnType<typeof vi.fn> };
  let handler: NotificarCambioEstadoHandler;

  beforeEach(() => {
    resolver = { resolver: vi.fn() };
    emailSender = { send: vi.fn() };
    handler = new NotificarCambioEstadoHandler(
      resolver as unknown as ISolicitanteEmailResolver,
      emailSender as unknown as EmailSenderPort,
    );
  });

  it('3.1 — estado no-clave ⇒ outcome "skipped", send() NO es llamado', async () => {
    const event = makeEvent({ estadoNuevoCodigo: 'EN_PROGRESO' });

    const outcome = await handler.handle(event);

    expect(outcome).toEqual({ status: 'skipped' });
    expect(resolver.resolver).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('3.2 — resolver falla (solicitante huérfano) ⇒ outcome "no-email", sin throw', async () => {
    const event = makeEvent({ estadoNuevoCodigo: 'RESUELTO' });
    resolver.resolver.mockResolvedValue(
      Result.fail(
        new ResolverEmailError(
          'USUARIO_NO_ENCONTRADO',
          `Solicitante "${event.solicitanteId}" no encontrado en master.usuarios para el tenant "${event.tenantId}".`,
        ),
      ),
    );

    const outcome = await handler.handle(event);

    expect(outcome.status).toBe('no-email');
    if (outcome.status === 'no-email') {
      expect(outcome.solicitanteId).toBe(event.solicitanteId);
      expect(outcome.ticketId).toBe(event.ticketId);
      expect(outcome.motivo).toContain('no encontrado');
    }
    expect(resolver.resolver).toHaveBeenCalledWith(event.solicitanteId, event.tenantId);
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('3.3 — emailSender.send falla ⇒ outcome "send-failed", sin throw', async () => {
    const event = makeEvent({ estadoNuevoCodigo: 'CERRADO' });
    const email = Email.create('usuario@dominio.com').getValue();
    resolver.resolver.mockResolvedValue(Result.ok(email));
    emailSender.send.mockResolvedValue(
      Result.fail(new EmailError('u***@dominio.com', 'Timeout SMTP', 'EMAIL_SEND_FAILED')),
    );

    const outcome = await handler.handle(event);

    expect(outcome.status).toBe('send-failed');
    if (outcome.status === 'send-failed') {
      expect(outcome.ticketId).toBe(event.ticketId);
      expect(outcome.destinatarioEnmascarado).toBe('u***@dominio.com');
      expect(outcome.causa).toBe('Timeout SMTP');
    }
  });

  it('3.4 — camino feliz ⇒ outcome "sent"', async () => {
    const event = makeEvent({ estadoNuevoCodigo: 'SIN_SOLUCION' });
    const email = Email.create('usuario@dominio.com').getValue();
    resolver.resolver.mockResolvedValue(Result.ok(email));
    emailSender.send.mockResolvedValue(Result.ok(undefined));

    const outcome = await handler.handle(event);

    expect(outcome).toEqual({
      status: 'sent',
      destinatarioEnmascarado: 'u***@dominio.com',
      ticketId: event.ticketId,
    });
    const sentMessage = emailSender.send.mock.calls[0][0] as EmailMessage;
    expect(sentMessage.to).toBe(email);
    expect(sentMessage.body.type).toBe('template');
  });
});
