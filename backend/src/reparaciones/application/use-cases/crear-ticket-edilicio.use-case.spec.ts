import { CrearTicketEdilicioUseCase, CrearTicketEdilicioDto } from './crear-ticket-edilicio.use-case';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { Result } from '../../../shared/domain/result';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEstado(id: string, codigo: string): EstadoEntity {
  return EstadoEntity.reconstitute(
    { codigo, nombre: codigo, color: null, orden: 10, activo: true },
    id,
    new Date(),
    new Date(),
    null,
  );
}

function makeUbicacion(id: string, activo: boolean, deletedAt: Date | null): UbicacionEntity {
  return UbicacionEntity.reconstitute(
    { nombre: 'Edificio Central', descripcion: null, padreId: null, activo },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const TIPO_OPERACION_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';
const TIPO_EDILICIA_ID = 'e0000000-0000-4000-e000-000000000003';
const UBICACION_ID = 'ub000000-0000-4000-0000-000000000001';
const SOLICITANTE_ID = 'user-solicitante-001';
const CLIENTE_ID = 'cliente-001';
const AUTOR_ID = 'user-autor-001';

const validDto: CrearTicketEdilicioDto = {
  titulo: 'Reparación de grieta en pared Piso 3',
  descripcion: 'Grieta structural en sala de reuniones.',
  tipoId: TIPO_EDILICIA_ID,
  prioridadId: 'd0000000-0000-4000-d000-000000000002',
  cicloId: null,
  solicitanteId: SOLICITANTE_ID,
  clienteId: CLIENTE_ID,
  autorId: AUTOR_ID,
  anio: 2026,
  fechaVencimiento: null,
  ubicacionId: UBICACION_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('CrearTicketEdilicioUseCase', () => {
  let useCase: CrearTicketEdilicioUseCase;

  const mockTicketRepo = {
    findById: jest.fn(),
    findByNumero: jest.fn(),
    findLastSecuencia: jest.fn(),
    findByEstado: jest.fn(),
    save: jest.fn<Promise<void>, [TicketEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketRepository>;

  const mockOperacionRepo = {
    findByTicketId: jest.fn(),
    save: jest.fn<Promise<void>, [OperacionTicketEntity]>(),
  } satisfies jest.Mocked<IOperacionTicketRepository>;

  const mockEstadoRepo = {
    findById: jest.fn(),
    findByCodigo: jest.fn(),
    findAllActive: jest.fn(),
    findAll: jest.fn(),
  } satisfies jest.Mocked<IEstadoRepository>;

  const mockUsuarioChecker = {
    existeEnTenant: jest.fn<Promise<boolean>, [string, string]>(),
    estaActivoEnTenant: jest.fn<Promise<boolean>, [string, string]>(),
  } satisfies jest.Mocked<IUsuarioMasterChecker>;

  const mockTipoTicketRepo = {
    findCodigoById: jest.fn<Promise<string | null>, [string]>(),
  } satisfies jest.Mocked<ITipoTicketRepository>;

  const mockTipoOperacionRepo = {
    findIdByCodigo: jest.fn<Promise<string | null>, [string]>(),
  } satisfies jest.Mocked<ITipoOperacionRepository>;

  const mockNumerador = {
    generarNumero: jest.fn(),
  } satisfies Pick<NumeradorTicket, 'generarNumero'>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  const mockTicketEdiliciaRepo = {
    findByTicketId: jest.fn(),
    findById: jest.fn(),
    findByUbicacionId: jest.fn(),
    save: jest.fn<Promise<void>, [TicketEdiliciaEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketEdiliciaRepository>;

  const mockUbicacionRepo = {
    findById: jest.fn(),
    findAllActive: jest.fn(),
    findSubtree: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } satisfies jest.Mocked<IUbicacionRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Happy-path mocks
    mockUsuarioChecker.existeEnTenant.mockResolvedValue(true);
    mockTipoTicketRepo.findCodigoById.mockResolvedValue('EDILICIA');
    mockEstadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_ABIERTO_ID, 'ABIERTO'));
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    (mockNumerador.generarNumero as jest.Mock).mockResolvedValue(
      Result.ok<string, never>('EDI-2026-00001'),
    );
    mockTicketRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    mockTicketEdiliciaRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());
    mockUbicacionRepo.findById.mockResolvedValue(
      makeUbicacion(UBICACION_ID, true, null),
    );

    useCase = new CrearTicketEdilicioUseCase(
      mockTicketRepo,
      mockOperacionRepo,
      mockEstadoRepo,
      mockUsuarioChecker,
      mockTipoTicketRepo,
      mockTipoOperacionRepo,
      mockNumerador,
      mockTxRunner,
      mockTicketEdiliciaRepo,
      mockUbicacionRepo,
    );
  });

  // ─── Validación de ubicación ──────────────────────────────────────────────

  describe('validación de ubicacion_id', () => {
    it('retorna fallo cuando la ubicacion_id no existe', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('UBICACION_INVALIDA');
    });

    it('retorna fallo cuando la ubicacion está inactiva (activo=false)', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(
        makeUbicacion(UBICACION_ID, false, null),
      );

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('UBICACION_INVALIDA');
    });

    it('retorna fallo cuando la ubicacion fue soft-deleted', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(
        makeUbicacion(UBICACION_ID, true, new Date()),
      );

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('UBICACION_INVALIDA');
    });

    it('no persiste nada cuando la ubicacion es inválida', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(null);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketEdiliciaRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Validación de tipo EDILICIA ──────────────────────────────────────────

  describe('validación de tipo EDILICIA', () => {
    it('retorna fallo cuando el tipo es COMPRAS (no EDILICIA)', async () => {
      mockTipoTicketRepo.findCodigoById.mockResolvedValue('COMPRAS');

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ES_EDILICIA');
    });

    it('retorna fallo cuando el tipoId no existe en el catálogo', async () => {
      mockTipoTicketRepo.findCodigoById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_TICKET_NO_ENCONTRADO');
    });
  });

  // ─── porcentaje_avance = 0.00 inicial ────────────────────────────────────

  describe('ticket_edilicia inicial', () => {
    it('el satélite ticket_edilicia tiene porcentajeAvance = 0 al crearse', async () => {
      let savedEdilicia: TicketEdiliciaEntity | undefined;
      mockTicketEdiliciaRepo.save.mockImplementation(async (e) => {
        savedEdilicia = e;
      });

      await useCase.execute(validDto);

      expect(savedEdilicia).toBeDefined();
      expect(savedEdilicia!.porcentajeAvance).toBe(0);
    });

    it('el satélite ticket_edilicia tiene el ubicacionId del DTO', async () => {
      let savedEdilicia: TicketEdiliciaEntity | undefined;
      mockTicketEdiliciaRepo.save.mockImplementation(async (e) => {
        savedEdilicia = e;
      });

      await useCase.execute(validDto);

      expect(savedEdilicia!.ubicacionId).toBe(UBICACION_ID);
    });

    it('el satélite ticket_edilicia tiene el ticketId del ticket creado', async () => {
      let savedEdilicia: TicketEdiliciaEntity | undefined;
      let savedTicket: TicketEntity | undefined;
      mockTicketEdiliciaRepo.save.mockImplementation(async (e) => { savedEdilicia = e; });
      mockTicketRepo.save.mockImplementation(async (t) => { savedTicket = t; });

      await useCase.execute(validDto);

      expect(savedEdilicia!.ticketId).toBe(savedTicket!.id);
    });

    it('el satélite ticket_edilicia tiene personalAsignadoId = null inicialmente', async () => {
      let savedEdilicia: TicketEdiliciaEntity | undefined;
      mockTicketEdiliciaRepo.save.mockImplementation(async (e) => { savedEdilicia = e; });

      await useCase.execute(validDto);

      expect(savedEdilicia!.personalAsignadoId).toBeNull();
    });
  });

  // ─── Creación atómica ticket + ticket_edilicia ────────────────────────────

  describe('creación atómica ticket + ticket_edilicia en misma transacción', () => {
    it('guarda ticket, operacion y ticket_edilicia dentro del runner', async () => {
      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
      expect(mockTicketEdiliciaRepo.save).toHaveBeenCalledTimes(1);
    });

    it('los tres saves ocurren DENTRO del callback del runner', async () => {
      const callOrder: string[] = [];

      (mockTxRunner.run as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      mockTicketRepo.save.mockImplementation(() => { callOrder.push('ticket:save'); return Promise.resolve(); });
      mockOperacionRepo.save.mockImplementation(() => { callOrder.push('operacion:save'); return Promise.resolve(); });
      mockTicketEdiliciaRepo.save.mockImplementation(() => { callOrder.push('edilicia:save'); return Promise.resolve(); });

      await useCase.execute(validDto);

      const txStart = callOrder.indexOf('tx:start');
      const txEnd = callOrder.indexOf('tx:end');

      expect(txStart).toBeLessThan(callOrder.indexOf('ticket:save'));
      expect(txStart).toBeLessThan(callOrder.indexOf('operacion:save'));
      expect(txStart).toBeLessThan(callOrder.indexOf('edilicia:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('ticket:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('operacion:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('edilicia:save'));
    });
  });

  // ─── Validación de solicitante cross-DB ──────────────────────────────────

  describe('validación de solicitante cross-DB', () => {
    it('retorna fallo cuando el solicitante no existe en el tenant', async () => {
      mockUsuarioChecker.existeEnTenant.mockResolvedValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SOLICITANTE_INVALIDO');
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el ticket creado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el ticket retornado tiene el titulo del DTO', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().titulo).toBe('Reparación de grieta en pared Piso 3');
    });

    it('el ticket tiene estadoId de ABIERTO', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().estadoId).toBe(ESTADO_ABIERTO_ID);
    });

    it('el ticket tiene id en formato UUIDv7', async () => {
      const result = await useCase.execute(validDto);

      const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.getValue().id).toMatch(uuidV7Pattern);
    });
  });
});
