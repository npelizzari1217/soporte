import { EnviarAAprobacionUseCase, EnviarAAprobacionDto } from './enviar-a-aprobacion.use-case';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { IItemCompraRepository } from '../../domain/ports/i-item-compra.repository';
import { TicketStateMachineFactory } from '../../../tickets/domain/state-machine/ticket-state-machine.factory';
import { ITicketStateMachine } from '../../../tickets/domain/state-machine/i-ticket-state-machine';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';

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

function makeTicket(estadoId: string, id = 'ticket-001', deleted = false): TicketEntity {
  const t = TicketEntity.reconstitute(
    {
      numero: 'COM-2026-00001',
      titulo: 'Compra test',
      descripcion: null,
      tipoId: TIPO_COMPRAS_ID,
      estadoId,
      prioridadId: 'prioridad-001',
      cicloId: null,
      solicitanteId: 'solicitante-001',
      asignadoId: null,
      fechaVencimiento: null,
    },
    id,
    new Date(),
    new Date(),
    deleted ? new Date() : null,
  );
  return t;
}

function makeTicketCompra(ticketId: string, id = 'ticket-compra-001'): TicketCompraEntity {
  return TicketCompraEntity.create(ticketId, id);
}

function makeItem(id: string): ItemCompraEntity {
  return ItemCompraEntity.reconstitute(
    {
      ticketCompraId: 'ticket-compra-001',
      descripcion: 'Resmas de papel A4',
      cantidad: 10,
      unidad: 'unidad',
      precioUnitarioRef: null,
      observaciones: null,
    },
    id,
    new Date(),
    new Date(),
    null,
  );
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPO_COMPRAS_ID = 'e0000000-0000-4000-e000-000000000002';
const ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const ESTADO_PENDIENTE_ID = 'c0000000-0000-4000-c000-000000000002';
const TIPO_OPERACION_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';

const validDto: EnviarAAprobacionDto = {
  ticketId: 'ticket-001',
  autorId: 'user-autor-001',
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('EnviarAAprobacionUseCase', () => {
  let useCase: EnviarAAprobacionUseCase;

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

  const mockTipoTicketRepo = {
    findCodigoById: jest.fn<Promise<string | null>, [string]>(),
  } satisfies jest.Mocked<ITipoTicketRepository>;

  const mockTipoOperacionRepo = {
    findIdByCodigo: jest.fn<Promise<string | null>, [string]>(),
  } satisfies jest.Mocked<ITipoOperacionRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  const mockTicketCompraRepo = {
    findByTicketId: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketCompraRepository>;

  const mockItemCompraRepo = {
    findById: jest.fn(),
    findByTicketCompraId: jest.fn(),
    findActiveByTicketCompraId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } satisfies jest.Mocked<IItemCompraRepository>;

  const mockMachine: jest.Mocked<ITicketStateMachine> = {
    puedeTransicionar: jest.fn<boolean, [string, string, any]>(),
  };

  const mockFactory: Pick<TicketStateMachineFactory, 'resolve'> = {
    resolve: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path mocks
    const ticket = makeTicket(ESTADO_ABIERTO_ID);
    const ticketCompra = makeTicketCompra(ticket.id);

    mockTicketRepo.findById.mockResolvedValue(ticket);
    mockTicketCompraRepo.findByTicketId.mockResolvedValue(ticketCompra);
    mockItemCompraRepo.findActiveByTicketCompraId.mockResolvedValue([makeItem('item-001')]);
    mockEstadoRepo.findById.mockResolvedValue(makeEstado(ESTADO_ABIERTO_ID, 'ABIERTO'));
    mockEstadoRepo.findByCodigo.mockResolvedValue(
      makeEstado(ESTADO_PENDIENTE_ID, 'PENDIENTE_APROBACION'),
    );
    mockTipoTicketRepo.findCodigoById.mockResolvedValue('COMPRAS');
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    mockMachine.puedeTransicionar.mockReturnValue(true);
    (mockFactory.resolve as jest.Mock).mockReturnValue(mockMachine);
    mockTicketRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new EnviarAAprobacionUseCase(
      mockTicketRepo,
      mockTicketCompraRepo,
      mockItemCompraRepo,
      mockOperacionRepo,
      mockEstadoRepo,
      mockTipoTicketRepo,
      mockTipoOperacionRepo,
      mockFactory,
      mockTxRunner,
    );
  });

  // ─── Ticket not found / deleted ───────────────────────────────────────────────

  describe('ticket not found o eliminado', () => {
    it('retorna fallo si el ticket no existe', async () => {
      mockTicketRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
    });

    it('retorna fallo si el ticket está eliminado (soft delete)', async () => {
      mockTicketRepo.findById.mockResolvedValue(makeTicket(ESTADO_ABIERTO_ID, 'ticket-001', true));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
    });
  });

  // ─── Ticket_compra satélite ───────────────────────────────────────────────────

  describe('ticket_compra satélite', () => {
    it('retorna fallo si no existe ticket_compra para el ticket', async () => {
      mockTicketCompraRepo.findByTicketId.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_COMPRA_NO_ENCONTRADO');
    });
  });

  // ─── Ítems activos ────────────────────────────────────────────────────────────

  describe('ítems activos', () => {
    it('retorna fallo si no hay ítems activos (lista vacía)', async () => {
      mockItemCompraRepo.findActiveByTicketCompraId.mockResolvedValue([]);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('SIN_ITEMS_ACTIVOS');
    });

    it('llama a findActiveByTicketCompraId con el id del ticket_compra', async () => {
      const ticketCompra = makeTicketCompra('ticket-001', 'ticket-compra-001');
      mockTicketCompraRepo.findByTicketId.mockResolvedValue(ticketCompra);

      await useCase.execute(validDto);

      expect(mockItemCompraRepo.findActiveByTicketCompraId).toHaveBeenCalledWith(
        'ticket-compra-001',
      );
    });
  });

  // ─── Transición de estado ─────────────────────────────────────────────────────

  describe('transición ABIERTO → PENDIENTE_APROBACION', () => {
    it('retorna fallo si la máquina de estados rechaza la transición', async () => {
      mockMachine.puedeTransicionar.mockReturnValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TRANSICION_INVALIDA');
    });

    it('actualiza estadoId del ticket a PENDIENTE_APROBACION', async () => {
      await useCase.execute(validDto);

      const savedTicket = mockTicketRepo.save.mock.calls[0][0];
      expect(savedTicket.estadoId).toBe(ESTADO_PENDIENTE_ID);
    });

    it('crea operación CAMBIO_ESTADO con estadoAnterior=ABIERTO y estadoNuevo=PENDIENTE_APROBACION', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.estadoAnteriorId).toBe(ESTADO_ABIERTO_ID);
      expect(savedOperacion.estadoNuevoId).toBe(ESTADO_PENDIENTE_ID);
    });

    it('la operacion tiene el tipo CAMBIO_ESTADO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.tipoOperacionId).toBe(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    });

    it('la operacion referencia al ticketId correcto', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.ticketId).toBe('ticket-001');
    });
  });

  // ─── Transacción atómica ──────────────────────────────────────────────────────

  describe('transacción atómica', () => {
    it('persiste ticket y operacion dentro del runner', async () => {
      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ticket y operacion se guardan DENTRO del callback del runner', async () => {
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
      expect(callOrder.indexOf('ticket:save')).toBeGreaterThan(txStart);
      expect(callOrder.indexOf('ticket:save')).toBeLessThan(txEnd);
      expect(callOrder.indexOf('operacion:save')).toBeGreaterThan(txStart);
      expect(callOrder.indexOf('operacion:save')).toBeLessThan(txEnd);
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el ticket actualizado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el ticket retornado tiene estadoId de PENDIENTE_APROBACION', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().estadoId).toBe(ESTADO_PENDIENTE_ID);
    });
  });
});
