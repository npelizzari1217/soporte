/**
 * 6.3 [UNIT] — RED→GREEN: PreventivoGeneradoNotificacionListener — wiring
 * `@OnEvent` (`preventivo.generado`) → notifica al RESPONSABLE del plan +
 * ADMINISTRADORES del tenant ([R11]). Mismo patrón que
 * `SlaVencidoNotificacionListener` (S4, N3/N4): aislamiento por-destinatario
 * y try/catch total (ADR-6) — un listener que lanza NUNCA aborta el ciclo de
 * generación que emitió el evento (`GenerarPreventivosUseCase`, WU-5/WU-6),
 * porque `EventEmitter2DomainEventPublisher.publish()` es fire-and-forget
 * (no espera a los listeners) y este handler protege su propio cuerpo.
 *
 * ALS (ADR-P8): el barrido (`PreventivoSweepScheduler` → `GenerarPreventivosUseCase`)
 * emite el evento DENTRO de `tenantContext.run()` — este handler hereda el
 * `clienteId` activo para `resolverAdministradores`, igual que el listener de
 * `sla.vencido`.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Notificación solo al generar".
 * Ref design: ADR-PV2 (flujo de datos), ADR-P8. Tarea: 6.2, 6.3.
 */
import { PreventivoGeneradoNotificacionListener } from './preventivo-generado-notificacion.listener';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { PreventivoGeneradoEvent } from '../../../preventivo/domain/events/preventivo-generado.event';

function makeTicket() {
  return TicketEntity.create(
    {
      numero: 'MAN-2026-00033',
      titulo: 'Revisión de aire acondicionado',
      descripcion: 'Limpiar filtros',
      tipoId: 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'responsable-uuid',
    },
    'ticket-uuid',
  );
}

function makeEvent(
  overrides: Partial<ConstructorParameters<typeof PreventivoGeneradoEvent>[0]> = {},
) {
  return new PreventivoGeneradoEvent({
    planId: 'plan-uuid',
    ticketId: 'ticket-uuid',
    responsableId: 'responsable-uuid',
    ...overrides,
  });
}

describe('PreventivoGeneradoNotificacionListener', () => {
  function makeListener(clienteId: string | null = 'cliente-uuid') {
    const ticketRepo = { findById: vi.fn() };
    const contactoResolver = { resolverContacto: vi.fn(), resolverAdministradores: vi.fn() };
    const emailSender = { send: vi.fn().mockResolvedValue(undefined) };
    const tenantContext = {
      get: vi.fn().mockReturnValue(clienteId !== null ? { clienteId } : undefined),
    };
    const logger = { error: vi.fn() };
    const listener = new PreventivoGeneradoNotificacionListener(
      ticketRepo as never,
      contactoResolver as never,
      emailSender as never,
      tenantContext as never,
      logger as never,
    );
    return { listener, ticketRepo, contactoResolver, emailSender, tenantContext, logger };
  }

  it('notifica al RESPONSABLE del plan y a cada ADMINISTRADOR del tenant', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket());
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'responsable@dominio.com',
      nombre: 'Responsable',
    });
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
      { email: 'admin2@dominio.com', nombre: 'Admin2' },
    ]);

    await listener.onPreventivoGenerado(makeEvent());

    expect(contactoResolver.resolverContacto).toHaveBeenCalledWith('responsable-uuid');
    expect(contactoResolver.resolverAdministradores).toHaveBeenCalledWith('cliente-uuid');
    expect(emailSender.send).toHaveBeenCalledTimes(3);
    const destinatarios = emailSender.send.mock.calls.map((call) => call[0].to);
    expect(destinatarios).toEqual(
      expect.arrayContaining([
        'responsable@dominio.com',
        'admin1@dominio.com',
        'admin2@dominio.com',
      ]),
    );
  });

  it('[N4] si el responsable no resuelve contacto → se omite ese envío, NO afecta el envío a administradores', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket());
    contactoResolver.resolverContacto.mockResolvedValue(null);
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
    ]);

    await listener.onPreventivoGenerado(makeEvent());

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin1@dominio.com' }),
    );
  });

  it('[CRITICAL] aislamiento por-destinatario: un send() que falla NO bloquea el resto (N4)', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket());
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'responsable@dominio.com',
      nombre: 'Responsable',
    });
    contactoResolver.resolverAdministradores.mockResolvedValue([
      { email: 'admin1@dominio.com', nombre: 'Admin1' },
    ]);
    emailSender.send.mockRejectedValueOnce(new Error('SMTP caído'));

    await expect(listener.onPreventivoGenerado(makeEvent())).resolves.toBeUndefined();
    expect(emailSender.send).toHaveBeenCalledTimes(2);
  });

  it('[CRITICAL] el fallo por-destinatario se loguea (no queda mudo, ADR-6)', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender, logger } = makeListener();
    ticketRepo.findById.mockResolvedValue(makeTicket());
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'responsable@dominio.com',
      nombre: 'Responsable',
    });
    contactoResolver.resolverAdministradores.mockResolvedValue([]);
    emailSender.send.mockRejectedValueOnce(new Error('SMTP caído'));

    await listener.onPreventivoGenerado(makeEvent());

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('responsable@dominio.com'));
  });

  it('si el ticket no existe → no envía ningún email', async () => {
    const { listener, ticketRepo, emailSender } = makeListener();
    ticketRepo.findById.mockResolvedValue(null);

    await listener.onPreventivoGenerado(makeEvent());

    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('sin TenantContext activo (clienteId indefinido) → NO resuelve administradores, solo intenta al responsable', async () => {
    const { listener, ticketRepo, contactoResolver, emailSender } = makeListener(null);
    ticketRepo.findById.mockResolvedValue(makeTicket());
    contactoResolver.resolverContacto.mockResolvedValue({
      email: 'responsable@dominio.com',
      nombre: 'Responsable',
    });

    await listener.onPreventivoGenerado(makeEvent());

    expect(contactoResolver.resolverAdministradores).not.toHaveBeenCalled();
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('[CRITICAL/6.3] un fallo inesperado (ej. ticketRepo lanza) NUNCA se propaga — el listener que lanza no aborta el ciclo de generación', async () => {
    const { listener, ticketRepo } = makeListener();
    ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

    await expect(listener.onPreventivoGenerado(makeEvent())).resolves.toBeUndefined();
  });

  it('[CRITICAL] un fallo inesperado se loguea (no queda mudo, ADR-6)', async () => {
    const { listener, ticketRepo, logger } = makeListener();
    ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

    await listener.onPreventivoGenerado(makeEvent());

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ticket-uuid'));
  });
});
