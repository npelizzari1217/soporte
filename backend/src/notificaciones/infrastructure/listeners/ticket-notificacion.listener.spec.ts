/**
 * N7 [UNIT] — RED→GREEN: TicketNotificacionListener — wiring @OnEvent
 * (`ticket.estado_cambiado`, `ticket.comentado`) → carga ticket
 * (TICKET_REPOSITORY) → resuelve contacto del SOLICITANTE
 * (IUsuarioContactoResolver) → arma EmailMessage (plantilla) → send()
 * (IEmailSender). Log-and-swallow total (ADR-6/ADR-P8).
 *
 * Ref spec: sdd/premium/spec N3, N4. Ref design: ADR-P8. Tarea: N7/N8.
 */
import { TicketNotificacionListener } from './ticket-notificacion.listener';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEstadoCambiadoEvent } from '../../../tickets/domain/events/ticket-estado-cambiado.event';
import { TicketComentadoEvent } from '../../../tickets/domain/events/ticket-comentado.event';

function makeTicket() {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00042',
      titulo: 'La impresora no imprime',
      descripcion: null,
      tipoId: 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

describe('TicketNotificacionListener', () => {
  function makeListener() {
    const ticketRepo = { findById: vi.fn() };
    const contactoResolver = { resolverContacto: vi.fn(), resolverAdministradores: vi.fn() };
    const emailSender = { send: vi.fn().mockResolvedValue(undefined) };
    const logger = { error: vi.fn() };
    const listener = new TicketNotificacionListener(
      ticketRepo as never,
      contactoResolver as never,
      emailSender as never,
      logger as never,
    );
    return { listener, ticketRepo, contactoResolver, emailSender, logger };
  }

  describe('onTicketEstadoCambiado', () => {
    it('notifica por email al SOLICITANTE del ticket', async () => {
      const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
      const ticket = makeTicket();
      ticketRepo.findById.mockResolvedValue(ticket);
      contactoResolver.resolverContacto.mockResolvedValue({
        email: 'solicitante@dominio.com',
        nombre: 'Solicitante',
      });

      await listener.onTicketEstadoCambiado(
        new TicketEstadoCambiadoEvent({
          ticketId: 'ticket-uuid',
          estadoAnteriorCodigo: 'NUEVO',
          estadoNuevoCodigo: 'RESUELTO',
          autorId: 'autor-uuid',
        }),
      );
      await vi.waitFor(() => expect(emailSender.send).toHaveBeenCalled());

      expect(contactoResolver.resolverContacto).toHaveBeenCalledWith('solicitante-uuid');
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'solicitante@dominio.com' }),
      );
    });

    it('si el ticket no existe → no envía email (swallow)', async () => {
      const { listener, ticketRepo, emailSender } = makeListener();
      ticketRepo.findById.mockResolvedValue(null);

      await listener.onTicketEstadoCambiado(
        new TicketEstadoCambiadoEvent({
          ticketId: 'inexistente',
          estadoAnteriorCodigo: 'NUEVO',
          estadoNuevoCodigo: 'RESUELTO',
          autorId: 'autor-uuid',
        }),
      );

      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('si el solicitante no resuelve contacto → no envía email (N4, se omite y no falla)', async () => {
      const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
      ticketRepo.findById.mockResolvedValue(makeTicket());
      contactoResolver.resolverContacto.mockResolvedValue(null);

      await listener.onTicketEstadoCambiado(
        new TicketEstadoCambiadoEvent({
          ticketId: 'ticket-uuid',
          estadoAnteriorCodigo: 'NUEVO',
          estadoNuevoCodigo: 'RESUELTO',
          autorId: 'autor-uuid',
        }),
      );

      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('[CRITICAL] un fallo inesperado NUNCA se propaga (log-and-swallow)', async () => {
      const { listener, ticketRepo } = makeListener();
      ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

      await expect(
        listener.onTicketEstadoCambiado(
          new TicketEstadoCambiadoEvent({
            ticketId: 'ticket-uuid',
            estadoAnteriorCodigo: 'NUEVO',
            estadoNuevoCodigo: 'RESUELTO',
            autorId: 'autor-uuid',
          }),
        ),
      ).resolves.toBeUndefined();
    });

    it('[CRITICAL] un fallo inesperado se loguea (no queda mudo, ADR-6)', async () => {
      const { listener, ticketRepo, logger } = makeListener();
      ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

      await listener.onTicketEstadoCambiado(
        new TicketEstadoCambiadoEvent({
          ticketId: 'ticket-uuid',
          estadoAnteriorCodigo: 'NUEVO',
          estadoNuevoCodigo: 'RESUELTO',
          autorId: 'autor-uuid',
        }),
      );

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ticket-uuid'));
    });
  });

  describe('onTicketComentado', () => {
    it('notifica por email al SOLICITANTE del ticket (comentario público)', async () => {
      const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
      ticketRepo.findById.mockResolvedValue(makeTicket());
      contactoResolver.resolverContacto.mockResolvedValue({
        email: 'solicitante@dominio.com',
        nombre: 'Solicitante',
      });

      await listener.onTicketComentado(
        new TicketComentadoEvent({
          ticketId: 'ticket-uuid',
          operacionId: 'operacion-uuid',
          autorId: 'autor-uuid',
        }),
      );
      await vi.waitFor(() => expect(emailSender.send).toHaveBeenCalled());

      expect(contactoResolver.resolverContacto).toHaveBeenCalledWith('solicitante-uuid');
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'solicitante@dominio.com' }),
      );
    });

    it('[CRITICAL] un fallo inesperado NUNCA se propaga (log-and-swallow)', async () => {
      const { listener, ticketRepo } = makeListener();
      ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

      await expect(
        listener.onTicketComentado(
          new TicketComentadoEvent({
            ticketId: 'ticket-uuid',
            operacionId: 'operacion-uuid',
            autorId: 'autor-uuid',
          }),
        ),
      ).resolves.toBeUndefined();
    });

    it('[CRITICAL] un fallo inesperado se loguea (no queda mudo, ADR-6)', async () => {
      const { listener, ticketRepo, logger } = makeListener();
      ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

      await listener.onTicketComentado(
        new TicketComentadoEvent({
          ticketId: 'ticket-uuid',
          operacionId: 'operacion-uuid',
          autorId: 'autor-uuid',
        }),
      );

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ticket-uuid'));
    });
  });
});
