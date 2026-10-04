/**
 * N7 [UNIT] — RED→GREEN: TicketNotificacionListener — wiring @OnEvent
 * (`ticket.estado_cambiado`, `ticket.comentado`) → carga ticket
 * (TICKET_REPOSITORY) → resuelve contacto del SOLICITANTE
 * (IContactoSolicitanteResolver) → arma EmailMessage (plantilla) → send()
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

function makeTicketExterno() {
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
      solicitanteId: null,
      solicitanteExternoId: 'externo-uuid',
    },
    'ticket-uuid',
  );
}

describe('TicketNotificacionListener', () => {
  function makeListener() {
    const ticketRepo = { findById: vi.fn() };
    const contactoResolver = { resolver: vi.fn() };
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
      contactoResolver.resolver.mockResolvedValue({
        email: 'solicitante@dominio.com',
        nombre: 'Solicitante',
        esExterno: false,
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

      expect(contactoResolver.resolver).toHaveBeenCalledWith(ticket);
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'solicitante@dominio.com' }),
      );
      expect(emailSender.send.mock.calls[0][0].text).toContain('/tickets/ticket-uuid');
    });

    it('un solicitante externo recibe el mail de estado en su email, sin link al ticket', async () => {
      const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
      ticketRepo.findById.mockResolvedValue(makeTicketExterno());
      contactoResolver.resolver.mockResolvedValue({
        email: 'externo@dominio.com',
        nombre: 'Externo',
        esExterno: true,
      });

      await listener.onTicketEstadoCambiado(
        new TicketEstadoCambiadoEvent({
          ticketId: 'ticket-uuid',
          estadoAnteriorCodigo: 'NUEVO',
          estadoNuevoCodigo: 'RESUELTO',
          autorId: 'autor-uuid',
        }),
      );

      expect(emailSender.send).toHaveBeenCalledTimes(1);
      const msg = emailSender.send.mock.calls[0][0];
      expect(msg.to).toBe('externo@dominio.com');
      expect(msg.text).toContain('RESUELTO');
      expect(msg.text).not.toContain('/tickets/');
      expect(msg.html).not.toContain('/tickets/');
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
      contactoResolver.resolver.mockResolvedValue(null);

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
      const ticket = makeTicket();
      ticketRepo.findById.mockResolvedValue(ticket);
      contactoResolver.resolver.mockResolvedValue({
        email: 'solicitante@dominio.com',
        nombre: 'Solicitante',
        esExterno: false,
      });

      await listener.onTicketComentado(
        new TicketComentadoEvent({
          ticketId: 'ticket-uuid',
          operacionId: 'operacion-uuid',
          autorId: 'autor-uuid',
        }),
      );
      await vi.waitFor(() => expect(emailSender.send).toHaveBeenCalled());

      expect(contactoResolver.resolver).toHaveBeenCalledWith(ticket);
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'solicitante@dominio.com' }),
      );
    });

    it('comentario PUBLICO de un ticket externo: envia un mail al externo, sin link al ticket', async () => {
      const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
      ticketRepo.findById.mockResolvedValue(makeTicketExterno());
      contactoResolver.resolver.mockResolvedValue({
        email: 'externo@dominio.com',
        nombre: 'Externo',
        esExterno: true,
      });

      await listener.onTicketComentado(
        new TicketComentadoEvent({
          ticketId: 'ticket-uuid',
          operacionId: 'operacion-uuid',
          autorId: 'autor-uuid',
        }),
      );

      expect(emailSender.send).toHaveBeenCalledTimes(1);
      const msg = emailSender.send.mock.calls[0][0];
      expect(msg.to).toBe('externo@dominio.com');
      expect(msg.text).not.toContain('/tickets/');
      expect(msg.html).not.toContain('/tickets/');
    });

    it('comentario INTERNO: no hay evento (no se publica), asi que no se envia ningun mail', () => {
      // `crear-comentario.use-case.ts` solo publica `ticket.comentado` para comentarios publicos.
      // Sin evento no hay invocacion del listener: el unico mail posible lo dispara el publico.
      const { emailSender } = makeListener();

      expect(emailSender.send).not.toHaveBeenCalled();
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
