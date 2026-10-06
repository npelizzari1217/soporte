/**
 * [UNIT] ReanudarPorComentarioListener (`ticket-esperando-cliente` R3, ADR-5).
 * Puertos mockeados; la regla "el comentario interno no reanuda" depende del evento (solo se emite
 * para los públicos) y la cubre el e2e.
 */
import { ReanudarPorComentarioListener } from './reanudar-por-comentario.listener';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketComentadoEvent } from '../../domain/events/ticket-comentado.event';
import { TransicionInvalidaError } from '../../domain/errors/tickets.errors';
import { Result } from '../../../shared/domain/result';

function makeTicket(solicitanteId: string | null = 'solicitante-uuid') {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket',
      descripcion: null,
      tipoId: 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId,
      solicitanteExternoId: solicitanteId === null ? 'externo-uuid' : null,
    },
    'ticket-uuid',
  );
}

const evento = (autorId: string) =>
  new TicketComentadoEvent({ ticketId: 'ticket-uuid', operacionId: 'op-uuid', autorId });

function setup(estadoCodigo = 'ESPERANDO_CLIENTE') {
  const ticketRepo = { findById: vi.fn().mockResolvedValue(makeTicket()) };
  const estadoRepo = { findById: vi.fn().mockResolvedValue({ codigo: estadoCodigo }) };
  const transicionar = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicket())) };
  const logger = { error: vi.fn() };
  const listener = new ReanudarPorComentarioListener(ticketRepo, estadoRepo, transicionar, logger);
  return { listener, ticketRepo, estadoRepo, transicionar, logger };
}

describe('ReanudarPorComentarioListener', () => {
  it('el solicitante comenta en ESPERANDO_CLIENTE: transiciona a EN_PROCESO por el arco normal, con él como autor', async () => {
    const { listener, transicionar } = setup();

    await listener.onTicketComentado(evento('solicitante-uuid'));

    expect(transicionar.execute).toHaveBeenCalledTimes(1);
    expect(transicionar.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-uuid',
      nuevoEstadoCodigo: 'EN_PROCESO',
      autorId: 'solicitante-uuid',
      actorEsCorrector: false,
    });
  });

  it('otro autor (técnico, colaborador) no reanuda', async () => {
    const { listener, transicionar } = setup();

    await listener.onTicketComentado(evento('tecnico-uuid'));

    expect(transicionar.execute).not.toHaveBeenCalled();
  });

  it('ticket de solicitante externo: nadie con sesión es el solicitante, no reanuda', async () => {
    const { listener, ticketRepo, transicionar } = setup();
    ticketRepo.findById.mockResolvedValue(makeTicket(null));

    await listener.onTicketComentado(evento('tecnico-uuid'));

    expect(transicionar.execute).not.toHaveBeenCalled();
  });

  it.each(['EN_PROCESO', 'ASIGNADO', 'RESUELTO'])(
    'ticket en %s: el comentario del solicitante no genera transición',
    async (codigo) => {
      const { listener, transicionar } = setup(codigo);

      await listener.onTicketComentado(evento('solicitante-uuid'));

      expect(transicionar.execute).not.toHaveBeenCalled();
    },
  );

  it('ticket inexistente: no hace nada', async () => {
    const { listener, ticketRepo, transicionar } = setup();
    ticketRepo.findById.mockResolvedValue(null);

    await listener.onTicketComentado(evento('solicitante-uuid'));

    expect(transicionar.execute).not.toHaveBeenCalled();
  });

  it('TransicionInvalidaError del segundo comentario concurrente: se loguea y se ignora', async () => {
    const { listener, transicionar, logger } = setup();
    transicionar.execute.mockResolvedValue(
      Result.fail(new TransicionInvalidaError('EN_PROCESO', 'EN_PROCESO')),
    );

    await expect(listener.onTicketComentado(evento('solicitante-uuid'))).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ticket-uuid'));
  });

  it('un fallo inesperado nunca se propaga: se loguea', async () => {
    const { listener, ticketRepo, logger } = setup();
    ticketRepo.findById.mockRejectedValue(new Error('DB caída'));

    await expect(listener.onTicketComentado(evento('solicitante-uuid'))).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('DB caída'));
  });
});
