import { CrearSubtareaUseCase, CrearSubtareaDto } from './crear-subtarea.use-case';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTicketEdilicia(id: string, porcentajeAvance: number): TicketEdiliciaEntity {
  return TicketEdiliciaEntity.reconstitute(
    {
      ticketId: 'ticket-001',
      ubicacionId: 'ubicacion-001',
      personalAsignadoId: null,
      porcentajeAvance,
    },
    id,
    new Date(),
    new Date(),
    null,
  );
}

function makeSubtarea(
  id: string,
  ticketEdiliciaId: string,
  completada: boolean,
  deletedAt: Date | null = null,
): SubtareaEdiliciaEntity {
  return SubtareaEdiliciaEntity.reconstitute(
    {
      ticketEdiliciaId,
      descripcion: 'Subtarea de prueba',
      completada,
      completadaEn: completada ? new Date() : null,
      completadaPorId: completada ? 'user-001' : null,
      orden: 0,
    },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const TICKET_EDILICIA_ID = 'te000000-0000-4000-0000-000000000001';
const TIPO_OPERACION_AVANCE_ID = 'fo000000-0000-4000-f000-000000000002';
const AUTOR_ID = 'user-autor-001';

const validDto: CrearSubtareaDto = {
  ticketEdiliciaId: TICKET_EDILICIA_ID,
  descripcion: 'Reparar grieta en pared norte',
  orden: 1,
  autorId: AUTOR_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('CrearSubtareaUseCase', () => {
  let useCase: CrearSubtareaUseCase;

  const mockTicketEdiliciaRepo = {
    findByTicketId: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    findByUbicacionId: vi.fn(),
    save: vi.fn<Promise<void>, [TicketEdiliciaEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketEdiliciaRepository>;

  const mockSubtareaRepo = {
    findById: vi.fn(),
    findActiveByTicketEdiliciaId: vi.fn(),
    findAllByTicketEdiliciaId: vi.fn(),
    save: vi.fn<Promise<void>, [SubtareaEdiliciaEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ISubtareaEdiliciaRepository>;

  const mockOperacionRepo = {
    findByTicketId: vi.fn(),
    save: vi.fn<Promise<void>, [OperacionTicketEntity]>(),
  } satisfies vi.Mocked<IOperacionTicketRepository>;

  const mockTipoOperacionRepo = {
    findIdByCodigo: vi.fn<Promise<string | null>, [string]>(),
  } satisfies vi.Mocked<ITipoOperacionRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Happy-path mocks
    mockTicketEdiliciaRepo.findById.mockResolvedValue(makeTicketEdilicia(TICKET_EDILICIA_ID, 0));
    mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([]);
    mockSubtareaRepo.save.mockResolvedValue(undefined);
    mockTicketEdiliciaRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_AVANCE_ID);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new CrearSubtareaUseCase(
      mockTicketEdiliciaRepo,
      mockSubtareaRepo,
      mockOperacionRepo,
      mockTipoOperacionRepo,
      mockTxRunner,
    );
  });

  // ─── Validaciones de ticketEdilicia ──────────────────────────────────────

  describe('validación de ticketEdilicia', () => {
    it('retorna fallo cuando el ticket_edilicia no existe', async () => {
      mockTicketEdiliciaRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_EDILICIA_NO_ENCONTRADO');
    });

    it('retorna fallo cuando el ticket_edilicia fue soft-deleted', async () => {
      const deletedEdilicia = TicketEdiliciaEntity.reconstitute(
        {
          ticketId: 'ticket-001',
          ubicacionId: 'ubicacion-001',
          personalAsignadoId: null,
          porcentajeAvance: 0,
        },
        TICKET_EDILICIA_ID,
        new Date(),
        new Date(),
        new Date(), // deletedAt set
      );
      mockTicketEdiliciaRepo.findById.mockResolvedValue(deletedEdilicia);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_EDILICIA_NO_ENCONTRADO');
    });

    it('no persiste nada cuando el ticket_edilicia no existe', async () => {
      mockTicketEdiliciaRepo.findById.mockResolvedValue(null);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockSubtareaRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Creación de subtarea ─────────────────────────────────────────────────

  describe('creación de subtarea', () => {
    it('guarda la nueva subtarea con completada=false', async () => {
      let savedSubtarea: SubtareaEdiliciaEntity | undefined;
      mockSubtareaRepo.save.mockImplementation(async (s) => {
        savedSubtarea = s;
      });

      await useCase.execute(validDto);

      expect(savedSubtarea).toBeDefined();
      expect(savedSubtarea!.completada).toBe(false);
    });

    it('guarda la nueva subtarea con la descripcion del DTO', async () => {
      let savedSubtarea: SubtareaEdiliciaEntity | undefined;
      mockSubtareaRepo.save.mockImplementation(async (s) => {
        savedSubtarea = s;
      });

      await useCase.execute(validDto);

      expect(savedSubtarea!.descripcion).toBe('Reparar grieta en pared norte');
    });

    it('guarda la nueva subtarea con el ticketEdiliciaId correcto', async () => {
      let savedSubtarea: SubtareaEdiliciaEntity | undefined;
      mockSubtareaRepo.save.mockImplementation(async (s) => {
        savedSubtarea = s;
      });

      await useCase.execute(validDto);

      expect(savedSubtarea!.ticketEdiliciaId).toBe(TICKET_EDILICIA_ID);
    });
  });

  // ─── Recálculo de avance ──────────────────────────────────────────────────

  describe('recálculo de porcentajeAvance', () => {
    it('recalcula el avance incluyendo la nueva subtarea (no completada)', async () => {
      // 1 subtarea completada existente → al agregar la nueva: 1/2 = 50%
      const existente = makeSubtarea('sub-existente', TICKET_EDILICIA_ID, true);
      mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([existente]);

      let savedEdilicia: TicketEdiliciaEntity | undefined;
      mockTicketEdiliciaRepo.save.mockImplementation(async (e) => {
        savedEdilicia = e;
      });

      await useCase.execute(validDto);

      // 1 completada de 2 activas = 50%
      expect(savedEdilicia!.porcentajeAvance).toBe(50);
    });

    it('cuando no hay subtareas existentes y se agrega una nueva: avance = 0', async () => {
      mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([]);

      let savedEdilicia: TicketEdiliciaEntity | undefined;
      mockTicketEdiliciaRepo.save.mockImplementation(async (e) => {
        savedEdilicia = e;
      });

      await useCase.execute(validDto);

      // 0 completadas de 1 activa = 0%
      expect(savedEdilicia!.porcentajeAvance).toBe(0);
    });

    it('actualiza el ticket_edilicia con el nuevo avance dentro de la tx', async () => {
      await useCase.execute(validDto);

      expect(mockTicketEdiliciaRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Registro AVANCE_EDILICIO ─────────────────────────────────────────────

  describe('registro de AVANCE_EDILICIO en operaciones_ticket', () => {
    it('registra una operacion AVANCE_EDILICIO en la misma tx', async () => {
      await useCase.execute(validDto);

      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('la operacion tiene metadata con porcentaje_anterior y porcentaje_nuevo', async () => {
      const edilicia = makeTicketEdilicia(TICKET_EDILICIA_ID, 25);
      mockTicketEdiliciaRepo.findById.mockResolvedValue(edilicia);
      // 1 completada de 1 existente → + nueva (no completada) = 1/2 = 50%
      const existente = makeSubtarea('sub-existente', TICKET_EDILICIA_ID, true);
      mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([existente]);

      let savedOperacion: OperacionTicketEntity | undefined;
      mockOperacionRepo.save.mockImplementation(async (o) => {
        savedOperacion = o;
      });

      await useCase.execute(validDto);

      expect(savedOperacion!.metadata).toEqual({
        porcentaje_anterior: 25,
        porcentaje_nuevo: 50,
      });
    });

    it('la operacion usa el tipo AVANCE_EDILICIO', async () => {
      let savedOperacion: OperacionTicketEntity | undefined;
      mockOperacionRepo.save.mockImplementation(async (o) => {
        savedOperacion = o;
      });

      await useCase.execute(validDto);

      expect(mockTipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('AVANCE_EDILICIO');
      expect(savedOperacion!.tipoOperacionId).toBe(TIPO_OPERACION_AVANCE_ID);
    });

    it('la operacion tiene el ticketId del ticket base del edilicia', async () => {
      const edilicia = makeTicketEdilicia(TICKET_EDILICIA_ID, 0);
      mockTicketEdiliciaRepo.findById.mockResolvedValue(edilicia);

      let savedOperacion: OperacionTicketEntity | undefined;
      mockOperacionRepo.save.mockImplementation(async (o) => {
        savedOperacion = o;
      });

      await useCase.execute(validDto);

      expect(savedOperacion!.ticketId).toBe('ticket-001');
    });

    it('retorna fallo cuando el tipo AVANCE_EDILICIO no existe en catálogo', async () => {
      mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_OPERACION_NO_ENCONTRADO');
    });
  });

  // ─── Atomicidad (dentro del txRunner) ────────────────────────────────────

  describe('atomicidad de la transacción', () => {
    it('subtarea, ticket_edilicia y operacion se guardan dentro del runner', async () => {
      const callOrder: string[] = [];

      (mockTxRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      mockSubtareaRepo.save.mockImplementation(() => {
        callOrder.push('subtarea:save');
        return Promise.resolve();
      });
      mockTicketEdiliciaRepo.save.mockImplementation(() => {
        callOrder.push('edilicia:save');
        return Promise.resolve();
      });
      mockOperacionRepo.save.mockImplementation(() => {
        callOrder.push('operacion:save');
        return Promise.resolve();
      });

      await useCase.execute(validDto);

      const txStart = callOrder.indexOf('tx:start');
      const txEnd = callOrder.indexOf('tx:end');

      expect(txStart).toBeLessThan(callOrder.indexOf('subtarea:save'));
      expect(txStart).toBeLessThan(callOrder.indexOf('edilicia:save'));
      expect(txStart).toBeLessThan(callOrder.indexOf('operacion:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('subtarea:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('edilicia:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('operacion:save'));
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con la subtarea creada', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('la subtarea retornada tiene UUIDv7', async () => {
      const result = await useCase.execute(validDto);

      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.getValue().id).toMatch(uuidV7Pattern);
    });
  });
});
