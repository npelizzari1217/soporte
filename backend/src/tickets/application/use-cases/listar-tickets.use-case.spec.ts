/**
 * Unit tests para ListarTicketsUseCase.
 *
 * Verifica:
 * - Delega a ITicketRepository.findAll.
 * - Retorna Result.ok con la lista de tickets del tenant.
 * - Retorna Result.ok con lista vacía cuando no hay tickets.
 *
 * Tarea: feat/tickets-list-mvp
 */
import { ListarTicketsUseCase } from './listar-tickets.use-case';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIPO_TICKET_ID = 'e0000000-0000-4000-e000-000000000001';
const ESTADO_ID = 'c0000000-0000-4000-c000-000000000001';

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
  fechaVencimiento: null,
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

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ListarTicketsUseCase', () => {
  let useCase: ListarTicketsUseCase;
  const mockTicketRepo = {
    findById: jest.fn(),
    findByNumero: jest.fn(),
    findLastSecuencia: jest.fn(),
    findByEstado: jest.fn(),
    findAll: jest.fn<Promise<TicketEntity[]>, [TicketFiltros?]>(),
    save: jest.fn(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ListarTicketsUseCase(mockTicketRepo);
  });

  // ─── Filtros pass-through (T1.2 RED) ─────────────────────────────────────

  it('propaga tiposIds al repo cuando se pasan filtros con tiposIds', async () => {
    const uuid = 'e0000000-0000-4000-e000-000000000001';
    mockTicketRepo.findAll.mockResolvedValue([]);

    await useCase.execute({ tiposIds: [uuid] });

    expect(mockTicketRepo.findAll).toHaveBeenCalledWith({ tiposIds: [uuid] });
  });

  it('propaga filtros vacíos al repo cuando se llama execute({})', async () => {
    mockTicketRepo.findAll.mockResolvedValue([]);

    await useCase.execute({});

    expect(mockTicketRepo.findAll).toHaveBeenCalledWith({});
  });

  it('llama findAll con undefined cuando execute() se llama sin argumentos', async () => {
    mockTicketRepo.findAll.mockResolvedValue([]);

    await useCase.execute();

    // Sin args, el use case pasa undefined (o {} — ambos son aceptables per spec)
    expect(mockTicketRepo.findAll).toHaveBeenCalledTimes(1);
  });

  it('NO inyecta ICicloClienteRepository — el use case permanece puro', () => {
    // El constructor debe tener exactamente 1 parámetro (ITicketRepository)
    expect(ListarTicketsUseCase.length).toBe(1);
  });

  // ─── Tests existentes ─────────────────────────────────────────────────────

  it('retorna Result.ok con la lista de tickets del tenant', async () => {
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

  it('retorna Result.ok con lista vacía cuando no hay tickets en el tenant', async () => {
    mockTicketRepo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(0);
    expect(mockTicketRepo.findAll).toHaveBeenCalledTimes(1);
  });
});
