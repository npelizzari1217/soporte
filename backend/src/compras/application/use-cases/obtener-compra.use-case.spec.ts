/**
 * [UNIT] RED→GREEN: `ObtenerCompraUseCase` (sdd/beta-frontend item 1 — G7).
 *
 * Alto valor (política 80/20): `:id` = ticket BASE (no el satélite), 404
 * cuando el ticket o el satélite no existen/están soft-deleted, embebe
 * items+presupuestos activos.
 */
import { ObtenerCompraUseCase } from './obtener-compra.use-case';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';

function makeTicket(id: string): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'COM-2026-00001',
      titulo: 'Compra de prueba',
      descripcion: null,
      tipoId: 'tipo-compras-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    id,
  );
}

describe('ObtenerCompraUseCase', () => {
  it('retorna ticket + satélite + items + presupuestos activos', async () => {
    const ticket = makeTicket('ticket-1');
    const ticketCompra = TicketCompraEntity.create({ ticketId: 'ticket-1' }, 'tc-1');
    const ticketRepo = { findById: vi.fn().mockResolvedValue(ticket) };
    const ticketCompraRepo = { findByTicketId: vi.fn().mockResolvedValue(ticketCompra) };
    const itemCompraRepo = { findActiveByTicketCompraId: vi.fn().mockResolvedValue(['item-a']) };
    const presupuestoRepo = { findByTicketCompraId: vi.fn().mockResolvedValue(['presu-a']) };

    const useCase = new ObtenerCompraUseCase(
      ticketRepo as never,
      ticketCompraRepo as never,
      itemCompraRepo as never,
      presupuestoRepo as never,
    );
    const result = await useCase.execute('ticket-1');

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.ticket).toBe(ticket);
    expect(value.ticketCompra).toBe(ticketCompra);
    expect(value.items).toEqual(['item-a']);
    expect(value.presupuestos).toEqual(['presu-a']);
    expect(itemCompraRepo.findActiveByTicketCompraId).toHaveBeenCalledWith('tc-1');
    expect(presupuestoRepo.findByTicketCompraId).toHaveBeenCalledWith('tc-1');
  });

  it('ticket base inexistente → CompraNoEncontradaError (404)', async () => {
    const ticketRepo = { findById: vi.fn().mockResolvedValue(null) };
    const ticketCompraRepo = { findByTicketId: vi.fn() };
    const itemCompraRepo = { findActiveByTicketCompraId: vi.fn() };
    const presupuestoRepo = { findByTicketCompraId: vi.fn() };

    const useCase = new ObtenerCompraUseCase(
      ticketRepo as never,
      ticketCompraRepo as never,
      itemCompraRepo as never,
      presupuestoRepo as never,
    );
    const result = await useCase.execute('ticket-inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(ticketCompraRepo.findByTicketId).not.toHaveBeenCalled();
  });

  it('ticket existe pero no es de tipo COMPRAS (sin satélite) → CompraNoEncontradaError', async () => {
    const ticket = makeTicket('ticket-2');
    const ticketRepo = { findById: vi.fn().mockResolvedValue(ticket) };
    const ticketCompraRepo = { findByTicketId: vi.fn().mockResolvedValue(null) };
    const itemCompraRepo = { findActiveByTicketCompraId: vi.fn() };
    const presupuestoRepo = { findByTicketCompraId: vi.fn() };

    const useCase = new ObtenerCompraUseCase(
      ticketRepo as never,
      ticketCompraRepo as never,
      itemCompraRepo as never,
      presupuestoRepo as never,
    );
    const result = await useCase.execute('ticket-2');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });
});
