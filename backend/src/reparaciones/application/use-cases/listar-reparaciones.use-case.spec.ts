/**
 * Unit tests para ListarReparacionesUseCase.
 *
 * Verifica:
 * - Delega a ITicketEdiliciaRepository.findAll para obtener los satélites.
 * - Para cada satélite, llama a ITicketRepository.findById con el ticketId.
 * - Para cada satélite, llama a IUbicacionRepository.findById con el ubicacionId.
 * - Retorna Result.ok con la lista de ReparacionListItemResponseDto.
 * - ubicacionNombre es null cuando la ubicacion no se encuentra.
 * - Omite entradas donde el ticket base no existe (registros huérfanos).
 * - Retorna Result.ok con lista vacía cuando no hay reparaciones.
 *
 * Tarea: feat/tickets-list-mvp
 */
import { ListarReparacionesUseCase } from './listar-reparaciones.use-case';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { ICicloClienteRepository } from '../../../tickets/domain/ports/i-ciclo-cliente.repository';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEdilicia(
  id: string,
  ticketId: string,
  ubicacionId: string,
  avance = 50,
): TicketEdiliciaEntity {
  return TicketEdiliciaEntity.reconstitute(
    { ticketId, ubicacionId, personalAsignadoId: null, porcentajeAvance: avance },
    id,
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T10:00:00Z'),
    null,
  );
}

function makeTicket(id: string, numero: string, cicloId: string | null = null): TicketEntity {
  return TicketEntity.reconstitute(
    {
      numero,
      titulo: 'Reparar grieta',
      descripcion: null,
      tipoId: 'e0000000-0000-4000-e000-000000000003',
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

function makeCicloActivo(id: string): CicloClienteEntity {
  return CicloClienteEntity.reconstitute(
    {
      cicloVigenteId: 'cv-1',
      nombre: 'Ciclo activo',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    },
    id,
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T10:00:00Z'),
    null,
  );
}

function makeUbicacion(id: string, nombre: string): UbicacionEntity {
  return UbicacionEntity.reconstitute(
    { nombre, descripcion: null, padreId: null, activo: true },
    id,
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T10:00:00Z'),
    null,
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ListarReparacionesUseCase', () => {
  let useCase: ListarReparacionesUseCase;

  const mockEdiliciaRepo = {
    findByTicketId: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn<Promise<TicketEdiliciaEntity[]>, []>(),
    findByUbicacionId: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketEdiliciaRepository>;

  const mockTicketRepo = {
    findById: vi.fn(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn<Promise<void>, [TicketEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketRepository>;

  const mockUbicacionRepo = {
    findById: vi.fn(),
    findAllActive: vi.fn(),
    findSubtree: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IUbicacionRepository>;

  const mockCicloRepo = {
    findById: vi.fn(),
    findActive: vi.fn<Promise<CicloClienteEntity | null>, []>(),
    findAll: vi.fn(),
    save: vi.fn(),
  } satisfies vi.Mocked<ICicloClienteRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ListarReparacionesUseCase(
      mockEdiliciaRepo,
      mockTicketRepo,
      mockUbicacionRepo,
      mockCicloRepo,
    );
  });

  it('retorna Result.ok con lista vacía cuando no hay reparaciones (con ciclo activo)', async () => {
    mockCicloRepo.findActive.mockResolvedValue(makeCicloActivo('ciclo-activo-id'));
    mockEdiliciaRepo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(0);
    expect(mockEdiliciaRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('retorna Result.ok con el DTO completo para cada reparación del ciclo activo (default)', async () => {
    mockCicloRepo.findActive.mockResolvedValue(makeCicloActivo('ciclo-activo-id'));
    const edilicia = makeEdilicia('ed-001', 'ticket-001', 'ub-001', 75);
    const ticket = makeTicket('ticket-001', 'EDI-2026-00001', 'ciclo-activo-id');
    const ubicacion = makeUbicacion('ub-001', 'Piso 3');

    mockEdiliciaRepo.findAll.mockResolvedValue([edilicia]);
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockUbicacionRepo.findById.mockResolvedValue(ubicacion);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    const item = result.getValue()[0];
    expect(item.id).toBe('ed-001');
    expect(item.ticketId).toBe('ticket-001');
    expect(item.numero).toBe('EDI-2026-00001');
    expect(item.titulo).toBe('Reparar grieta');
    expect(item.estadoId).toBe('c0000000-0000-4000-c000-000000000001');
    expect(item.ubicacionId).toBe('ub-001');
    expect(item.ubicacionNombre).toBe('Piso 3');
    expect(item.porcentajeAvance).toBe(75);
  });

  it('pone ubicacionNombre como null cuando la ubicacion no se encuentra', async () => {
    mockCicloRepo.findActive.mockResolvedValue(makeCicloActivo('ciclo-activo-id'));
    const edilicia = makeEdilicia('ed-001', 'ticket-001', 'ub-999');
    const ticket = makeTicket('ticket-001', 'EDI-2026-00001', 'ciclo-activo-id');

    mockEdiliciaRepo.findAll.mockResolvedValue([edilicia]);
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockUbicacionRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()[0].ubicacionNombre).toBeNull();
  });

  it('omite entradas donde el ticket base no existe (registros huérfanos)', async () => {
    mockCicloRepo.findActive.mockResolvedValue(makeCicloActivo('ciclo-activo-id'));
    const ed1 = makeEdilicia('ed-001', 'ticket-001', 'ub-001');
    const ed2 = makeEdilicia('ed-002', 'ticket-999', 'ub-001'); // huérfano
    const ticket1 = makeTicket('ticket-001', 'EDI-2026-00001', 'ciclo-activo-id');

    mockEdiliciaRepo.findAll.mockResolvedValue([ed1, ed2]);
    mockTicketRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'ticket-001') return ticket1;
      return null;
    });
    mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion('ub-001', 'Edificio A'));

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(1);
    expect(result.getValue()[0].id).toBe('ed-001');
  });

  it('llama findById en ticketRepo y ubicacionRepo con los ids correctos', async () => {
    mockCicloRepo.findActive.mockResolvedValue(makeCicloActivo('ciclo-activo-id'));
    const edilicia = makeEdilicia('ed-001', 'ticket-001', 'ub-001');
    const ticket = makeTicket('ticket-001', 'EDI-2026-00001', 'ciclo-activo-id');
    const ubicacion = makeUbicacion('ub-001', 'Sala de servidores');

    mockEdiliciaRepo.findAll.mockResolvedValue([edilicia]);
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockUbicacionRepo.findById.mockResolvedValue(ubicacion);

    await useCase.execute();

    expect(mockTicketRepo.findById).toHaveBeenCalledWith('ticket-001');
    expect(mockUbicacionRepo.findById).toHaveBeenCalledWith('ub-001');
  });

  // ─── Filtro por ciclo (Fase 4, ciclos-master-tenant, ADR-5) ───────────────

  describe('filtro por ciclo', () => {
    it('sin cicloId y sin ciclo activo → Result.ok([]) sin llamar findAll', async () => {
      mockCicloRepo.findActive.mockResolvedValue(null);

      const result = await useCase.execute();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual([]);
      expect(mockEdiliciaRepo.findAll).not.toHaveBeenCalled();
    });

    it('con cicloId explícito (histórico) filtra por ese ciclo, ignorando el activo', async () => {
      mockCicloRepo.findActive.mockResolvedValue(makeCicloActivo('ciclo-activo-id'));
      const edHist = makeEdilicia('ed-hist', 'ticket-hist', 'ub-001');
      const edActivo = makeEdilicia('ed-activo', 'ticket-activo', 'ub-001');
      const ticketHist = makeTicket('ticket-hist', 'EDI-2025-00001', 'ciclo-historico-id');
      const ticketActivo = makeTicket('ticket-activo', 'EDI-2026-00001', 'ciclo-activo-id');

      mockEdiliciaRepo.findAll.mockResolvedValue([edHist, edActivo]);
      mockTicketRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'ticket-hist') return ticketHist;
        if (id === 'ticket-activo') return ticketActivo;
        return null;
      });
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion('ub-001', 'Edificio A'));

      const result = await useCase.execute('ciclo-historico-id');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(1);
      expect(result.getValue()[0].id).toBe('ed-hist');
      expect(mockCicloRepo.findActive).not.toHaveBeenCalled();
    });

    it('sin cicloId usa el ciclo activo como filtro por defecto', async () => {
      mockCicloRepo.findActive.mockResolvedValue(makeCicloActivo('ciclo-activo-id'));
      const edActivo = makeEdilicia('ed-activo', 'ticket-activo', 'ub-001');
      const edOtro = makeEdilicia('ed-otro', 'ticket-otro', 'ub-001');
      const ticketActivo = makeTicket('ticket-activo', 'EDI-2026-00001', 'ciclo-activo-id');
      const ticketOtro = makeTicket('ticket-otro', 'EDI-2025-00001', 'ciclo-otro-id');

      mockEdiliciaRepo.findAll.mockResolvedValue([edActivo, edOtro]);
      mockTicketRepo.findById.mockImplementation(async (id: string) => {
        if (id === 'ticket-activo') return ticketActivo;
        if (id === 'ticket-otro') return ticketOtro;
        return null;
      });
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion('ub-001', 'Edificio A'));

      const result = await useCase.execute();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(1);
      expect(result.getValue()[0].id).toBe('ed-activo');
    });
  });
});
