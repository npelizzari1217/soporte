/**
 * 3.6 — RED: NotificarCambioEstadoListener (@OnEvent) delega en el handler y
 * loguea el outcome (WARN/ERROR según corresponda), sin exponer el email en
 * claro (R4/R5 logging).
 *
 * El listener es infra (`@Injectable()`/`@OnEvent`) — delega TODO el trabajo
 * al handler puro y solo decide el nivel de log según el outcome. Se
 * mockea `NotificarCambioEstadoHandler` (un solo colaborador, sin
 * over-mocking) y se espía `Logger.prototype` (mismo patrón que
 * `guards.spec.ts`).
 *
 * `NotificarCambioEstadoHandler` es una clase concreta con campos privados
 * (`resolver`/`emailSender`) — un objeto literal `{ handle: vi.fn() }` NO es
 * asignable a ese tipo sin pasar por `unknown` (TS "brands" las clases con
 * miembros privados). En vez de `as unknown as`/`as any` (prohibido, DoD
 * §9), se instancia el handler REAL con stubs tipados de sus 2 ports
 * (`ISolicitanteEmailResolver`/`EmailSenderPort`, interfaces planas) y se
 * espía `handle()` con `vi.spyOn` — cero casts, el listener sigue recibiendo
 * el tipo exacto que declara su constructor.
 *
 * Ref design: §5 (D3 — el handler retorna outcome, el listener loguea).
 * Ref tasks: PR3 3.6.
 */
import { Logger } from '@nestjs/common';
import { NotificarCambioEstadoListener } from './notificar-cambio-estado.listener';
import { NotificarCambioEstadoHandler } from '../../application/event-handlers/notificar-cambio-estado.handler';
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';
import { ISolicitanteEmailResolver } from '../../domain/ports/i-solicitante-email.resolver';
import { EmailSenderPort } from '../../domain/ports/i-email-sender.port';

function makeEvent(): TicketEstadoCambiado {
  return new TicketEstadoCambiado(
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
}

describe('NotificarCambioEstadoListener', () => {
  let handler: NotificarCambioEstadoHandler;
  let handleSpy: ReturnType<typeof vi.spyOn>;
  let listener: NotificarCambioEstadoListener;

  beforeEach(() => {
    const resolver: ISolicitanteEmailResolver = { resolver: vi.fn() };
    const emailSender: EmailSenderPort = { send: vi.fn() };
    handler = new NotificarCambioEstadoHandler(resolver, emailSender);
    handleSpy = vi.spyOn(handler, 'handle');
    listener = new NotificarCambioEstadoListener(handler);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delega en el handler con el evento recibido', async () => {
    handleSpy.mockResolvedValue({ status: 'skipped' });
    const event = makeEvent();

    await listener.handleTicketEstadoCambiado(event);

    expect(handleSpy).toHaveBeenCalledWith(event);
  });

  it('outcome "skipped" no loguea nada', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    handleSpy.mockResolvedValue({ status: 'skipped' });

    await listener.handleTicketEstadoCambiado(makeEvent());

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('outcome "no-email" loguea WARN con contexto, sin email en claro', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    handleSpy.mockResolvedValue({
      status: 'no-email',
      motivo: 'Solicitante no encontrado en master.usuarios',
      solicitanteId: 'solicitante-1',
      ticketId: 'ticket-1',
    });

    await listener.handleTicketEstadoCambiado(makeEvent());

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    expect(message).toContain('ticket-1');
    expect(message).toContain('solicitante-1');
    // Red de seguridad "sin email en claro": mismo patrón que la producción
    // (maskEmailsInText), incluyendo dominios de una etiqueta tipo user@localhost.
    expect(message).not.toMatch(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*/);
  });

  it('outcome "send-failed" loguea ERROR con destinatario enmascarado, sin email en claro', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handleSpy.mockResolvedValue({
      status: 'send-failed',
      destinatarioEnmascarado: 'u***@dominio.com',
      causa: 'Timeout SMTP',
      ticketId: 'ticket-1',
    });

    await listener.handleTicketEstadoCambiado(makeEvent());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0];
    expect(message).toContain('ticket-1');
    expect(message).toContain('u***@dominio.com');
    expect(message).toContain('Timeout SMTP');
  });

  it('outcome "sent" loguea a nivel log/info con destinatario enmascarado', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    handleSpy.mockResolvedValue({
      status: 'sent',
      destinatarioEnmascarado: 'u***@dominio.com',
      ticketId: 'ticket-1',
    });

    await listener.handleTicketEstadoCambiado(makeEvent());

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [message] = logSpy.mock.calls[0];
    expect(message).toContain('ticket-1');
    expect(message).toContain('u***@dominio.com');
  });

  it('nunca lanza incluso si el handler retorna un outcome inesperado', async () => {
    handleSpy.mockResolvedValue({ status: 'skipped' });

    await expect(listener.handleTicketEstadoCambiado(makeEvent())).resolves.not.toThrow();
  });

  it('nunca propaga el rechazo cuando handler.handle() rechaza la promesa (RED→GREEN, item 3 Judgment Day PR3 Ronda 1)', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handleSpy.mockRejectedValue(new Error('bug futuro en un adapter'));

    await expect(listener.handleTicketEstadoCambiado(makeEvent())).resolves.not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0];
    expect(message).toContain('ticket-1');
    expect(message).not.toContain('usuario@dominio.com');
  });

  it('enmascara un email embebido en err.message antes de loguear (Judgment Day PR3 Ronda 2, issue 3 Juez A)', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handleSpy.mockRejectedValue(new Error('fallo interno para usuario@dominio.com'));

    await expect(listener.handleTicketEstadoCambiado(makeEvent())).resolves.not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0];
    expect(message).not.toContain('usuario@dominio.com');
    expect(message).toContain('u***@dominio.com');
  });
});
