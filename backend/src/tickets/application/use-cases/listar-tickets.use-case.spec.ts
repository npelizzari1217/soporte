/**
 * Unit tests para ListarTicketsUseCase.
 *
 * Fase 4 (ciclos-master-tenant, ADR-5): el use case deja de ser "puro" respecto
 * de filtros — ahora inyecta ICicloClienteRepository (tickets-side) y resuelve
 * el ciclo EFECTIVO: filtros.cicloId (histórico) ?? ciclo activo del tenant.
 * Sin cicloId explícito y sin ciclo activo → lista vacía (invariante: "siempre
 * por ciclo", nunca "todos").
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-5
 * Tarea: 2.7/2.8 (Fase 4, PR2)
 */
import { ListarTicketsUseCase } from './listar-tickets.use-case';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIPO_TICKET_ID = 'e0000000-0000-4000-e000-000000000001';
const ESTADO_ID = 'c0000000-0000-4000-c000-000000000001';
const CICLO_ACTIVO_ID = 'a0000000-0000-4000-a000-000000000001';

const baseProps: TicketProps = {
  numero: 'SOP-2026-00001',
  titulo: 'Ticket de prueba',
  descripcion: null,
  tipoId: TIPO_TICKET_ID,
  estadoId: ESTADO_ID,
  prioridadId: 'd0000000-0000-4000-d000-000000000002',
  cicloId: null,
  solicitanteId: 'user-solicitante-001',
  asignadoId: null,
  fechaCierre: null,
};

function makeTicket(id: string, numero: string): TicketEntity {
  return TicketEntity.reconstitute(
    { ...baseProps, numero },
    id,
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T10:00:00Z'),
    null,
  );
}

function makeCicloActivo(id: string = CICLO_ACTIVO_ID): CicloClienteEntity {
  return CicloClienteEntity.reconstitute(
    {
      cicloVigenteId: 'cv-001',
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    },
    id,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    null,
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ListarTicketsUseCase', () => {
  let useCase: ListarTicketsUseCase;
  const mockTicketRepo = {
    findById: vi.fn(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findByEstado: vi.fn(),
    findAll: vi.fn<Promise<TicketEntity[]>, [TicketFiltros?]>(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketRepository>;

  const mockCicloClienteRepo = {
    findById: vi.fn(),
    findActive: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
  } satisfies vi.Mocked<ICicloClienteRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCicloClienteRepo.findActive.mockResolvedValue(makeCicloActivo());
    useCase = new ListarTicketsUseCase(mockTicketRepo, mockCicloClienteRepo);
  });

  // ─── Resolución de ciclo efectivo (ADR-5, T2.7/T2.8) ─────────────────────

  describe('resolución del ciclo efectivo (default=activo, histórico, sin ninguno)', () => {
    it('sin cicloId en filtros → resuelve el ciclo activo y filtra por él', async () => {
      mockTicketRepo.findAll.mockResolvedValue([]);

      await useCase.execute();

      expect(mockCicloClienteRepo.findActive).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ cicloId: CICLO_ACTIVO_ID }),
      );
    });

    it('con cicloId explícito en filtros (histórico) → usa ese cicloId sin consultar el activo', async () => {
      mockTicketRepo.findAll.mockResolvedValue([]);

      await useCase.execute({ cicloId: 'ciclo-historico-001' });

      expect(mockCicloClienteRepo.findActive).not.toHaveBeenCalled();
      expect(mockTicketRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ cicloId: 'ciclo-historico-001' }),
      );
    });

    it('sin cicloId en filtros y sin ciclo activo → retorna [] sin llamar findAll', async () => {
      mockCicloClienteRepo.findActive.mockResolvedValue(null);

      const result = await useCase.execute();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual([]);
      expect(mockTicketRepo.findAll).not.toHaveBeenCalled();
    });

    it('preserva el resto de los filtros (tiposIds) junto con el cicloId resuelto', async () => {
      mockTicketRepo.findAll.mockResolvedValue([]);
      const uuid = 'e0000000-0000-4000-e000-000000000001';

      await useCase.execute({ tiposIds: [uuid] });

      expect(mockTicketRepo.findAll).toHaveBeenCalledWith({
        tiposIds: [uuid],
        cicloId: CICLO_ACTIVO_ID,
      });
    });
  });

  // ─── Tests existentes (adaptados a la resolución de ciclo, ADR-5) ─────────

  it('retorna Result.ok con la lista de tickets del tenant (ciclo activo resuelto)', async () => {
    const tickets = [
      makeTicket('ticket-uuid-001', 'SOP-2026-00002'),
      makeTicket('ticket-uuid-002', 'SOP-2026-00001'),
    ];
    mockTicketRepo.findAll.mockResolvedValue(tickets);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(2);
    expect(result.getValue()[0].id).toBe('ticket-uuid-001');
    expect(mockTicketRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('retorna Result.ok con lista vacía cuando no hay tickets en el ciclo activo', async () => {
    mockTicketRepo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(0);
    expect(mockTicketRepo.findAll).toHaveBeenCalledTimes(1);
  });
});
