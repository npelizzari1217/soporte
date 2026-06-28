import { AsignarTicketDto, AsignarTicketUseCase } from './asignar-ticket.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { IUsuarioTiposTicketRepository } from '../../domain/ports/i-usuario-tipos-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<TicketProps> = {}): TicketEntity {
  return TicketEntity.reconstitute(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: TIPO_TICKET_ID,
      estadoId: ESTADO_ABIERTO_ID,
      prioridadId: 'd0000000-0000-4000-d000-000000000002',
      cicloId: null,
      solicitanteId: 'user-solicitante-001',
      asignadoId: null,
      fechaResolucion: null,
      ...overrides,
    },
    'ticket-uuid-001',
    new Date(),
    new Date(),
    null,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const TIPO_TICKET_ID = 'e0000000-0000-4000-e000-000000000001';
const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const TIPO_OPERACION_ASIGNACION_ID = 'f0000000-0000-4000-f000-000000000003';
const TICKET_ID = 'ticket-uuid-001';
const ASIGNADO_ID = 'user-asignado-001';
const CLIENTE_ID = 'cliente-uuid-001';
const AUTOR_ID = 'user-autor-001';

const validDto: AsignarTicketDto = {
  ticketId: TICKET_ID,
  asignadoId: ASIGNADO_ID,
  clienteId: CLIENTE_ID,
  autorId: AUTOR_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('AsignarTicketUseCase', () => {
  let useCase: AsignarTicketUseCase;

  const mockTicketRepo = {
    findById: jest.fn<Promise<TicketEntity | null>, [string]>(),
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

  const mockUsuarioChecker = {
    existeEnTenant: jest.fn<Promise<boolean>, [string, string]>(),
    estaActivoEnTenant: jest.fn<Promise<boolean>, [string, string]>(),
  } satisfies jest.Mocked<IUsuarioMasterChecker>;

  const mockUsuarioTiposTicketRepo = {
    isUserEligibleForType: jest.fn<Promise<boolean>, [string, string]>(),
    findTipoIdsByUsuario: jest.fn(),
    findUsuarioIdsByTipo: jest.fn(),
    assign: jest.fn(),
    revoke: jest.fn(),
  } satisfies jest.Mocked<IUsuarioTiposTicketRepository>;

  const mockTipoOperacionRepo = {
    findIdByCodigo: jest.fn<Promise<string | null>, [string]>(),
  } satisfies jest.Mocked<ITipoOperacionRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path mocks
    mockTicketRepo.findById.mockResolvedValue(makeTicket());
    mockUsuarioChecker.estaActivoEnTenant.mockResolvedValue(true);
    mockUsuarioTiposTicketRepo.isUserEligibleForType.mockResolvedValue(true);
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_ASIGNACION_ID);
    mockTicketRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new AsignarTicketUseCase(
      mockTicketRepo,
      mockOperacionRepo,
      mockUsuarioChecker,
      mockUsuarioTiposTicketRepo,
      mockTipoOperacionRepo,
      mockTxRunner,
    );
  });

  // ─── Carga del ticket ──────────────────────────────────────────────────────

  describe('carga del ticket', () => {
    it('retorna TicketNoEncontradoError cuando el ticket no existe', async () => {
      mockTicketRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
    });

    it('llama a ticketRepo.findById con el ticketId del DTO', async () => {
      await useCase.execute(validDto);

      expect(mockTicketRepo.findById).toHaveBeenCalledWith(TICKET_ID);
    });

    it('no persiste nada cuando el ticket no existe', async () => {
      mockTicketRepo.findById.mockResolvedValue(null);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });

    it('retorna TicketNoEncontradoError cuando el ticket está soft-deleted', async () => {
      // WARNING-1: soft-deleted tickets must be treated as not found
      const ticketBorrado = TicketEntity.reconstitute(
        {
          numero: 'SOP-2026-00001',
          titulo: 'Ticket borrado',
          descripcion: null,
          tipoId: TIPO_TICKET_ID,
          estadoId: ESTADO_ABIERTO_ID,
          prioridadId: 'd0000000-0000-4000-d000-000000000002',
          cicloId: null,
          solicitanteId: 'user-solicitante-001',
          asignadoId: null,
          fechaResolucion: null,
        },
        'ticket-uuid-001',
        new Date(),
        new Date(),
        new Date(), // deletedAt !== null → soft-deleted
      );
      mockTicketRepo.findById.mockResolvedValue(ticketBorrado);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
      expect(mockTxRunner.run).not.toHaveBeenCalled();
    });
  });

  // ─── Validación del asignado cross-DB (activo=TRUE) ──────────────────────

  describe('validación del asignado cross-DB (activo=TRUE)', () => {
    it('llama a estaActivoEnTenant con asignadoId y clienteId del DTO', async () => {
      await useCase.execute(validDto);

      expect(mockUsuarioChecker.estaActivoEnTenant).toHaveBeenCalledWith(ASIGNADO_ID, CLIENTE_ID);
    });

    it('retorna AsignadoInvalidoError cuando el asignado no existe o no está activo', async () => {
      mockUsuarioChecker.estaActivoEnTenant.mockResolvedValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('ASIGNADO_INVALIDO');
    });

    it('no verifica elegibilidad cuando el asignado falla la validación de activo', async () => {
      mockUsuarioChecker.estaActivoEnTenant.mockResolvedValue(false);

      await useCase.execute(validDto);

      expect(mockUsuarioTiposTicketRepo.isUserEligibleForType).not.toHaveBeenCalled();
    });

    it('no persiste nada cuando el asignado falla la validación cross-DB', async () => {
      mockUsuarioChecker.estaActivoEnTenant.mockResolvedValue(false);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Validación de elegibilidad (usuario_tipos_ticket) ─────────────────────

  describe('validación de elegibilidad (usuario_tipos_ticket)', () => {
    it('llama a isUserEligibleForType con asignadoId y el tipoId del ticket', async () => {
      await useCase.execute(validDto);

      expect(mockUsuarioTiposTicketRepo.isUserEligibleForType).toHaveBeenCalledWith(
        ASIGNADO_ID,
        TIPO_TICKET_ID,
      );
    });

    it('retorna AsignadoNoElegibleError (422) cuando el asignado no tiene elegibilidad', async () => {
      mockUsuarioTiposTicketRepo.isUserEligibleForType.mockResolvedValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('ASIGNADO_NO_ELEGIBLE');
    });

    it('no persiste nada cuando la elegibilidad falla', async () => {
      mockUsuarioTiposTicketRepo.isUserEligibleForType.mockResolvedValue(false);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Operacion ASIGNACION ──────────────────────────────────────────────────

  describe('operación ASIGNACION en el timeline', () => {
    it('resuelve el tipo de operación ASIGNACION del catálogo', async () => {
      await useCase.execute(validDto);

      expect(mockTipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('ASIGNACION');
    });

    it('retorna TipoOperacionNoEncontradoError cuando ASIGNACION no está en el catálogo', async () => {
      mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_OPERACION_NO_ENCONTRADO');
    });

    it('crea la operacion con el tipoOperacionId de ASIGNACION', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0];
      expect(savedOperacion.tipoOperacionId).toBe(TIPO_OPERACION_ASIGNACION_ID);
    });

    it('crea la operacion con el ticketId correcto', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0];
      expect(savedOperacion.ticketId).toBe(TICKET_ID);
    });

    it('crea la operacion con el autorId del DTO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0];
      expect(savedOperacion.autorId).toBe(AUTOR_ID);
    });

    it('la operacion tiene estadoAnteriorId y estadoNuevoId nulos (no es cambio de estado)', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0];
      expect(savedOperacion.estadoAnteriorId).toBeNull();
      expect(savedOperacion.estadoNuevoId).toBeNull();
    });
  });

  // ─── Actualización del ticket ─────────────────────────────────────────────

  describe('actualización del ticket', () => {
    it('llama ticket.assignTo con el asignadoId del DTO', async () => {
      const ticket = makeTicket();
      const assignToSpy = jest.spyOn(ticket, 'assignTo');
      mockTicketRepo.findById.mockResolvedValue(ticket);

      await useCase.execute(validDto);

      expect(assignToSpy).toHaveBeenCalledWith(ASIGNADO_ID);
    });

    it('el ticket persistido tiene asignadoId actualizado', async () => {
      await useCase.execute(validDto);

      const savedTicket = mockTicketRepo.save.mock.calls[0][0];
      expect(savedTicket.asignadoId).toBe(ASIGNADO_ID);
    });
  });

  // ─── Transacción atómica ──────────────────────────────────────────────────

  describe('transacción atómica vía TenantTransactionRunner', () => {
    it('ejecuta save de ticket y operacion dentro del txRunner', async () => {
      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ticket y operacion se persisten DENTRO del callback del runner', async () => {
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

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el ticket actualizado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el ticket retornado tiene asignadoId actualizado al del DTO', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().asignadoId).toBe(ASIGNADO_ID);
    });
  });
});
