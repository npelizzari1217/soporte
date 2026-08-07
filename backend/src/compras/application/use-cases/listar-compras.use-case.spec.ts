/**
 * T4.5 [UNIT] — RED→GREEN: `ListarComprasUseCase`.
 *
 * Resuelve cada `TicketCompraEntity` con su `Ticket` base (join en
 * memoria — `ticket_compra` no tiene el número/título propios). Omite
 * silenciosamente satélites huérfanos (sin ticket base — no debería pasar
 * en producción, pero es defensivo).
 *
 * Tarea: T4.5.
 */
import { ListarComprasUseCase } from './listar-compras.use-case';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';

function makeTicket(id: string): TicketEntity {
  return TicketEntity.create(
    {
      numero: `COM-2026-0000${id}`,
      titulo: `Compra ${id}`,
      descripcion: null,
      tipoId: 'tipo-compras-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    `ticket-${id}`,
  );
}

describe('ListarComprasUseCase', () => {
  it('retorna cada ticket_compra resuelto con su ticket base', async () => {
    const ticketCompra1 = TicketCompraEntity.create({ ticketId: 'ticket-1' }, 'tc-1');
    const ticketCompra2 = TicketCompraEntity.create({ ticketId: 'ticket-2' }, 'tc-2');

    const ticketCompraRepo = {
      findAll: vi.fn().mockResolvedValue([ticketCompra1, ticketCompra2]),
    };
    const ticketRepo = {
      findById: vi.fn((id: string) => Promise.resolve(makeTicket(id.replace('ticket-', '')))),
    };

    const useCase = new ListarComprasUseCase(ticketCompraRepo as never, ticketRepo as never);
    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    const items = result.getValue();
    expect(items).toHaveLength(2);
    expect(items[0].ticket.numero).toBe('COM-2026-00001');
    expect(items[0].ticketCompra.id).toBe('tc-1');
  });

  it('omite satelites huerfanos (sin ticket base)', async () => {
    const ticketCompraOrfano = TicketCompraEntity.create(
      { ticketId: 'ticket-fantasma' },
      'tc-huerfano',
    );
    const ticketCompraRepo = { findAll: vi.fn().mockResolvedValue([ticketCompraOrfano]) };
    const ticketRepo = { findById: vi.fn().mockResolvedValue(null) };

    const useCase = new ListarComprasUseCase(ticketCompraRepo as never, ticketRepo as never);
    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(0);
  });
});
