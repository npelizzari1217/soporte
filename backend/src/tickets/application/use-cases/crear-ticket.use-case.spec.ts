import { CrearTicketDto, CrearTicketUseCase } from './crear-ticket.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { Result } from '../../../shared/domain/result';
import { SecuenciaAgotadaError } from '../../domain/errors/tickets.errors';

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

// ─── Constantes de test ───────────────────────────────────────────────────────

const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const TIPO_OPERACION_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';
const TIPO_TICKET_ID = 'e0000000-0000-4000-e000-000000000001';
const SOLICITANTE_ID = 'user-solicitante-001';
const CLIENTE_ID = 'cliente-001';
const AUTOR_ID = 'user-autor-001';

const validDto: CrearTicketDto = {
  titulo: 'Computadora no enciende',
  descripcion: 'La PC del área de contabilidad no enciende desde hoy.',
  tipoId: TIPO_TICKET_ID,
  prioridadId: 'd0000000-0000-4000-d000-000000000002',
  cicloId: null,
  solicitanteId: SOLICITANTE_ID,
  clienteId: CLIENTE_ID,
  autorId: AUTOR_ID,
  anio: 2026,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('CrearTicketUseCase', () => {
  let useCase: CrearTicketUseCase;

  const mockTicketRepo = {
    findById: jest.fn(),
    findByNumero: jest.fn(),
    findLastSecuencia: jest.fn(),
    findAll: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path mocks
    mockUsuarioChecker.existeEnTenant.mockResolvedValue(true);
    mockTipoTicketRepo.findCodigoById.mockResolvedValue('SOPORTE');
    mockEstadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_ABIERTO_ID, 'ABIERTO'));
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    (mockNumerador.generarNumero as jest.Mock).mockResolvedValue(
      Result.ok<string, never>('SOP-2026-00001'),
    );
    mockTicketRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new CrearTicketUseCase(
      mockTicketRepo,
      mockOperacionRepo,
      mockEstadoRepo,
      mockUsuarioChecker,
      mockTipoTicketRepo,
      mockTipoOperacionRepo,
      mockNumerador,
      mockTxRunner,
    );
  });

  // ─── Validación de solicitante cross-DB ──────────────────────────────────────

  describe('validación de solicitante cross-DB', () => {
    it('retorna fallo cuando el solicitante no existe en el tenant', async () => {
      mockUsuarioChecker.existeEnTenant.mockResolvedValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SOLICITANTE_INVALIDO');
    });

    it('llama a existeEnTenant con el solicitanteId y clienteId del DTO', async () => {
      mockUsuarioChecker.existeEnTenant.mockResolvedValue(false);

      await useCase.execute(validDto);

      expect(mockUsuarioChecker.existeEnTenant).toHaveBeenCalledWith(SOLICITANTE_ID, CLIENTE_ID);
    });

    it('no persiste nada cuando el solicitante falla la validación', async () => {
      mockUsuarioChecker.existeEnTenant.mockResolvedValue(false);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Estado inicial ABIERTO ───────────────────────────────────────────────────

  describe('estado inicial ABIERTO', () => {
    it('busca el estado ABIERTO en el catálogo del tenant', async () => {
      await useCase.execute(validDto);

      expect(mockEstadoRepo.findByCodigo).toHaveBeenCalledWith('ABIERTO');
    });

    it('retorna fallo cuando el estado ABIERTO no está en el catálogo', async () => {
      mockEstadoRepo.findByCodigo.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('ESTADO_CATALOGO_NO_ENCONTRADO');
    });

    it('asigna el estadoId de ABIERTO al ticket creado', async () => {
      await useCase.execute(validDto);

      const savedTicket = mockTicketRepo.save.mock.calls[0][0];
      expect(savedTicket.estadoId).toBe(ESTADO_ABIERTO_ID);
    });
  });

  // ─── Generación de número legible ────────────────────────────────────────────

  describe('generación de número legible', () => {
    it('resuelve el tipoCodigo a partir del tipoId para pasarlo al numerador', async () => {
      await useCase.execute(validDto);

      expect(mockTipoTicketRepo.findCodigoById).toHaveBeenCalledWith(TIPO_TICKET_ID);
    });

    it('llama a NumeradorTicket con tipoId, tipoCodigo y anio correctos', async () => {
      await useCase.execute(validDto);

      expect(mockNumerador.generarNumero).toHaveBeenCalledWith(TIPO_TICKET_ID, 'SOPORTE', 2026);
    });

    it('propaga SecuenciaAgotadaError cuando el numerador falla', async () => {
      const error = new SecuenciaAgotadaError('SOPORTE', 2026);
      (mockNumerador.generarNumero as jest.Mock).mockResolvedValue(Result.fail(error));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SECUENCIA_AGOTADA');
    });

    it('asigna el número generado al ticket', async () => {
      await useCase.execute(validDto);

      const savedTicket = mockTicketRepo.save.mock.calls[0][0];
      expect(savedTicket.numero).toBe('SOP-2026-00001');
    });
  });

  // ─── Operacion CAMBIO_ESTADO inicial ─────────────────────────────────────────

  describe('operacion CAMBIO_ESTADO inicial (estado_anterior=NULL, estado_nuevo=ABIERTO)', () => {
    it('crea la operacion con estadoAnteriorId=null', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.estadoAnteriorId).toBeNull();
    });

    it('crea la operacion con estadoNuevoId igual al id de ABIERTO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.estadoNuevoId).toBe(ESTADO_ABIERTO_ID);
    });

    it('crea la operacion con el tipo_operacion_id de CAMBIO_ESTADO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.tipoOperacionId).toBe(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    });

    it('la operacion referencia al ticket creado en el mismo execute', async () => {
      await useCase.execute(validDto);

      const savedTicket = mockTicketRepo.save.mock.calls[0][0];
      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.ticketId).toBe(savedTicket.id);
    });

    it('la operacion lleva el autorId del DTO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.autorId).toBe(AUTOR_ID);
    });

    it('resuelve el id de CAMBIO_ESTADO del catálogo tipo_operacion', async () => {
      await useCase.execute(validDto);

      expect(mockTipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('CAMBIO_ESTADO');
    });

    it('retorna fallo cuando CAMBIO_ESTADO no está en el catálogo', async () => {
      mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_OPERACION_NO_ENCONTRADO');
    });
  });

  // ─── Transacción atómica ──────────────────────────────────────────────────────

  describe('transacción atómica vía TenantTransactionRunner', () => {
    it('ejecuta el save de ticket y operacion dentro del runner', async () => {
      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('el save de ticket y operacion ocurren DENTRO del callback del runner', async () => {
      const callOrder: string[] = [];

      (mockTxRunner.run as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
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

      await useCase.execute(validDto);

      const txStart = callOrder.indexOf('tx:start');
      const txEnd = callOrder.indexOf('tx:end');
      const ticketSave = callOrder.indexOf('ticket:save');
      const operacionSave = callOrder.indexOf('operacion:save');

      expect(txStart).toBeLessThan(ticketSave);
      expect(txStart).toBeLessThan(operacionSave);
      expect(txEnd).toBeGreaterThan(ticketSave);
      expect(txEnd).toBeGreaterThan(operacionSave);
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

      expect(result.getValue().titulo).toBe('Computadora no enciende');
    });

    it('el ticket retornado tiene el solicitanteId correcto', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().solicitanteId).toBe(SOLICITANTE_ID);
    });

    it('el ticket tiene id en formato UUIDv7', async () => {
      const result = await useCase.execute(validDto);

      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.getValue().id).toMatch(uuidV7Pattern);
    });

    it('el ticket no tiene asignadoId (sin asignar al crear)', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().asignadoId).toBeNull();
    });
  });
});
