import { EliminarUbicacionUseCase, EliminarUbicacionDto } from './eliminar-ubicacion.use-case';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUbicacion(
  id: string,
  padreId: string | null = null,
  activo = true,
  deletedAt: Date | null = null,
): UbicacionEntity {
  return UbicacionEntity.reconstitute(
    { nombre: `Ubicacion ${id}`, descripcion: null, padreId, activo },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

function makeTicketEdilicia(
  id: string,
  ticketId: string,
  ubicacionId: string,
): TicketEdiliciaEntity {
  return TicketEdiliciaEntity.reconstitute(
    { ticketId, ubicacionId, personalAsignadoId: null, porcentajeAvance: 50 },
    id,
    new Date(),
    new Date(),
    null,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const PADRE_ID = 'ub-padre-001';
const HIJO_ID = 'ub-hijo-001';
const NIETO_ID = 'ub-nieto-001';
const TIPO_OPERACION_UBICACION_ELIMINADA_ID = 'fo000000-0000-4000-f000-000000000099';
const AUTOR_ID = 'user-autor-001';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('EliminarUbicacionUseCase', () => {
  let useCase: EliminarUbicacionUseCase;

  const mockUbicacionRepo = {
    findById: vi.fn(),
    findAllActive: vi.fn(),
    findSubtree: vi.fn(),
    save: vi.fn<Promise<void>, [UbicacionEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IUbicacionRepository>;

  const mockTicketEdiliciaRepo = {
    findByTicketId: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    findByUbicacionId: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketEdiliciaRepository>;

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

    // Default mocks — cubrimos el happy path base para simplificar tests individuales.
    // findSubtree retorna [raíz] por defecto (sin descendientes).
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_UBICACION_ELIMINADA_ID);
    mockUbicacionRepo.save.mockResolvedValue(undefined);
    mockUbicacionRepo.delete.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    mockTicketEdiliciaRepo.findByUbicacionId.mockResolvedValue([]);
    mockUbicacionRepo.findSubtree.mockResolvedValue([makeUbicacion(PADRE_ID)]);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new EliminarUbicacionUseCase(
      mockUbicacionRepo,
      mockTicketEdiliciaRepo,
      mockOperacionRepo,
      mockTipoOperacionRepo,
      mockTxRunner,
    );
  });

  // ─── soft delete en cascada lógica ───────────────────────────────────────

  describe('soft delete en cascada (padre → hijos)', () => {
    const eliminarDto: EliminarUbicacionDto = {
      ubicacionId: PADRE_ID,
      autorId: AUTOR_ID,
    };

    it('retorna fallo cuando la ubicacion no existe', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(eliminarDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('UBICACION_INVALIDA');
    });

    it('retorna fallo cuando la ubicacion fue soft-deleted', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID, null, true, new Date()));

      const result = await useCase.execute(eliminarDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('UBICACION_INVALIDA');
    });

    it('soft-deleta el padre al eliminar', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      // findSubtree del beforeEach: [makeUbicacion(PADRE_ID)] — solo la raíz

      await useCase.execute(eliminarDto);

      expect(mockUbicacionRepo.delete).toHaveBeenCalledWith(PADRE_ID);
    });

    it('soft-deleta los hijos directos del padre (CTE retorna raíz + hijo)', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      // CTE recursiva devuelve el árbol completo en una sola llamada
      mockUbicacionRepo.findSubtree.mockResolvedValue([
        makeUbicacion(PADRE_ID),
        makeUbicacion(HIJO_ID, PADRE_ID),
      ]);

      await useCase.execute(eliminarDto);

      expect(mockUbicacionRepo.delete).toHaveBeenCalledWith(HIJO_ID);
    });

    it('soft-deleta los nietos (cascada recursiva de 2 niveles via CTE)', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      // CTE devuelve raíz + hijo + nieto en una sola query
      mockUbicacionRepo.findSubtree.mockResolvedValue([
        makeUbicacion(PADRE_ID),
        makeUbicacion(HIJO_ID, PADRE_ID),
        makeUbicacion(NIETO_ID, HIJO_ID),
      ]);

      await useCase.execute(eliminarDto);

      expect(mockUbicacionRepo.delete).toHaveBeenCalledWith(PADRE_ID);
      expect(mockUbicacionRepo.delete).toHaveBeenCalledWith(HIJO_ID);
      expect(mockUbicacionRepo.delete).toHaveBeenCalledWith(NIETO_ID);
    });

    it('toda la operacion ocurre dentro de la transacción (findSubtree + delete + operaciones)', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      // default findSubtree del beforeEach

      await useCase.execute(eliminarDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
    });
  });

  // ─── registro de evento en tickets afectados ─────────────────────────────

  describe('registro de evento UBICACION_ELIMINADA en operaciones_ticket', () => {
    const eliminarDto: EliminarUbicacionDto = {
      ubicacionId: PADRE_ID,
      autorId: AUTOR_ID,
    };

    it('NO registra evento cuando no hay tickets que referencien la ubicacion', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      // default: findSubtree=[raíz], findByUbicacionId=[]

      await useCase.execute(eliminarDto);

      expect(mockOperacionRepo.save).not.toHaveBeenCalled();
    });

    it('registra un evento UBICACION_ELIMINADA por cada ticket que referencia la ubicacion', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      // default findSubtree: [PADRE] (solo la raíz)
      const ticket1 = makeTicketEdilicia('te-001', 'ticket-001', PADRE_ID);
      const ticket2 = makeTicketEdilicia('te-002', 'ticket-002', PADRE_ID);
      mockTicketEdiliciaRepo.findByUbicacionId.mockResolvedValue([ticket1, ticket2]);

      await useCase.execute(eliminarDto);

      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(2);
    });

    it('registra eventos para tickets que referencian ubicaciones hijas también', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      // CTE devuelve raíz + hijo
      mockUbicacionRepo.findSubtree.mockResolvedValue([
        makeUbicacion(PADRE_ID),
        makeUbicacion(HIJO_ID, PADRE_ID),
      ]);
      // findByUbicacionId se llama una vez por cada nodo del subárbol
      mockTicketEdiliciaRepo.findByUbicacionId
        .mockResolvedValueOnce([makeTicketEdilicia('te-001', 'ticket-001', PADRE_ID)])
        .mockResolvedValueOnce([makeTicketEdilicia('te-002', 'ticket-002', HIJO_ID)]);

      await useCase.execute(eliminarDto);

      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(2);
    });

    it('no registra eventos duplicados cuando el mismo ticket referencia padre e hijo', async () => {
      // ticket-001 aparece en la ubicacion padre Y en la hija → solo 1 operación
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      mockUbicacionRepo.findSubtree.mockResolvedValue([
        makeUbicacion(PADRE_ID),
        makeUbicacion(HIJO_ID, PADRE_ID),
      ]);
      mockTicketEdiliciaRepo.findByUbicacionId
        .mockResolvedValueOnce([makeTicketEdilicia('te-001', 'ticket-001', PADRE_ID)])
        .mockResolvedValueOnce([makeTicketEdilicia('te-001b', 'ticket-001', HIJO_ID)]); // mismo ticketId

      await useCase.execute(eliminarDto);

      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('las operaciones usan el tipo UBICACION_ELIMINADA', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      mockTicketEdiliciaRepo.findByUbicacionId.mockResolvedValue([
        makeTicketEdilicia('te-001', 'ticket-001', PADRE_ID),
      ]);

      let savedOperacion: OperacionTicketEntity | undefined;
      mockOperacionRepo.save.mockImplementation(async (o) => {
        savedOperacion = o;
      });

      await useCase.execute(eliminarDto);

      expect(mockTipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('UBICACION_ELIMINADA');
      expect(savedOperacion!.tipoOperacionId).toBe(TIPO_OPERACION_UBICACION_ELIMINADA_ID);
    });

    it('las operaciones tienen el ticketId del ticket afectado', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      mockTicketEdiliciaRepo.findByUbicacionId.mockResolvedValue([
        makeTicketEdilicia('te-001', 'ticket-base-001', PADRE_ID),
      ]);

      let savedOperacion: OperacionTicketEntity | undefined;
      mockOperacionRepo.save.mockImplementation(async (o) => {
        savedOperacion = o;
      });

      await useCase.execute(eliminarDto);

      expect(savedOperacion!.ticketId).toBe('ticket-base-001');
    });

    it('retorna fallo cuando el tipo UBICACION_ELIMINADA no está en el catálogo', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));
      mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

      const result = await useCase.execute(eliminarDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_OPERACION_NO_ENCONTRADO');
    });
  });

  // ─── happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok cuando la ubicacion existe', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));

      const result = await useCase.execute({ ubicacionId: PADRE_ID, autorId: AUTOR_ID });

      expect(result.isOk()).toBe(true);
    });
  });
});
