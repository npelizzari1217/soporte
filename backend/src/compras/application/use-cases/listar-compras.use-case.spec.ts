/**
 * Unit tests para ListarComprasUseCase.
 *
 * Verifica:
 * - Delega a ITicketCompraRepository.findAll para obtener los satélites.
 * - Para cada satélite, llama a ITicketRepository.findById con el ticketId.
 * - Retorna Result.ok con la lista de pares {ticket, ticketCompra}.
 * - Omite pares donde el ticket base no se encuentra (registros huérfanos).
 * - Retorna Result.ok con lista vacía cuando no hay compras.
 *
 * Tarea: feat/tickets-list-mvp
 */
import { ListarComprasUseCase } from './listar-compras.use-case';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTicketCompra(id: string, ticketId: string): TicketCompraEntity {
  return TicketCompraEntity.reconstitute(
    { ticketId, aprobadoPorId: null, aprobadoEn: null, motivoRechazo: null },
    id,
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T10:00:00Z'),
    null,
  );
}

function makeTicket(id: string, numero: string): TicketEntity {
  return TicketEntity.reconstitute(
    {
      numero,
      titulo: 'Compra de insumos',
      descripcion: null,
      tipoId: 'e0000000-0000-4000-e000-000000000002',
      estadoId: 'c0000000-0000-4000-c000-000000000001',
      prioridadId: 'd0000000-0000-4000-d000-000000000002',
      cicloId: null,
      solicitanteId: 'user-001',
      asignadoId: null,
      fechaVencimiento: null,
    },
    id,
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T10:00:00Z'),
    null,
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ListarComprasUseCase', () => {
  let useCase: ListarComprasUseCase;

  const mockTicketCompraRepo = {
    findByTicketId: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn<Promise<TicketCompraEntity[]>, []>(),
    save: jest.fn(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketCompraRepository>;

  const mockTicketRepo = {
    findById: jest.fn(),
    findByNumero: jest.fn(),
    findLastSecuencia: jest.fn(),
    findAll: jest.fn(),
    findByEstado: jest.fn(),
    save: jest.fn<Promise<void>, [TicketEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ListarComprasUseCase(mockTicketCompraRepo, mockTicketRepo);
  });

  it('retorna Result.ok con lista vacía cuando no hay compras', async () => {
    mockTicketCompraRepo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(0);
    expect(mockTicketCompraRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('retorna Result.ok con la lista de pares {ticket, ticketCompra} para cada compra', async () => {
    const tc1 = makeTicketCompra('tc-001', 'ticket-001');
    const tc2 = makeTicketCompra('tc-002', 'ticket-002');
    const t1 = makeTicket('ticket-001', 'COM-2026-00001');
    const t2 = makeTicket('ticket-002', 'COM-2026-00002');

    mockTicketCompraRepo.findAll.mockResolvedValue([tc1, tc2]);
    mockTicketRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'ticket-001') return t1;
      if (id === 'ticket-002') return t2;
      return null;
    });

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(2);
    expect(result.getValue()[0].ticketCompra.id).toBe('tc-001');
    expect(result.getValue()[0].ticket.id).toBe('ticket-001');
    expect(result.getValue()[1].ticketCompra.id).toBe('tc-002');
    expect(result.getValue()[1].ticket.id).toBe('ticket-002');
  });

  it('omite entradas donde el ticket base no se encuentra (registros huérfanos)', async () => {
    const tc1 = makeTicketCompra('tc-001', 'ticket-001');
    const tc2 = makeTicketCompra('tc-002', 'ticket-999'); // ticket huérfano
    const t1 = makeTicket('ticket-001', 'COM-2026-00001');

    mockTicketCompraRepo.findAll.mockResolvedValue([tc1, tc2]);
    mockTicketRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'ticket-001') return t1;
      return null;
    });

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(1);
    expect(result.getValue()[0].ticketCompra.id).toBe('tc-001');
  });

  it('llama findById por cada ticketCompra con el ticketId correcto', async () => {
    const tc1 = makeTicketCompra('tc-001', 'ticket-001');
    const t1 = makeTicket('ticket-001', 'COM-2026-00001');

    mockTicketCompraRepo.findAll.mockResolvedValue([tc1]);
    mockTicketRepo.findById.mockResolvedValue(t1);

    await useCase.execute();

    expect(mockTicketRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockTicketRepo.findById).toHaveBeenCalledWith('ticket-001');
  });
});
