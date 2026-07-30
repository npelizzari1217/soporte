/**
 * 3.1-3.4 (PR3) + 6.8-6.9 (PR6) — RED: NotificarCambioEstadoHandler.handle()
 * — outcomes puros, NUNCA throw.
 *
 * El handler es PURO (application/, sin decorators NestJS) y depende de 3
 * ports (IConfigResolver, ISolicitanteEmailResolver, EmailSenderPort) — sin
 * over-mocking (CLAUDE.md §5). Cada test cubre UN Scenario del spec:
 *   - 3.1: estado no-clave ⇒ 'skipped', sin llamar send() (R1)
 *   - 6.8: configResolver falla ⇒ 'no-config', send() NO llamado, sin throw (R6)
 *   - 3.2: resolver falla (huérfano/sin email) ⇒ 'no-email', sin throw (R4)
 *   - 3.3: emailSender.send falla ⇒ 'send-failed', sin throw (R5)
 *   - 6.9/3.4: camino feliz ⇒ 'sent', send() recibe la SmtpConfig resuelta (R7)
 *
 * Ref design: §5 (firma exacta), §7.2 (paso b), §8/§13 (tabla testing).
 * Ref tasks: PR3 3.1-3.4; PR6 6.8-6.9 (runtime-config-table).
 */
import { NotificarCambioEstadoHandler } from './notificar-cambio-estado.handler';
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';
import { ISolicitanteEmailResolver } from '../../domain/ports/i-solicitante-email.resolver';
import { EmailSenderPort, EmailMessage } from '../../domain/ports/i-email-sender.port';
import { Email } from '../../domain/value-objects/email.vo';
import { ResolverEmailError, EmailError } from '../../domain/errors/email.errors';
import { Result } from '../../../shared/domain/result';
import { IConfigResolver } from '../../../configuracion/domain/ports/i-config-resolver';
import { NoConfigError } from '../../../configuracion/domain/errors/config.errors';
import { SmtpConfig } from '../../../shared/domain/value-objects/smtp-config.vo';

function makeEvent(overrides: Partial<TicketEstadoCambiado> = {}): TicketEstadoCambiado {
  const base = new TicketEstadoCambiado(
    'ticket-1',
    'SOP-2026-00001',
    'Ticket de test',
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

function makeConfig(): SmtpConfig {
  return SmtpConfig.create({
    host: 'smtp.dominio.com',
    port: 587,
    secure: false,
    user: 'no-reply@dominio.com',
    pass: 'super-secreto',
    from: 'Soporte <no-reply@dominio.com>',
  }).getValue();
}

describe('NotificarCambioEstadoHandler', () => {
  let configResolver: IConfigResolver & { resolveSmtp: ReturnType<typeof vi.fn> };
  let resolver: ISolicitanteEmailResolver & { resolver: ReturnType<typeof vi.fn> };
  let emailSender: EmailSenderPort & { send: ReturnType<typeof vi.fn> };
  let handler: NotificarCambioEstadoHandler;

  beforeEach(() => {
    configResolver = { resolveSmtp: vi.fn().mockResolvedValue(Result.ok(makeConfig())) };
    resolver = { resolver: vi.fn() };
    emailSender = { send: vi.fn() };
    handler = new NotificarCambioEstadoHandler(configResolver, resolver, emailSender);
  });

  it('3.1 — estado no-clave ⇒ outcome "skipped", ni configResolver ni send() son llamados', async () => {
    const event = makeEvent({ estadoNuevoCodigo: 'EN_PROGRESO' });

    const outcome = await handler.handle(event);

    expect(outcome).toEqual({ status: 'skipped' });
    expect(configResolver.resolveSmtp).not.toHaveBeenCalled();
    expect(resolver.resolver).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('6.8 — configResolver falla ⇒ outcome "no-config", send() NO es llamado, sin throw', async () => {
    const event = makeEvent({ estadoNuevoCodigo: 'RESUELTO' });
    configResolver.resolveSmtp.mockResolvedValue(
      Result.fail(new NoConfigError(`Sin config SMTP para el tenant "${event.tenantId}".`)),
    );

    const outcome = await handler.handle(event);

    expect(outcome.status).toBe('no-config');
    if (outcome.status === 'no-config') {
      expect(outcome.ticketId).toBe(event.ticketId);
      expect(outcome.codigo).toBe('NO_CONFIG');
      expect(outcome.motivo).toContain('Sin config SMTP');
    }
    expect(configResolver.resolveSmtp).toHaveBeenCalledWith(event.tenantId);
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

  it('6.9/3.4 — camino feliz ⇒ outcome "sent", send() recibe la SmtpConfig resuelta', async () => {
    const event = makeEvent({ estadoNuevoCodigo: 'SIN_SOLUCION' });
    const email = Email.create('usuario@dominio.com').getValue();
    const config = makeConfig();
    configResolver.resolveSmtp.mockResolvedValue(Result.ok(config));
    resolver.resolver.mockResolvedValue(Result.ok(email));
    emailSender.send.mockResolvedValue(Result.ok(undefined));

    const outcome = await handler.handle(event);

    expect(outcome).toEqual({
      status: 'sent',
      destinatarioEnmascarado: 'u***@dominio.com',
      ticketId: event.ticketId,
    });
    const [sentMessage, sentConfig] = emailSender.send.mock.calls[0] as [EmailMessage, SmtpConfig];
    expect(sentMessage.to).toBe(email);
    expect(sentMessage.body.type).toBe('template');
    expect(sentConfig).toBe(config);
  });

  it('6.14 — hot-reload: el 2do handle() usa la config ACTUALIZADA sin reiniciar el proceso (R6 escenario 3)', async () => {
    const event = makeEvent({ estadoNuevoCodigo: 'RESUELTO' });
    const email = Email.create('usuario@dominio.com').getValue();
    const configVieja = makeConfig();
    const configNueva = SmtpConfig.create({
      host: 'smtp-nuevo.dominio.com',
      port: 587,
      secure: false,
      user: 'no-reply@dominio.com',
      pass: 'super-secreto',
      from: 'Soporte <no-reply@dominio.com>',
    }).getValue();
    resolver.resolver.mockResolvedValue(Result.ok(email));
    emailSender.send.mockResolvedValue(Result.ok(undefined));

    configResolver.resolveSmtp.mockResolvedValueOnce(Result.ok(configVieja));
    await handler.handle(event);

    configResolver.resolveSmtp.mockResolvedValueOnce(Result.ok(configNueva));
    await handler.handle(event);

    expect(configResolver.resolveSmtp).toHaveBeenCalledTimes(2);
    expect(emailSender.send).toHaveBeenNthCalledWith(1, expect.anything(), configVieja);
    expect(emailSender.send).toHaveBeenNthCalledWith(2, expect.anything(), configNueva);
  });

  it('4.14 — mapea numero/tituloTicket del evento al EmailMessage.data (enriquecimiento PR4)', async () => {
    const event = makeEvent({
      estadoNuevoCodigo: 'CERRADO',
      numero: 'SOP-2026-00042',
      tituloTicket: 'Impresora no enciende',
    });
    const email = Email.create('usuario@dominio.com').getValue();
    resolver.resolver.mockResolvedValue(Result.ok(email));
    emailSender.send.mockResolvedValue(Result.ok(undefined));

    await handler.handle(event);

    const sentMessage = emailSender.send.mock.calls[0][0] as EmailMessage;
    expect(sentMessage.body.type).toBe('template');
    if (sentMessage.body.type === 'template') {
      expect(sentMessage.body.data.numero).toBe('SOP-2026-00042');
      expect(sentMessage.body.data.tituloTicket).toBe('Impresora no enciende');
    }
  });
});
