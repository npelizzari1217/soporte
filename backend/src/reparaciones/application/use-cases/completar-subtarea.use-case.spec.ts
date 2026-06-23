import { CompletarSubtareaUseCase, CompletarSubtareaDto } from './completar-subtarea.use-case';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTicketEdilicia(
  id: string,
  ticketId: string,
  porcentajeAvance: number,
): TicketEdiliciaEntity {
  return TicketEdiliciaEntity.reconstitute(
    { ticketId, ubicacionId: 'ubicacion-001', personalAsignadoId: null, porcentajeAvance },
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
      completadaPorId: completada ? 'user-completo-001' : null,
      orden: 0,
    },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const SUBTAREA_ID = 'sb000000-0000-4000-0000-000000000001';
const TICKET_EDILICIA_ID = 'te000000-0000-4000-0000-000000000001';
const TICKET_ID = 'ticket-base-001';
const TIPO_OPERACION_AVANCE_ID = 'fo000000-0000-4000-f000-000000000002';
const COMPLETADA_POR_ID = 'user-mantenimiento-001';
const AUTOR_ID = 'user-autor-001';

const validDto: CompletarSubtareaDto = {
  subtareaId: SUBTAREA_ID,
  completadaPorId: COMPLETADA_POR_ID,
  autorId: AUTOR_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('CompletarSubtareaUseCase', () => {
  let useCase: CompletarSubtareaUseCase;

  const mockSubtareaRepo = {
    findById: jest.fn(),
    findActiveByTicketEdiliciaId: jest.fn(),
    findAllByTicketEdiliciaId: jest.fn(),
    save: jest.fn<Promise<void>, [SubtareaEdiliciaEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ISubtareaEdiliciaRepository>;

  const mockTicketEdiliciaRepo = {
    findByTicketId: jest.fn(),
    findById: jest.fn(),
    findByUbicacionId: jest.fn(),
    save: jest.fn<Promise<void>, [TicketEdiliciaEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketEdiliciaRepository>;

  const mockOperacionRepo = {
    findByTicketId: jest.fn(),
    save: jest.fn<Promise<void>, [OperacionTicketEntity]>(),
  } satisfies jest.Mocked<IOperacionTicketRepository>;

  const mockTipoOperacionRepo = {
    findIdByCodigo: jest.fn<Promise<string | null>, [string]>(),
  } satisfies jest.Mocked<ITipoOperacionRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: una subtarea pendiente que vamos a completar
    const subtarea = makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, false);
    mockSubtareaRepo.findById.mockResolvedValue(subtarea);
    mockTicketEdiliciaRepo.findById.mockResolvedValue(
      makeTicketEdilicia(TICKET_EDILICIA_ID, TICKET_ID, 0),
    );
    // Una sola subtarea activa (la que vamos a completar)
    mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([subtarea]);
    mockSubtareaRepo.save.mockResolvedValue(undefined);
    mockTicketEdiliciaRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_AVANCE_ID);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new CompletarSubtareaUseCase(
      mockSubtareaRepo,
      mockTicketEdiliciaRepo,
      mockOperacionRepo,
      mockTipoOperacionRepo,
      mockTxRunner,
    );
  });

  // ─── Validaciones de subtarea ─────────────────────────────────────────────

  describe('validación de subtarea', () => {
    it('retorna fallo cuando la subtarea no existe', async () => {
      mockSubtareaRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SUBTAREA_EDILICIA_NO_ENCONTRADA');
    });

    it('retorna fallo cuando la subtarea fue soft-deleted', async () => {
      mockSubtareaRepo.findById.mockResolvedValue(
        makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, false, new Date()),
      );

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SUBTAREA_EDILICIA_NO_ENCONTRADA');
    });

    it('retorna fallo cuando la subtarea ya está completada', async () => {
      mockSubtareaRepo.findById.mockResolvedValue(
        makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, true),
      );

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SUBTAREA_YA_COMPLETADA');
    });

    it('no persiste nada cuando la subtarea ya está completada', async () => {
      mockSubtareaRepo.findById.mockResolvedValue(
        makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, true),
      );

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
    });
  });

  // ─── Marca la subtarea como completada ───────────────────────────────────

  describe('completitud de la subtarea', () => {
    it('la subtarea se guarda con completada = true', async () => {
      let savedSubtarea: SubtareaEdiliciaEntity | undefined;
      mockSubtareaRepo.save.mockImplementation(async (s) => {
        savedSubtarea = s;
      });

      await useCase.execute(validDto);

      expect(savedSubtarea!.completada).toBe(true);
    });

    it('la subtarea se guarda con completadaPorId del DTO', async () => {
      let savedSubtarea: SubtareaEdiliciaEntity | undefined;
      mockSubtareaRepo.save.mockImplementation(async (s) => {
        savedSubtarea = s;
      });

      await useCase.execute(validDto);

      expect(savedSubtarea!.completadaPorId).toBe(COMPLETADA_POR_ID);
    });

    it('la subtarea se guarda con completadaEn = una fecha reciente', async () => {
      let savedSubtarea: SubtareaEdiliciaEntity | undefined;
      mockSubtareaRepo.save.mockImplementation(async (s) => {
        savedSubtarea = s;
      });
      const antes = new Date();

      await useCase.execute(validDto);

      expect(savedSubtarea!.completadaEn).toBeInstanceOf(Date);
      expect(savedSubtarea!.completadaEn!.getTime()).toBeGreaterThanOrEqual(antes.getTime());
    });
  });

  // ─── Recálculo de avance ──────────────────────────────────────────────────

  describe('recálculo de porcentajeAvance', () => {
    it('cuando hay 1 subtarea y se completa: avance pasa a 100%', async () => {
      // La lista activa contiene solo la subtarea que vamos a completar
      const subtarea = makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, false);
      mockSubtareaRepo.findById.mockResolvedValue(subtarea);
      mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([subtarea]);

      let savedEdilicia: TicketEdiliciaEntity | undefined;
      mockTicketEdiliciaRepo.save.mockImplementation(async (e) => {
        savedEdilicia = e;
      });

      await useCase.execute(validDto);

      expect(savedEdilicia!.porcentajeAvance).toBe(100);
    });

    it('cuando hay 3 subtareas y se completa 1: avance pasa de 0 a 33.33%', async () => {
      const pendiente1 = makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, false);
      const pendiente2 = makeSubtarea('sub-002', TICKET_EDILICIA_ID, false);
      const pendiente3 = makeSubtarea('sub-003', TICKET_EDILICIA_ID, false);
      mockSubtareaRepo.findById.mockResolvedValue(pendiente1);
      mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([
        pendiente1,
        pendiente2,
        pendiente3,
      ]);

      let savedEdilicia: TicketEdiliciaEntity | undefined;
      mockTicketEdiliciaRepo.save.mockImplementation(async (e) => {
        savedEdilicia = e;
      });

      await useCase.execute(validDto);

      expect(savedEdilicia!.porcentajeAvance).toBe(33.33);
    });

    it('el ticket_edilicia se guarda dentro de la transacción', async () => {
      await useCase.execute(validDto);

      expect(mockTicketEdiliciaRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── NO transiciona el estado automáticamente ─────────────────────────────

  describe('sin transición automática de estado', () => {
    it('al llegar a 100% el estado del ticket NO cambia (no se llama a transición)', async () => {
      // Escenario: 1 sola subtarea → al completarla avance = 100%
      const subtarea = makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, false);
      mockSubtareaRepo.findById.mockResolvedValue(subtarea);
      mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([subtarea]);

      const result = await useCase.execute(validDto);

      // El use case retorna ok con la subtarea, nunca Result.fail por "estado cambiado"
      // y no invoca ningún estadoRepo ni ticketRepo
      expect(result.isOk()).toBe(true);
      // El repositorio de ticket principal no debe ser llamado (no hay ticketRepo en el uc)
      // La lógica se verifica implícitamente: el useCase no tiene ticketRepo — no puede cambiar estado
    });

    it('retorna Result.ok(subtarea) cuando avance llega a 100%', async () => {
      const subtarea = makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, false);
      mockSubtareaRepo.findById.mockResolvedValue(subtarea);
      mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([subtarea]);

      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().id).toBe(SUBTAREA_ID);
    });
  });

  // ─── Registro AVANCE_EDILICIO ─────────────────────────────────────────────

  describe('registro de AVANCE_EDILICIO', () => {
    it('registra una operacion AVANCE_EDILICIO en la misma tx', async () => {
      await useCase.execute(validDto);

      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('la operacion tiene metadata con porcentaje_anterior y porcentaje_nuevo', async () => {
      const edilicia = makeTicketEdilicia(TICKET_EDILICIA_ID, TICKET_ID, 50);
      const subtarea = makeSubtarea(SUBTAREA_ID, TICKET_EDILICIA_ID, false);
      // 2 activas, 1 ya completada → al completar la segunda: 2/2 = 100%
      const yaCompletada = makeSubtarea('sub-002', TICKET_EDILICIA_ID, true);
      mockTicketEdiliciaRepo.findById.mockResolvedValue(edilicia);
      mockSubtareaRepo.findById.mockResolvedValue(subtarea);
      mockSubtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([subtarea, yaCompletada]);

      let savedOperacion: OperacionTicketEntity | undefined;
      mockOperacionRepo.save.mockImplementation(async (o) => {
        savedOperacion = o;
      });

      await useCase.execute(validDto);

      expect(savedOperacion!.metadata).toEqual({
        porcentaje_anterior: 50,
        porcentaje_nuevo: 100,
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
      let savedOperacion: OperacionTicketEntity | undefined;
      mockOperacionRepo.save.mockImplementation(async (o) => {
        savedOperacion = o;
      });

      await useCase.execute(validDto);

      expect(savedOperacion!.ticketId).toBe(TICKET_ID);
    });
  });

  // ─── Atomicidad (dentro del txRunner) ────────────────────────────────────

  describe('atomicidad de la transacción', () => {
    it('subtarea, ticket_edilicia y operacion se guardan dentro del runner', async () => {
      const callOrder: string[] = [];

      (mockTxRunner.run as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
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
    it('retorna Result.ok con la subtarea completada', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().id).toBe(SUBTAREA_ID);
    });
  });
});
