/**
 * [UNIT] NotificadorVencimientoSla — entrega común (extraída del listener de `sla.vencido`, WU-7):
 * notifica al ASIGNADO + ADMINISTRADORES del tenant (S4,
 * N3/N4). Diferido de PR-SLA-2, entregado en esta corrida de PR-N.
 *
 * ALS (ADR-P8): el handler hereda el `TenantContext` del `tenantContext.run()`
 * del job SLA (`SlaSweepScheduler`) — resuelve `clienteId` desde ahí para
 * `resolverAdministradores`.
 *
 * Ref spec: sdd/premium/spec S4, N3, N4. Ref design: ADR-P4, ADR-P8. Tarea: SB7/SB8.
 */
import { NotificadorVencimientoSla } from './notificador-vencimiento-sla';
import { templateSlaVencido } from '../domain/templates/email-templates';
import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';

function makeTicket(asignadoId: string | null) {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00099',
      titulo: 'Servidor caído',
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
  if (asignadoId) {
    ticket.assignTo(asignadoId);
  }
  return ticket;
}

describe('NotificadorVencimientoSla', () => {
  function makeListener(clienteId: string | null = 'cliente-uuid') {
    const ticketRepo = { findById: vi.fn() };
    const contactoResolver = { resolverContacto: vi.fn(), resolverAdministradores: vi.fn() };
    const emailSender = { send: vi.fn().mockResolvedValue(undefined) };
    const tenantContext = {
      get: vi.fn().mockReturnValue(clienteId !== null ? { clienteId } : undefined),
    };
    const logger = { error: vi.fn() };
    const listener = new NotificadorVencimientoSla(
      ticketRepo as never,
      contactoResolver as never,
      emailSender as never,
      tenantContext as never,
      logger as never,
    );
    return { listener, ticketRepo, contactoResolver, emailSender, tenantContext, logger };
  }

  it('notifica al ASIGNADO y a cada ADMINISTRADOR del tenant', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket('asignado-uuid'));
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'asignado@dominio.com',
      nombre: 'Asignado',
    });
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
      { email: 'admin2@dominio.com', nombre: 'Admin2' },
    ]);

    await listener.notificar(
      { ticketId: 'ticket-uuid', asignadoId: 'asignado-uuid' },
      templateSlaVencido,
      'Origen',
    );

    expect(contactoResolver.resolverContacto).toHaveBeenCalledWith('asignado-uuid');
    expect(contactoResolver.resolverAdministradores).toHaveBeenCalledWith('cliente-uuid');
    expect(emailSender.send).toHaveBeenCalledTimes(3);
    const destinatarios = emailSender.send.mock.calls.map((call) => call[0].to);
    expect(destinatarios).toEqual(
      expect.arrayContaining(['asignado@dominio.com', 'admin1@dominio.com', 'admin2@dominio.com']),
    );
  });

  it('[R4] un administrador que es el asignado recibe un solo mail (dedupe por email, sin distinguir mayúsculas)', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket('asignado-uuid'));
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'Admin1@dominio.com',
      nombre: 'Admin1',
    });
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
      { email: 'admin2@dominio.com', nombre: 'Admin2' },
    ]);

    await listener.notificar(
      { ticketId: 'ticket-uuid', asignadoId: 'asignado-uuid' },
      templateSlaVencido,
      'Origen',
    );

    expect(emailSender.send.mock.calls.map((c) => c[0].to)).toEqual([
      'Admin1@dominio.com',
      'admin2@dominio.com',
    ]);
  });

  it('usa la plantilla recibida con los datos del ticket', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket(null));
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
    ]);
    const plantilla = vi.fn().mockReturnValue({ subject: 'S', text: 'T', html: 'H' });

    await listener.notificar({ ticketId: 'ticket-uuid', asignadoId: null }, plantilla, 'Origen');

    expect(plantilla).toHaveBeenCalledWith(
      expect.objectContaining({ numero: 'SOP-2026-00099', titulo: 'Servidor caído' }),
    );
    expect(emailSender.send).toHaveBeenCalledWith({
      to: 'admin1@dominio.com',
      subject: 'S',
      text: 'T',
      html: 'H',
    });
  });

  it('ticket sin asignado (asignadoId=null) → NO intenta resolver contacto de asignado, solo notifica administradores', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket(null));
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
    ]);

    await listener.notificar(
      { ticketId: 'ticket-uuid', asignadoId: null },
      templateSlaVencido,
      'Origen',
    );

    expect(contactoResolver.resolverContacto).not.toHaveBeenCalled();
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin1@dominio.com' }),
    );
  });

  it('[N4] si el asignado no resuelve contacto → se omite ese envío, NO afecta el envío a administradores', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket('asignado-uuid'));
    contactoResolver.resolverContacto.mockResolvedValue(null);
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
    ]);

    await listener.notificar(
      { ticketId: 'ticket-uuid', asignadoId: 'asignado-uuid' },
      templateSlaVencido,
      'Origen',
    );

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin1@dominio.com' }),
    );
  });

  it('[CRITICAL] aislamiento por-destinatario: un send() que falla NO bloquea el resto (N4)', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket('asignado-uuid'));
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'asignado@dominio.com',
      nombre: 'Asignado',
    });
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
    ]);
    emailSender.send.mockRejectedValueOnce(new Error('SMTP caído'));

    await expect(
      listener.notificar(
        { ticketId: 'ticket-uuid', asignadoId: 'asignado-uuid' },
        templateSlaVencido,
        'Origen',
      ),
    ).resolves.toBeUndefined();
    expect(emailSender.send).toHaveBeenCalledTimes(2);
  });

  it('[CRITICAL] el fallo por-destinatario se loguea (no queda mudo, ADR-6)', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender, logger } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket('asignado-uuid'));
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'asignado@dominio.com',
      nombre: 'Asignado',
    });
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
    ]);
    emailSender.send.mockRejectedValueOnce(new Error('SMTP caído'));

    await listener.notificar(
      { ticketId: 'ticket-uuid', asignadoId: 'asignado-uuid' },
      templateSlaVencido,
      'Origen',
    );

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('asignado@dominio.com'));
  });

  it('si el ticket no existe → no envía ningún email', async () => {
    const { listener, ticketRepo, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(null);

    await listener.notificar(
      { ticketId: 'inexistente', asignadoId: 'asignado-uuid' },
      templateSlaVencido,
      'Origen',
    );

    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('sin TenantContext activo (clienteId indefinido) → NO resuelve administradores, solo intenta asignado', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener(null);
    ticketRepo.findById.mockResolvedValue(makeTicket('asignado-uuid'));
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'asignado@dominio.com',
      nombre: 'Asignado',
    });

    await listener.notificar(
      { ticketId: 'ticket-uuid', asignadoId: 'asignado-uuid' },
      templateSlaVencido,
      'Origen',
    );

    expect(contactoResolver.resolverAdministradores).not.toHaveBeenCalled();
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('[CRITICAL] un fallo inesperado (ej. ticketRepo lanza) NUNCA se propaga', async () => {
    const { listener, ticketRepo } = makeListener();
    ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

    await expect(
      listener.notificar(
        { ticketId: 'ticket-uuid', asignadoId: 'asignado-uuid' },
        templateSlaVencido,
        'Origen',
      ),
    ).resolves.toBeUndefined();
  });

  it('[CRITICAL] un fallo inesperado se loguea (no queda mudo, ADR-6)', async () => {
    const { listener, ticketRepo, logger } = makeListener();
    ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

    await listener.notificar(
      { ticketId: 'ticket-uuid', asignadoId: 'asignado-uuid' },
      templateSlaVencido,
      'Origen',
    );

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ticket-uuid'));
  });
});
