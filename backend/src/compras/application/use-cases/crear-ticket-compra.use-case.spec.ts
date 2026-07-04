import { CrearTicketCompraUseCase } from './crear-ticket-compra.use-case';
import { CrearTicketDto } from '../../../tickets/application/use-cases/crear-ticket.use-case';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { ResolverCicloActivoParaCreacion } from '../../../tickets/application/services/resolver-ciclo-activo.service';
import { SinCicloActivoError } from '../../../tickets/domain/errors/tickets.errors';
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

function makeCicloActivo(id: string): CicloClienteEntity {
  return CicloClienteEntity.create(
    {
      cicloVigenteId: 'cv-001',
      nombre: 'Ciclo Activo Test',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    },
    id,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const TIPO_OPERACION_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';
const TIPO_COMPRAS_ID = 'e0000000-0000-4000-e000-000000000002';
const SOLICITANTE_ID = 'user-solicitante-001';
const CLIENTE_ID = 'cliente-001';
const AUTOR_ID = 'user-autor-001';
const CICLO_ACTIVO_ID = 'a0000000-0000-4000-a000-000000000001';

const validDto: CrearTicketDto = {
  titulo: 'Compra de materiales de oficina',
  descripcion: 'Resmas de papel A4, bolígrafos y carpetas.',
  tipoId: TIPO_COMPRAS_ID,
  prioridadId: 'd0000000-0000-4000-d000-000000000002',
  // Fase 4 (ADR-3): cicloId ya no se lee del DTO en creación — el use case
  // resuelve el ciclo ACTIVO del tenant vía ResolverCicloActivoParaCreacion.
  // Se deja un valor "trampa" para confirmar que se IGNORA (ver test dedicado).
  cicloId: 'z0000000-0000-4000-z000-000000000099',
  solicitanteId: SOLICITANTE_ID,
  clienteId: CLIENTE_ID,
  autorId: AUTOR_ID,
  anio: 2026,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('CrearTicketCompraUseCase', () => {
  let useCase: CrearTicketCompraUseCase;

  const mockTicketRepo = {
    findById: vi.fn(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn<Promise<void>, [TicketEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketRepository>;

  const mockOperacionRepo = {
    findByTicketId: vi.fn(),
    save: vi.fn<Promise<void>, [OperacionTicketEntity]>(),
  } satisfies vi.Mocked<IOperacionTicketRepository>;

  const mockEstadoRepo = {
    findById: vi.fn(),
    findByCodigo: vi.fn(),
    findAllActive: vi.fn(),
    findAll: vi.fn(),
  } satisfies vi.Mocked<IEstadoRepository>;

  const mockUsuarioChecker = {
    existeEnTenant: vi.fn<Promise<boolean>, [string, string]>(),
    estaActivoEnTenant: vi.fn<Promise<boolean>, [string, string]>(),
  } satisfies vi.Mocked<IUsuarioMasterChecker>;

  const mockTipoTicketRepo = {
    findCodigoById: vi.fn<Promise<string | null>, [string]>(),
  } satisfies vi.Mocked<ITipoTicketRepository>;

  const mockTipoOperacionRepo = {
    findIdByCodigo: vi.fn<Promise<string | null>, [string]>(),
  } satisfies vi.Mocked<ITipoOperacionRepository>;

  const mockNumerador = {
    generarNumero: vi.fn(),
  } satisfies Pick<NumeradorTicket, 'generarNumero'>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  const mockTicketCompraRepo = {
    findByTicketId: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn<Promise<void>, [TicketCompraEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketCompraRepository>;

  const mockResolverCicloActivo = {
    resolver: vi.fn(),
  } satisfies Pick<ResolverCicloActivoParaCreacion, 'resolver'>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path mocks
    mockUsuarioChecker.existeEnTenant.mockResolvedValue(true);
    mockTipoTicketRepo.findCodigoById.mockResolvedValue('COMPRAS');
    mockEstadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_ABIERTO_ID, 'ABIERTO'));
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    (mockNumerador.generarNumero as vi.Mock).mockResolvedValue(
      Result.ok<string, never>('COM-2026-00001'),
    );
    mockTicketRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    mockTicketCompraRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());
    mockResolverCicloActivo.resolver.mockResolvedValue(Result.ok(makeCicloActivo(CICLO_ACTIVO_ID)));

    useCase = new CrearTicketCompraUseCase(
      mockTicketRepo,
      mockOperacionRepo,
      mockEstadoRepo,
      mockUsuarioChecker,
      mockTipoTicketRepo,
      mockTipoOperacionRepo,
      mockNumerador,
      mockTxRunner,
      mockTicketCompraRepo,
      mockResolverCicloActivo,
    );
  });

  // ─── Resolución del ciclo activo (Fase 4, ADR-1/ADR-2/ADR-3) ─────────────────

  describe('resolución del ciclo activo del tenant', () => {
    it('retorna SinCicloActivoError cuando no hay ciclo activo en el tenant', async () => {
      mockResolverCicloActivo.resolver.mockResolvedValue(Result.fail(new SinCicloActivoError()));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SIN_CICLO_ACTIVO');
    });

    it('no persiste nada cuando no hay ciclo activo', async () => {
      mockResolverCicloActivo.resolver.mockResolvedValue(Result.fail(new SinCicloActivoError()));

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketCompraRepo.save).not.toHaveBeenCalled();
    });

    it('el ticket creado usa el id del ciclo activo resuelto, ignorando cicloId del DTO', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().cicloId).toBe(CICLO_ACTIVO_ID);
      expect(result.getValue().cicloId).not.toBe(validDto.cicloId);
    });
  });

  // ─── Validación de tipo COMPRAS ───────────────────────────────────────────────

  describe('validación de tipo COMPRAS', () => {
    it('retorna fallo cuando el tipo es SOPORTE (no COMPRAS)', async () => {
      mockTipoTicketRepo.findCodigoById.mockResolvedValue('SOPORTE');

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ES_COMPRAS');
    });

    it('retorna fallo cuando el tipo es EDILICIA (no COMPRAS)', async () => {
      mockTipoTicketRepo.findCodigoById.mockResolvedValue('EDILICIA');

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ES_COMPRAS');
    });

    it('retorna fallo cuando el tipoId no existe en el catálogo', async () => {
      mockTipoTicketRepo.findCodigoById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_TICKET_NO_ENCONTRADO');
    });

    it('NO crea ticket_compra cuando el tipo es SOPORTE', async () => {
      mockTipoTicketRepo.findCodigoById.mockResolvedValue('SOPORTE');

      await useCase.execute(validDto);

      expect(mockTicketCompraRepo.save).not.toHaveBeenCalled();
      expect(mockTxRunner.run).not.toHaveBeenCalled();
    });
  });

  // ─── Validación de solicitante cross-DB ──────────────────────────────────────

  describe('validación de solicitante cross-DB', () => {
    it('retorna fallo cuando el solicitante no existe en el tenant', async () => {
      mockUsuarioChecker.existeEnTenant.mockResolvedValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SOLICITANTE_INVALIDO');
    });

    it('no persiste nada cuando el solicitante falla la validación', async () => {
      mockUsuarioChecker.existeEnTenant.mockResolvedValue(false);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketCompraRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Creación atómica ticket + ticket_compra ──────────────────────────────────

  describe('creación atómica ticket + ticket_compra en misma transacción', () => {
    it('guarda ticket, operacion y ticket_compra dentro del runner', async () => {
      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
      expect(mockTicketCompraRepo.save).toHaveBeenCalledTimes(1);
    });

    it('los tres saves ocurren DENTRO del callback del runner', async () => {
      const callOrder: string[] = [];

      (mockTxRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      mockTicketRepo.save.mockImplementation(() => {
        callOrder.push('ticket:save');
        return Promise.resolve();
      });
      mockOperacionRepo.save.mockImplementation(() => {
        callOrder.push('operacion:save');
        return Promise.resolve();
      });
      mockTicketCompraRepo.save.mockImplementation(() => {
        callOrder.push('ticketCompra:save');
        return Promise.resolve();
      });

      await useCase.execute(validDto);

      const txStart = callOrder.indexOf('tx:start');
      const txEnd = callOrder.indexOf('tx:end');
      const ticketSave = callOrder.indexOf('ticket:save');
      const operacionSave = callOrder.indexOf('operacion:save');
      const ticketCompraSave = callOrder.indexOf('ticketCompra:save');

      expect(txStart).toBeLessThan(ticketSave);
      expect(txStart).toBeLessThan(operacionSave);
      expect(txStart).toBeLessThan(ticketCompraSave);
      expect(txEnd).toBeGreaterThan(ticketSave);
      expect(txEnd).toBeGreaterThan(operacionSave);
      expect(txEnd).toBeGreaterThan(ticketCompraSave);
    });

    it('el ticket_compra tiene el ticketId del ticket creado', async () => {
      let savedTicketCompra: TicketCompraEntity | undefined;
      mockTicketCompraRepo.save.mockImplementation(async (tc) => {
        savedTicketCompra = tc;
      });
      let savedTicket: TicketEntity | undefined;
      mockTicketRepo.save.mockImplementation(async (t) => {
        savedTicket = t;
      });

      await useCase.execute(validDto);

      expect(savedTicketCompra).toBeDefined();
      expect(savedTicket).toBeDefined();
      expect(savedTicketCompra!.ticketId).toBe(savedTicket!.id);
    });

    it('el ticket_compra tiene los campos de aprobación en null inicialmente', async () => {
      let savedTicketCompra: TicketCompraEntity | undefined;
      mockTicketCompraRepo.save.mockImplementation(async (tc) => {
        savedTicketCompra = tc;
      });

      await useCase.execute(validDto);

      expect(savedTicketCompra!.aprobadoPorId).toBeNull();
      expect(savedTicketCompra!.aprobadoEn).toBeNull();
      expect(savedTicketCompra!.motivoRechazo).toBeNull();
    });

    it('si el save de ticket_compra falla, el error se propaga (rollback implícito)', async () => {
      const dbError = new Error('DB constraint violation');
      mockTicketCompraRepo.save.mockRejectedValue(dbError);
      (mockTxRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => fn());

      await expect(useCase.execute(validDto)).rejects.toThrow('DB constraint violation');
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el ticket creado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el ticket retornado tiene el titulo del DTO', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().titulo).toBe('Compra de materiales de oficina');
    });

    it('el ticket tiene estadoId de ABIERTO', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().estadoId).toBe(ESTADO_ABIERTO_ID);
    });

    it('el ticket tiene el número generado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().numero).toBe('COM-2026-00001');
    });

    it('el ticket tiene id en formato UUIDv7', async () => {
      const result = await useCase.execute(validDto);

      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.getValue().id).toMatch(uuidV7Pattern);
    });
  });
});
