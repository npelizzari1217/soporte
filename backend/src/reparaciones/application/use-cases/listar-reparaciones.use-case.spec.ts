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
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';

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

function makeTicket(id: string, numero: string): TicketEntity {
  return TicketEntity.reconstitute(
    {
      numero,
      titulo: 'Reparar grieta',
      descripcion: null,
      tipoId: 'e0000000-0000-4000-e000-000000000003',
      estadoId: 'c0000000-0000-4000-c000-000000000001',
      prioridadId: 'd0000000-0000-4000-d000-000000000002',
      cicloId: null,
      solicitanteId: 'user-001',
      asignadoId: null,
      fechaResolucion: null,
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
    findByTicketId: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn<Promise<TicketEdiliciaEntity[]>, []>(),
    findByUbicacionId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketEdiliciaRepository>;

  const mockTicketRepo = {
    findById: jest.fn(),
    findByNumero: jest.fn(),
    findLastSecuencia: jest.fn(),
    findAll: jest.fn(),
    findByEstado: jest.fn(),
    save: jest.fn<Promise<void>, [TicketEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketRepository>;

  const mockUbicacionRepo = {
    findById: jest.fn(),
    findAllActive: jest.fn(),
    findSubtree: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } satisfies jest.Mocked<IUbicacionRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ListarReparacionesUseCase(mockEdiliciaRepo, mockTicketRepo, mockUbicacionRepo);
  });

  it('retorna Result.ok con lista vacía cuando no hay reparaciones', async () => {
    mockEdiliciaRepo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(0);
    expect(mockEdiliciaRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('retorna Result.ok con el DTO completo para cada reparación', async () => {
    const edilicia = makeEdilicia('ed-001', 'ticket-001', 'ub-001', 75);
    const ticket = makeTicket('ticket-001', 'EDI-2026-00001');
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
    const edilicia = makeEdilicia('ed-001', 'ticket-001', 'ub-999');
    const ticket = makeTicket('ticket-001', 'EDI-2026-00001');

    mockEdiliciaRepo.findAll.mockResolvedValue([edilicia]);
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockUbicacionRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()[0].ubicacionNombre).toBeNull();
  });

  it('omite entradas donde el ticket base no existe (registros huérfanos)', async () => {
    const ed1 = makeEdilicia('ed-001', 'ticket-001', 'ub-001');
    const ed2 = makeEdilicia('ed-002', 'ticket-999', 'ub-001'); // huérfano
    const ticket1 = makeTicket('ticket-001', 'EDI-2026-00001');

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
    const edilicia = makeEdilicia('ed-001', 'ticket-001', 'ub-001');
    const ticket = makeTicket('ticket-001', 'EDI-2026-00001');
    const ubicacion = makeUbicacion('ub-001', 'Sala de servidores');

    mockEdiliciaRepo.findAll.mockResolvedValue([edilicia]);
    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockUbicacionRepo.findById.mockResolvedValue(ubicacion);

    await useCase.execute();

    expect(mockTicketRepo.findById).toHaveBeenCalledWith('ticket-001');
    expect(mockUbicacionRepo.findById).toHaveBeenCalledWith('ub-001');
  });
});
