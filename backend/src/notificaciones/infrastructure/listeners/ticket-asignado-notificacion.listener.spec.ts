/**
 * TicketAsignadoNotificacionListener — `ticket.asignado` → mail a la persona asignada
 * (sdd/asignacion-automatica-por-tipo, WU-6: N2 a N7). Doubles tipados con `satisfies`, sin casts.
 */
import { TicketAsignadoNotificacionListener } from './ticket-asignado-notificacion.listener';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { PrioridadEntity } from '../../../tickets/domain/entities/prioridad.entity';
import { TicketAsignadoEvent } from '../../../tickets/domain/events/ticket-asignado.event';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { IPrioridadRepository } from '../../../tickets/domain/ports/i-prioridad.repository';
import { IUsuarioContactoResolver } from '../../domain/ports/i-usuario-contacto-resolver';
import { IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

const EMAIL = 'asignado@dominio.com';
const NOMBRE = 'Marta Asignada';
const ERROR_CRUDO = `smtp rechazó a ${EMAIL}`;

function makeTicket() {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00042',
      titulo: 'La impresora no imprime',
      descripcion: 'Sin tinta',
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

function makeEvent(overrides: Partial<ConstructorParameters<typeof TicketAsignadoEvent>[0]> = {}) {
  return new TicketAsignadoEvent({
    ticketId: 'ticket-uuid',
    asignadoId: 'asignado-uuid',
    origen: 'REGLA_TIPO',
    autorId: null,
    ...overrides,
  });
}

function makeListener() {
  const ticketRepo = {
    findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(makeTicket()),
  } satisfies Pick<ITicketRepository, 'findById'>;
  const tipoRepo = {
    findById: vi
      .fn<ITipoTicketRepository['findById']>()
      .mockResolvedValue(
        TipoTicketEntity.create(
          { codigo: 'SOPORTE', nombre: 'Soporte técnico', modulo: 'TICKETS', activo: true },
          'tipo-uuid',
        ),
      ),
  } satisfies Pick<ITipoTicketRepository, 'findById'>;
  const prioridadRepo = {
    findById: vi
      .fn<IPrioridadRepository['findById']>()
      .mockResolvedValue(
        PrioridadEntity.create(
          { codigo: 'ALTA', nombre: 'Alta', color: null, orden: 3, activo: true },
          'prioridad-uuid',
        ),
      ),
  } satisfies Pick<IPrioridadRepository, 'findById'>;
  const contactoResolver = {
    resolverContacto: vi
      .fn<IUsuarioContactoResolver['resolverContacto']>()
      .mockResolvedValue({ email: EMAIL, nombre: NOMBRE }),
  } satisfies Pick<IUsuarioContactoResolver, 'resolverContacto'>;
  const emailSender = {
    send: vi.fn<IEmailSender['send']>().mockResolvedValue(undefined),
  } satisfies Pick<IEmailSender, 'send'>;
  const logger = {
    log: vi.fn<ILogger['log']>(),
    error: vi.fn<ILogger['error']>(),
  } satisfies Pick<ILogger, 'log' | 'error'>;
  const listener = new TicketAsignadoNotificacionListener(
    ticketRepo,
    tipoRepo,
    prioridadRepo,
    contactoResolver,
    emailSender,
    logger,
  );
  return { listener, ticketRepo, tipoRepo, prioridadRepo, contactoResolver, emailSender, logger };
}

/** Todo lo que se logueó, junto, para comprobar que no filtra datos personales. */
function logueado(logger: ReturnType<typeof makeListener>['logger']): string {
  return [...logger.log.mock.calls, ...logger.error.mock.calls].flat().join('\n');
}

describe('TicketAsignadoNotificacionListener', () => {
  it('N2: manda el mail al asignado, con asunto, ticket, tipo y prioridad', async () => {
    const { listener, emailSender, contactoResolver } = makeListener();

    await listener.onTicketAsignado(makeEvent({ origen: 'MANUAL', autorId: 'actor-uuid' }));

    expect(contactoResolver.resolverContacto).toHaveBeenCalledWith('asignado-uuid');
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    const mensaje = emailSender.send.mock.calls[0][0];
    expect(mensaje.to).toBe(EMAIL);
    expect(mensaje.subject).toBe('Ticket SOP-2026-00042 asignado a usted');
    expect(mensaje.text).toContain('Tipo: Soporte técnico');
    expect(mensaje.text).toContain('Prioridad: Alta');
    expect(mensaje.text).toContain('/tickets/ticket-uuid');
  });

  it('N3: autoasignación (autorId = asignadoId) manda el mail igual', async () => {
    const { listener, emailSender } = makeListener();

    await listener.onTicketAsignado(
      makeEvent({ origen: 'MANUAL', asignadoId: 'yo-uuid', autorId: 'yo-uuid' }),
    );

    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('N2: el origen cambia el texto (regla del tipo vs. a mano)', async () => {
    const { listener, emailSender } = makeListener();

    await listener.onTicketAsignado(makeEvent({ origen: 'REGLA_TIPO' }));
    await listener.onTicketAsignado(makeEvent({ origen: 'MANUAL', autorId: 'actor-uuid' }));

    expect(emailSender.send.mock.calls[0][0].text).toContain('automáticamente');
    expect(emailSender.send.mock.calls[1][0].text).not.toContain('automáticamente');
  });

  it('tipo o prioridad faltante omite esa línea sin cancelar el mail', async () => {
    const { listener, emailSender, tipoRepo, prioridadRepo } = makeListener();
    tipoRepo.findById.mockResolvedValue(null);
    prioridadRepo.findById.mockResolvedValue(null);

    await listener.onTicketAsignado(makeEvent());

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    const { text } = emailSender.send.mock.calls[0][0];
    expect(text).not.toContain('Tipo:');
    expect(text).not.toContain('Prioridad:');
  });

  it('ticket inexistente: log TICKET_ASIGNADO_SIN_TICKET, no manda y no lanza', async () => {
    const { listener, ticketRepo, emailSender, logger } = makeListener();
    ticketRepo.findById.mockResolvedValue(null);

    await expect(listener.onTicketAsignado(makeEvent())).resolves.toBeUndefined();

    expect(emailSender.send).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('TICKET_ASIGNADO_SIN_TICKET'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('ticket-uuid'));
  });

  it('N5: sin contacto resoluble: log TICKET_ASIGNADO_SIN_CONTACTO sin dirección ni nombre', async () => {
    const { listener, contactoResolver, emailSender, logger } = makeListener();
    contactoResolver.resolverContacto.mockResolvedValue(null);

    await expect(listener.onTicketAsignado(makeEvent())).resolves.toBeUndefined();

    expect(emailSender.send).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('TICKET_ASIGNADO_SIN_CONTACTO'),
    );
    expect(logueado(logger)).not.toContain('asignado-uuid');
  });

  it('N5: si send lanza, el handler resuelve y loguea el ticketId, nunca el error crudo ni datos personales', async () => {
    const { listener, emailSender, logger } = makeListener();
    emailSender.send.mockRejectedValue(new Error(ERROR_CRUDO));

    await expect(listener.onTicketAsignado(makeEvent())).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const texto = logueado(logger);
    expect(texto).toContain('ticket-uuid');
    expect(texto).not.toContain(ERROR_CRUDO);
    expect(texto).not.toContain(EMAIL);
    expect(texto).not.toContain(NOMBRE);
  });

  it('N5: si falla cargar el ticket, el handler resuelve y loguea sin el error crudo', async () => {
    const { listener, ticketRepo, emailSender, logger } = makeListener();
    ticketRepo.findById.mockRejectedValue(new Error(ERROR_CRUDO));

    await expect(listener.onTicketAsignado(makeEvent())).resolves.toBeUndefined();

    expect(emailSender.send).not.toHaveBeenCalled();
    expect(logueado(logger)).not.toContain(ERROR_CRUDO);
  });

  it('N4: sin correo configurado el emisor resuelve sin enviar; el handler no lanza ni loguea error', async () => {
    const { listener, emailSender, logger } = makeListener();
    emailSender.send.mockResolvedValue(undefined);

    await expect(listener.onTicketAsignado(makeEvent())).resolves.toBeUndefined();

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('N7: no deduplica; dos eventos del mismo ticket mandan dos mails', async () => {
    const { listener, emailSender } = makeListener();

    await listener.onTicketAsignado(makeEvent());
    await listener.onTicketAsignado(makeEvent());

    expect(emailSender.send).toHaveBeenCalledTimes(2);
  });
});
