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
 * Ref design: §5 (D3 — el handler retorna outcome, el listener loguea).
 * Ref tasks: PR3 3.6.
 */
import { Logger } from '@nestjs/common';
import { NotificarCambioEstadoListener } from './notificar-cambio-estado.listener';
import { NotificarCambioEstadoHandler } from '../../application/event-handlers/notificar-cambio-estado.handler';
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';

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
  let handler: { handle: ReturnType<typeof vi.fn> };
  let listener: NotificarCambioEstadoListener;

  beforeEach(() => {
    handler = { handle: vi.fn() };
    listener = new NotificarCambioEstadoListener(
      handler as unknown as NotificarCambioEstadoHandler,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delega en el handler con el evento recibido', async () => {
    handler.handle.mockResolvedValue({ status: 'skipped' });
    const event = makeEvent();

    await listener.handleTicketEstadoCambiado(event);

    expect(handler.handle).toHaveBeenCalledWith(event);
  });

  it('outcome "skipped" no loguea nada', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    handler.handle.mockResolvedValue({ status: 'skipped' });

    await listener.handleTicketEstadoCambiado(makeEvent());

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('outcome "no-email" loguea WARN con contexto, sin email en claro', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    handler.handle.mockResolvedValue({
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
    expect(message).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });

  it('outcome "send-failed" loguea ERROR con destinatario enmascarado, sin email en claro', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    handler.handle.mockResolvedValue({
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
    handler.handle.mockResolvedValue({
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
    handler.handle.mockResolvedValue({ status: 'skipped' });

    await expect(listener.handleTicketEstadoCambiado(makeEvent())).resolves.not.toThrow();
  });
});
