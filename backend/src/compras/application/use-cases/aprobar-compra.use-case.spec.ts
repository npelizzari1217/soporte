/**
 * T5.1/T5.2 [UNIT] — RED→GREEN: `AprobarCompraUseCase` (ADR-1, F3-C4).
 *
 * Setea el satélite (`aprobado_por_id`/`aprobado_en`) y registra una
 * operación APROBACION en el timeline del ticket, TODO en una transacción.
 * NUNCA cambia el estado del `Ticket` base (ADR-1 — la aprobación es un
 * gate de negocio sobre el satélite, no una transición). Doble aprobación
 * falla con `CompraYaDecididaError`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C4. Ref design: ADR-1.
 * Tarea: T5.1, T5.2.
 */
import { AprobarCompraUseCase, AprobarCompraDto } from './aprobar-compra.use-case';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { CompraNoEncontradaError, CompraYaDecididaError } from '../../domain/errors/compras.errors';

function makeTicket(estadoId = 'estado-nuevo-uuid'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'COM-2026-00001',
      titulo: 'Compra de notebooks',
      descripcion: null,
      tipoId: 'tipo-compras-uuid',
      estadoId,
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

function baseDto(overrides: Partial<AprobarCompraDto> = {}): AprobarCompraDto {
  return { ticketId: 'ticket-uuid', aprobadoPorId: 'aprobador-uuid', ...overrides };
}

describe('AprobarCompraUseCase', () => {
  function makeCollaborators() {
    const ticket = makeTicket();
    const ticketCompra = TicketCompraEntity.create(
      { ticketId: 'ticket-uuid' },
      'ticket-compra-uuid',
    );

    const ticketRepo = { findById: vi.fn().mockResolvedValue(ticket) };
    const ticketCompraRepo = {
      findByTicketId: vi.fn().mockResolvedValue(ticketCompra),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-aprobacion-uuid'),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new AprobarCompraUseCase(
      ticketRepo as never,
      ticketCompraRepo as never,
      operacionRepo as never,
      tipoOperacionRepo as never,
      txRunner as never,
    );

    return {
      useCase,
      ticket,
      ticketCompra,
      ticketRepo,
      ticketCompraRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
    };
  }

  it('F3-C4: setea el satelite y registra APROBACION en el timeline, sin cambiar el estado del ticket', async () => {
    const c = makeCollaborators();
    const estadoOriginal = c.ticket.estadoId;

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const { ticket: ticketResultante, ticketCompra: ticketCompraResultante } = result.getValue();
    expect(ticketResultante.id).toBe('ticket-uuid');
    expect(ticketCompraResultante.aprobada).toBe(true);
    expect(ticketCompraResultante.aprobadoPorId).toBe('aprobador-uuid');

    expect(c.ticket.estadoId).toBe(estadoOriginal); // NUNCA cambia el estado del ticket (ADR-1)
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketCompraRepo.save).toHaveBeenCalledWith(c.ticketCompra);

    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    const operacion = c.operacionRepo.save.mock.calls[0][0];
    expect(operacion.tipoOperacionId).toBe('tipo-op-aprobacion-uuid');
    expect(operacion.ticketId).toBe('ticket-uuid');
    expect(operacion.autorId).toBe('aprobador-uuid');
  });

  it('ticket inexistente → TicketNoEncontradoError', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('ticket_compra inexistente → CompraNoEncontradaError', async () => {
    const c = makeCollaborators();
    c.ticketCompraRepo.findByTicketId.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('doble aprobacion (ya decidida) → CompraYaDecididaError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.ticketCompra.aprobar('otro-aprobador', new Date());

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraYaDecididaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
