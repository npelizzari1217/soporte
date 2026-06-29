import { CrearTicketSoporteUseCase, CrearTicketSoporteDto } from './crear-ticket-soporte.use-case';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
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

function makeEquipo(id: string, activo: boolean, deletedAt: Date | null): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    {
      nombre: 'PC Test',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
      activo,
    },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const TIPO_OPERACION_ID = 'f0000000-0000-4000-f000-000000000001';
const TIPO_SOPORTE_ID = 'e0000000-0000-4000-e000-000000000001';
const EQUIPO_ID = 'eq000000-0000-4000-e000-000000000001';
const SOLICITANTE_ID = 'user-solicitante-001';
const CLIENTE_ID = 'cliente-001';
const AUTOR_ID = 'user-autor-001';

const validDtoConEquipo: CrearTicketSoporteDto = {
  titulo: 'PC no enciende',
  descripcion: 'La PC de contabilidad no enciende al presionar el botón de power.',
  tipoId: TIPO_SOPORTE_ID,
  prioridadId: 'd0000000-0000-4000-d000-000000000001',
  cicloId: null,
  solicitanteId: SOLICITANTE_ID,
  clienteId: CLIENTE_ID,
  autorId: AUTOR_ID,
  anio: 2026,
  equipoId: EQUIPO_ID,
};

const validDtoSinEquipo: CrearTicketSoporteDto = {
  ...validDtoConEquipo,
  equipoId: null,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('CrearTicketSoporteUseCase', () => {
  let useCase: CrearTicketSoporteUseCase;

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

  const mockTicketSoporteRepo = {
    findByTicketId: vi.fn(),
    findById: vi.fn(),
    findByEquipoId: vi.fn(),
    save: vi.fn<Promise<void>, [TicketSoporteEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<ITicketSoporteRepository>;

  const mockEquipoRepo = {
    findById: vi.fn(),
    findByNumeroSerie: vi.fn(),
    findAllActive: vi.fn(),
    findByAsignadoAId: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IEquipoInformaticoRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Happy-path mocks
    mockUsuarioChecker.existeEnTenant.mockResolvedValue(true);
    mockTipoTicketRepo.findCodigoById.mockResolvedValue('SOPORTE');
    mockEstadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_ABIERTO_ID, 'ABIERTO'));
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_ID);
    (mockNumerador.generarNumero as vi.Mock).mockResolvedValue(
      Result.ok<string, never>('SOP-2026-00001'),
    );
    mockTicketRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    mockTicketSoporteRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());
    mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, true, null));

    useCase = new CrearTicketSoporteUseCase(
      mockTicketRepo,
      mockOperacionRepo,
      mockEstadoRepo,
      mockUsuarioChecker,
      mockTipoTicketRepo,
      mockTipoOperacionRepo,
      mockNumerador,
      mockTxRunner,
      mockTicketSoporteRepo,
      mockEquipoRepo,
    );
  });

  // ─── validación de equipo_id cuando se provee ─────────────────────────────

  describe('validación de equipo_id (cuando provisto)', () => {
    it('retorna fallo cuando el equipo_id no existe', async () => {
      mockEquipoRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDtoConEquipo);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INVALIDO');
    });

    it('retorna fallo cuando el equipo está inactivo (activo=false)', async () => {
      mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, false, null));

      const result = await useCase.execute(validDtoConEquipo);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INVALIDO');
    });

    it('retorna fallo cuando el equipo fue soft-deleted', async () => {
      mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, true, new Date()));

      const result = await useCase.execute(validDtoConEquipo);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INVALIDO');
    });

    it('no llama a txRunner cuando el equipo es inválido', async () => {
      mockEquipoRepo.findById.mockResolvedValue(null);

      await useCase.execute(validDtoConEquipo);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
    });
  });

  // ─── equipo_id = null es válido ───────────────────────────────────────────

  describe('equipo_id null es válido', () => {
    it('retorna Result.ok cuando equipo_id es null', async () => {
      const result = await useCase.execute(validDtoSinEquipo);

      expect(result.isOk()).toBe(true);
    });

    it('NO llama a equipoRepo.findById cuando equipo_id es null', async () => {
      await useCase.execute(validDtoSinEquipo);

      expect(mockEquipoRepo.findById).not.toHaveBeenCalled();
    });

    it('el satélite ticket_soporte tiene equipoId = null cuando no se provee', async () => {
      let savedSoporte: TicketSoporteEntity | undefined;
      mockTicketSoporteRepo.save.mockImplementation(async (e) => {
        savedSoporte = e;
      });

      await useCase.execute(validDtoSinEquipo);

      expect(savedSoporte!.equipoId).toBeNull();
    });
  });

  // ─── Creación atómica ticket + ticket_soporte ─────────────────────────────

  describe('creación atómica ticket + ticket_soporte en misma transacción', () => {
    it('guarda ticket, operacion y ticket_soporte dentro del runner', async () => {
      await useCase.execute(validDtoConEquipo);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
      expect(mockTicketSoporteRepo.save).toHaveBeenCalledTimes(1);
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
      mockTicketSoporteRepo.save.mockImplementation(() => {
        callOrder.push('soporte:save');
        return Promise.resolve();
      });

      await useCase.execute(validDtoConEquipo);

      const txStart = callOrder.indexOf('tx:start');
      const txEnd = callOrder.indexOf('tx:end');

      expect(txStart).toBeLessThan(callOrder.indexOf('ticket:save'));
      expect(txStart).toBeLessThan(callOrder.indexOf('operacion:save'));
      expect(txStart).toBeLessThan(callOrder.indexOf('soporte:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('ticket:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('operacion:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('soporte:save'));
    });

    it('el satélite ticket_soporte tiene el ticketId del ticket creado', async () => {
      let savedSoporte: TicketSoporteEntity | undefined;
      let savedTicket: TicketEntity | undefined;

      mockTicketSoporteRepo.save.mockImplementation(async (e) => {
        savedSoporte = e;
      });
      mockTicketRepo.save.mockImplementation(async (t) => {
        savedTicket = t;
      });

      await useCase.execute(validDtoConEquipo);

      expect(savedSoporte!.ticketId).toBe(savedTicket!.id);
    });

    it('el satélite ticket_soporte tiene el equipoId del DTO cuando se provee', async () => {
      let savedSoporte: TicketSoporteEntity | undefined;
      mockTicketSoporteRepo.save.mockImplementation(async (e) => {
        savedSoporte = e;
      });

      await useCase.execute(validDtoConEquipo);

      expect(savedSoporte!.equipoId).toBe(EQUIPO_ID);
    });
  });

  // ─── Validación de solicitante cross-DB ──────────────────────────────────

  describe('validación de solicitante cross-DB', () => {
    it('retorna fallo cuando el solicitante no existe en el tenant', async () => {
      mockUsuarioChecker.existeEnTenant.mockResolvedValue(false);

      const result = await useCase.execute(validDtoConEquipo);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SOLICITANTE_INVALIDO');
    });
  });

  // ─── validación de tipo SOPORTE ───────────────────────────────────────────

  describe('validación de tipo SOPORTE', () => {
    it('retorna fallo cuando el tipo es EDILICIA (no SOPORTE)', async () => {
      mockTipoTicketRepo.findCodigoById.mockResolvedValue('EDILICIA');

      const result = await useCase.execute(validDtoConEquipo);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ES_SOPORTE');
    });

    it('retorna fallo cuando el tipoId no existe en el catálogo', async () => {
      mockTipoTicketRepo.findCodigoById.mockResolvedValue(null);

      const result = await useCase.execute(validDtoConEquipo);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_TICKET_NO_ENCONTRADO');
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el ticket creado', async () => {
      const result = await useCase.execute(validDtoConEquipo);

      expect(result.isOk()).toBe(true);
    });

    it('el ticket retornado tiene el titulo del DTO', async () => {
      const result = await useCase.execute(validDtoConEquipo);

      expect(result.getValue().titulo).toBe('PC no enciende');
    });

    it('el ticket tiene estadoId de ABIERTO', async () => {
      const result = await useCase.execute(validDtoConEquipo);

      expect(result.getValue().estadoId).toBe(ESTADO_ABIERTO_ID);
    });

    it('el ticket tiene id en formato UUIDv7', async () => {
      const result = await useCase.execute(validDtoConEquipo);

      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.getValue().id).toMatch(uuidV7Pattern);
    });
  });
});
