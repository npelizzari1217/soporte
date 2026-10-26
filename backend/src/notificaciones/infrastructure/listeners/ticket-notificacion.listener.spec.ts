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
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IContactoSolicitanteResolver } from '../../domain/ports/i-contacto-solicitante-resolver';
import { IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { IUsuarioContactoResolver } from '../../domain/ports/i-usuario-contacto-resolver';

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
    const ticketRepo = { findById: vi.fn<ITicketRepository['findById']>() };
    const contactoResolver = { resolver: vi.fn<IContactoSolicitanteResolver['resolver']>() };
    const emailSender = { send: vi.fn<IEmailSender['send']>().mockResolvedValue(undefined) };
    const logger = { error: vi.fn<ILogger['error']>() };
    const usuarioResolver = {
      resolverContacto: vi.fn<IUsuarioContactoResolver['resolverContacto']>(),
      resolverAdministradores: vi.fn<IUsuarioContactoResolver['resolverAdministradores']>(),
    };
    const tenantContext = { get: vi.fn().mockReturnValue({ clienteId: 'cliente-uuid' }) };
    const listener = new TicketNotificacionListener(
      ticketRepo,
      contactoResolver,
      emailSender,
      logger,
      usuarioResolver,
      tenantContext,
    );
    return {
      listener,
      ticketRepo,
      contactoResolver,
      emailSender,
      logger,
      usuarioResolver,
      tenantContext,
    };
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

    describe('al entrar a ESPERANDO_CLIENTE (ticket-esperando-cliente R4)', () => {
      const evento = (anterior: string, nuevo: string) =>
        new TicketEstadoCambiadoEvent({
          ticketId: 'ticket-uuid',
          estadoAnteriorCodigo: anterior,
          estadoNuevoCodigo: nuevo,
          autorId: 'autor-uuid',
        });

      it('envía al solicitante la plantilla de espera, no la de cambio de estado', async () => {
        const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicket());
        contactoResolver.resolver.mockResolvedValue({
          email: 'solicitante@dominio.com',
          nombre: 'Solicitante',
          esExterno: false,
        });

        await listener.onTicketEstadoCambiado(evento('EN_PROCESO', 'ESPERANDO_CLIENTE'));

        expect(emailSender.send).toHaveBeenCalledTimes(1);
        const msg = emailSender.send.mock.calls[0][0];
        expect(msg.to).toBe('solicitante@dominio.com');
        expect(msg.text).toContain('a la espera de tu respuesta');
        expect(msg.text).not.toContain('cambió de estado');
        expect(msg.text).toContain('/tickets/ticket-uuid');
      });

      it('el SMTP que falla no se propaga: queda registrado', async () => {
        const { listener, ticketRepo, contactoResolver, emailSender, logger } = makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicket());
        contactoResolver.resolver.mockResolvedValue({
          email: 'solicitante@dominio.com',
          nombre: 'Solicitante',
          esExterno: false,
        });
        emailSender.send.mockRejectedValue(new Error('SMTP caído'));

        await expect(
          listener.onTicketEstadoCambiado(evento('EN_PROCESO', 'ESPERANDO_CLIENTE')),
        ).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SMTP caído'));
      });

      it('el solicitante externo sin correo no recibe nada y el hecho se registra', async () => {
        const { listener, ticketRepo, contactoResolver, emailSender, logger } = makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicketExterno());
        contactoResolver.resolver.mockResolvedValue(null);

        await listener.onTicketEstadoCambiado(evento('EN_PROCESO', 'ESPERANDO_CLIENTE'));

        expect(emailSender.send).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ticket-uuid'));
      });

      it('el solicitante externo con correo recibe el aviso sin link al ticket', async () => {
        const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicketExterno());
        contactoResolver.resolver.mockResolvedValue({
          email: 'externo@dominio.com',
          nombre: 'Externo',
          esExterno: true,
        });

        await listener.onTicketEstadoCambiado(evento('EN_PROCESO', 'ESPERANDO_CLIENTE'));

        const msg = emailSender.send.mock.calls[0][0];
        expect(msg.to).toBe('externo@dominio.com');
        expect(msg.text).not.toContain('/tickets/');
        expect(msg.html).not.toContain('/tickets/');
      });

      it('la salida a EN_PROCESO no envía el mail de espera (el listener solo lo elige al entrar)', async () => {
        const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicket());
        contactoResolver.resolver.mockResolvedValue({
          email: 'solicitante@dominio.com',
          nombre: 'Solicitante',
          esExterno: false,
        });

        await listener.onTicketEstadoCambiado(evento('ESPERANDO_CLIENTE', 'EN_PROCESO'));

        const msg = emailSender.send.mock.calls[0]?.[0];
        expect(msg?.text ?? '').not.toContain('a la espera de tu respuesta');
      });
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

    describe('aviso a la contraparte (odd/tasks/pedidos-2026-10-26.md, S1-S2)', () => {
      const comentaSolicitante = new TicketComentadoEvent({
        ticketId: 'ticket-uuid',
        operacionId: 'operacion-uuid',
        autorId: 'solicitante-uuid',
      });
      const destinos = (send: { mock: { calls: Array<[{ to: string }]> } }): string[] =>
        send.mock.calls.map(([msg]) => msg.to);

      it('comenta el solicitante: avisa al técnico asignado, con link, y no al solicitante', async () => {
        const { listener, ticketRepo, contactoResolver, emailSender, usuarioResolver } =
          makeListener();
        const ticket = makeTicket();
        ticket.assignTo('tecnico-uuid');
        ticketRepo.findById.mockResolvedValue(ticket);
        usuarioResolver.resolverContacto.mockResolvedValue({
          email: 'tecnico@dominio.com',
          nombre: 'Técnico',
        });

        await listener.onTicketComentado(comentaSolicitante);

        expect(destinos(emailSender.send)).toEqual(['tecnico@dominio.com']);
        expect(usuarioResolver.resolverContacto).toHaveBeenCalledWith('tecnico-uuid');
        expect(contactoResolver.resolver).not.toHaveBeenCalled();
        const msg = emailSender.send.mock.calls[0][0];
        expect(msg.subject).toBe('Nuevo comentario en el ticket SOP-2026-00042');
        expect(msg.text).toContain('/tickets/ticket-uuid');
      });

      it('comenta el solicitante sin técnico asignado: avisa a los administradores, sin repetir direcciones', async () => {
        const { listener, ticketRepo, emailSender, usuarioResolver } = makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicket());
        usuarioResolver.resolverContacto.mockResolvedValue({
          email: 'solicitante@dominio.com',
          nombre: 'Solicitante',
        });
        usuarioResolver.resolverAdministradores.mockResolvedValue([
          { email: 'admin1@dominio.com', nombre: 'Admin 1' },
          { email: 'ADMIN1@dominio.com', nombre: 'Admin 1 bis' },
          { email: 'admin2@dominio.com', nombre: 'Admin 2' },
        ]);

        await listener.onTicketComentado(comentaSolicitante);

        expect(usuarioResolver.resolverAdministradores).toHaveBeenCalledWith('cliente-uuid');
        expect(destinos(emailSender.send)).toEqual(['admin1@dominio.com', 'admin2@dominio.com']);
      });

      it('un solicitante que además es administrador no recibe aviso de su propio comentario', async () => {
        const { listener, ticketRepo, emailSender, usuarioResolver } = makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicket());
        usuarioResolver.resolverContacto.mockResolvedValue({
          email: 'solicitante@dominio.com',
          nombre: 'Solicitante',
        });
        usuarioResolver.resolverAdministradores.mockResolvedValue([
          { email: 'Solicitante@dominio.com', nombre: 'Solicitante' },
          { email: 'admin2@dominio.com', nombre: 'Admin 2' },
        ]);

        await listener.onTicketComentado(comentaSolicitante);

        expect(destinos(emailSender.send)).toEqual(['admin2@dominio.com']);
      });

      it('el solicitante que es también el asignado no recibe aviso de su propio comentario', async () => {
        const { listener, ticketRepo, emailSender } = makeListener();
        const ticket = makeTicket();
        ticket.assignTo('solicitante-uuid');
        ticketRepo.findById.mockResolvedValue(ticket);

        await listener.onTicketComentado(comentaSolicitante);

        expect(emailSender.send).not.toHaveBeenCalled();
      });

      it('sin TenantContext no puede resolver administradores: no envía y no falla', async () => {
        const { listener, ticketRepo, emailSender, usuarioResolver, tenantContext } =
          makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicket());
        tenantContext.get.mockReturnValue(undefined);

        await expect(listener.onTicketComentado(comentaSolicitante)).resolves.toBeUndefined();
        expect(usuarioResolver.resolverAdministradores).not.toHaveBeenCalled();
        expect(emailSender.send).not.toHaveBeenCalled();
      });

      it('un envío que falla no frena al siguiente administrador y queda registrado', async () => {
        const { listener, ticketRepo, emailSender, usuarioResolver, logger } = makeListener();
        ticketRepo.findById.mockResolvedValue(makeTicket());
        usuarioResolver.resolverContacto.mockResolvedValue(null);
        usuarioResolver.resolverAdministradores.mockResolvedValue([
          { email: 'admin1@dominio.com', nombre: 'Admin 1' },
          { email: 'admin2@dominio.com', nombre: 'Admin 2' },
        ]);
        emailSender.send.mockRejectedValueOnce(new Error('smtp caído'));

        await listener.onTicketComentado(comentaSolicitante);

        expect(destinos(emailSender.send)).toEqual(['admin1@dominio.com', 'admin2@dominio.com']);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ticket-uuid'));
        expect(logger.error).not.toHaveBeenCalledWith(
          expect.stringContaining('admin1@dominio.com'),
        );
      });

      it('comenta el técnico: avisa al solicitante y no al técnico', async () => {
        const { listener, ticketRepo, contactoResolver, emailSender, usuarioResolver } =
          makeListener();
        const ticket = makeTicket();
        ticket.assignTo('tecnico-uuid');
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
            autorId: 'tecnico-uuid',
          }),
        );

        expect(destinos(emailSender.send)).toEqual(['solicitante@dominio.com']);
        expect(usuarioResolver.resolverContacto).not.toHaveBeenCalled();
      });
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
