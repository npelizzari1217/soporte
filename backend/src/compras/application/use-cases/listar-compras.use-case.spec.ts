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
 * Fase 4 (ciclos-master-tenant, ADR-5): filtrado por ciclo.
 * - execute(cicloId?): sin cicloId, usa el ciclo ACTIVO del tenant.
 * - Con cicloId explícito (histórico), filtra por ese ciclo e ignora el activo.
 * - Sin ciclo activo ni cicloId explícito → Result.ok([]) sin llamar findAll.
 * - El filtro compara ticket.cicloId (no el satélite ticket_compra, que no tiene ciclo).
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-5
 * Tarea: 3.5 (Fase 4, PR3)
 */
import { ListarComprasUseCase } from './listar-compras.use-case';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ICicloClienteRepository } from '../../../tickets/domain/ports/i-ciclo-cliente.repository';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';

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

function makeTicket(id: string, numero: string, cicloId: string | null): TicketEntity {
  return TicketEntity.reconstitute(
    {
      numero,
      titulo: 'Compra de insumos',
      descripcion: null,
      tipoId: 'e0000000-0000-4000-e000-000000000002',
      estadoId: 'c0000000-0000-4000-c000-000000000001',
      prioridadId: 'd0000000-0000-4000-d000-000000000002',
      cicloId,
      solicitanteId: 'user-001',
      asignadoId: null,
      fechaCierre: null,
    },
    id,
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T10:00:00Z'),
    null,
  );
}

function makeCiclo(id: string): CicloClienteEntity {
  return CicloClienteEntity.create(
    {
      cicloVigenteId: 'cv-001',
      nombre: 'Ciclo Test',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    },
    id,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const CICLO_ACTIVO_ID = 'a0000000-0000-4000-a000-000000000001';
const CICLO_HISTORICO_ID = 'a0000000-0000-4000-a000-000000000002';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ListarComprasUseCase', () => {
  let useCase: ListarComprasUseCase;

  const mockTicketCompraRepo = {
    findByTicketId: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn<Promise<TicketCompraEntity[]>, []>(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketCompraRepository>;

  const mockTicketRepo = {
    findById: vi.fn(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn<Promise<void>, [TicketEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketRepository>;

  const mockCicloRepo = {
    findById: vi.fn(),
    findActive: vi.fn<Promise<CicloClienteEntity | null>, []>(),
    findAll: vi.fn(),
    save: vi.fn(),
  } satisfies vi.Mocked<ICicloClienteRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: hay un ciclo activo (la mayoría de los tests operan "hoy").
    mockCicloRepo.findActive.mockResolvedValue(makeCiclo(CICLO_ACTIVO_ID));
    useCase = new ListarComprasUseCase(mockTicketCompraRepo, mockTicketRepo, mockCicloRepo);
  });

  it('retorna Result.ok con lista vacía cuando no hay compras en el ciclo activo', async () => {
    mockTicketCompraRepo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(0);
    expect(mockTicketCompraRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('retorna Result.ok con la lista de pares {ticket, ticketCompra} del ciclo activo', async () => {
    const tc1 = makeTicketCompra('tc-001', 'ticket-001');
    const tc2 = makeTicketCompra('tc-002', 'ticket-002');
    const t1 = makeTicket('ticket-001', 'COM-2026-00001', CICLO_ACTIVO_ID);
    const t2 = makeTicket('ticket-002', 'COM-2026-00002', CICLO_ACTIVO_ID);

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
    const t1 = makeTicket('ticket-001', 'COM-2026-00001', CICLO_ACTIVO_ID);

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
    const t1 = makeTicket('ticket-001', 'COM-2026-00001', CICLO_ACTIVO_ID);

    mockTicketCompraRepo.findAll.mockResolvedValue([tc1]);
    mockTicketRepo.findById.mockResolvedValue(t1);

    await useCase.execute();

    expect(mockTicketRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockTicketRepo.findById).toHaveBeenCalledWith('ticket-001');
  });

  // ─── Filtrado por ciclo (Fase 4, ADR-5) ───────────────────────────────────────

  describe('filtrado por ciclo', () => {
    it('sin cicloId, usa el ciclo ACTIVO del tenant y excluye tickets de otros ciclos', async () => {
      const tcActivo = makeTicketCompra('tc-001', 'ticket-001');
      const tcOtro = makeTicketCompra('tc-002', 'ticket-002');
      const tActivo = makeTicket('ticket-001', 'COM-2026-00001', CICLO_ACTIVO_ID);
      const tOtro = makeTicket('ticket-002', 'COM-2026-00002', CICLO_HISTORICO_ID);

      mockTicketCompraRepo.findAll.mockResolvedValue([tcActivo, tcOtro]);
      mockTicketRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'ticket-001') return tActivo;
        if (id === 'ticket-002') return tOtro;
        return null;
      });

      const result = await useCase.execute();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(1);
      expect(result.getValue()[0].ticket.id).toBe('ticket-001');
      expect(mockCicloRepo.findActive).toHaveBeenCalledTimes(1);
    });

    it('con cicloId explícito (histórico), filtra por ese ciclo e ignora el activo', async () => {
      const tcActivo = makeTicketCompra('tc-001', 'ticket-001');
      const tcHistorico = makeTicketCompra('tc-002', 'ticket-002');
      const tActivo = makeTicket('ticket-001', 'COM-2026-00001', CICLO_ACTIVO_ID);
      const tHistorico = makeTicket('ticket-002', 'COM-2025-00099', CICLO_HISTORICO_ID);

      mockTicketCompraRepo.findAll.mockResolvedValue([tcActivo, tcHistorico]);
      mockTicketRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'ticket-001') return tActivo;
        if (id === 'ticket-002') return tHistorico;
        return null;
      });

      const result = await useCase.execute(CICLO_HISTORICO_ID);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(1);
      expect(result.getValue()[0].ticket.id).toBe('ticket-002');
      // No debería consultar el ciclo activo: el cicloId explícito ya resuelve cicloEfectivo.
      expect(mockCicloRepo.findActive).not.toHaveBeenCalled();
    });

    it('sin ciclo activo ni cicloId explícito, retorna [] sin llamar findAll', async () => {
      mockCicloRepo.findActive.mockResolvedValue(null);

      const result = await useCase.execute();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual([]);
      expect(mockTicketCompraRepo.findAll).not.toHaveBeenCalled();
    });
  });
});
