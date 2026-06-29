/**
 * Unit tests para ObtenerTicketUseCase.
 *
 * Verifica:
 * - Delega a ITicketRepository.findById.
 * - Retorna Result.ok(ticket) cuando existe y no está borrado.
 * - Retorna Result.fail(TicketNoEncontradoError) cuando no existe.
 * - Retorna Result.fail(TicketNoEncontradoError) cuando está soft-deleted (WARNING-1 fix).
 *
 * Tarea: 3.E.2 + fix WARNING-1 verify PR-11
 */
import { ObtenerTicketUseCase } from './obtener-ticket.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TICKET_ID = 'ticket-uuid-001';
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
  fechaCierre: null,
};

function makeTicket(deletedAt: Date | null = null): TicketEntity {
  return TicketEntity.reconstitute(baseProps, TICKET_ID, new Date(), new Date(), deletedAt);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ObtenerTicketUseCase', () => {
  let useCase: ObtenerTicketUseCase;
  const mockTicketRepo = {
    findById: vi.fn<Promise<TicketEntity | null>, [string]>(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ObtenerTicketUseCase(mockTicketRepo);
  });

  it('retorna Result.ok con el ticket cuando existe y no está borrado', async () => {
    mockTicketRepo.findById.mockResolvedValue(makeTicket());

    const result = await useCase.execute(TICKET_ID);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().id).toBe(TICKET_ID);
    expect(mockTicketRepo.findById).toHaveBeenCalledWith(TICKET_ID);
  });

  it('retorna TicketNoEncontradoError cuando el ticket no existe', async () => {
    mockTicketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(TICKET_ID);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
  });

  it('retorna TicketNoEncontradoError cuando el ticket está soft-deleted', async () => {
    // WARNING-1: soft-deleted tickets must be treated as not found
    mockTicketRepo.findById.mockResolvedValue(makeTicket(new Date()));

    const result = await useCase.execute(TICKET_ID);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
  });
});
