import { AprobarCompraUseCase, AprobarCompraDto } from './aprobar-compra.use-case';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { TicketStateMachineFactory } from '../../../tickets/domain/state-machine/ticket-state-machine.factory';
import { ITicketStateMachine } from '../../../tickets/domain/state-machine/i-ticket-state-machine';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
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
  return TicketEntity.reconstitute(
    {
      numero: 'COM-2026-00001',
      titulo: 'Compra test',
      descripcion: null,
      tipoId: 'e0000000-0000-4000-e000-000000000002',
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
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADO_PENDIENTE_ID = 'c0000000-0000-4000-c000-000000000002';
const ESTADO_APROBADO_ID = 'c0000000-0000-4000-c000-000000000003';
const TIPO_OPERACION_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';
const APROBADO_POR_ID = 'user-aprobador-001';

const validDto: AprobarCompraDto = {
  ticketId: 'ticket-001',
  aprobadoPorId: APROBADO_POR_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('AprobarCompraUseCase', () => {
  let useCase: AprobarCompraUseCase;
  let mockMachine: jest.Mocked<ITicketStateMachine>;
  let factory: Pick<TicketStateMachineFactory, 'resolve'>;

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

  const mockTipoOperacionRepo = {
    findIdByCodigo: jest.fn<Promise<string | null>, [string]>(),
  } satisfies jest.Mocked<ITipoOperacionRepository>;

  const mockTipoTicketRepo = {
    findCodigoById: jest.fn<Promise<string | null>, [string]>(),
  } satisfies jest.Mocked<ITipoTicketRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  const mockTicketCompraRepo = {
    findByTicketId: jest.fn(),
    findById: jest.fn(),
    save: jest.fn<Promise<void>, [TicketCompraEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<ITicketCompraRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMachine = { puedeTransicionar: jest.fn().mockReturnValue(true) };
    factory = { resolve: jest.fn().mockReturnValue(mockMachine) };

    // Default happy-path mocks: ticket en PENDIENTE_APROBACION
    mockTicketRepo.findById.mockResolvedValue(makeTicket(ESTADO_PENDIENTE_ID));
    mockTicketCompraRepo.findByTicketId.mockResolvedValue(
      TicketCompraEntity.create('ticket-001', 'ticket-compra-001'),
    );
    mockEstadoRepo.findById.mockResolvedValue(
      makeEstado(ESTADO_PENDIENTE_ID, 'PENDIENTE_APROBACION'),
    );
    mockEstadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_APROBADO_ID, 'APROBADO'));
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    mockTipoTicketRepo.findCodigoById.mockResolvedValue('COMPRAS');
    mockTicketRepo.save.mockResolvedValue(undefined);
    mockTicketCompraRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new AprobarCompraUseCase(
      mockTicketRepo,
      mockTicketCompraRepo,
      mockOperacionRepo,
      mockEstadoRepo,
      mockTipoOperacionRepo,
      mockTipoTicketRepo,
      factory,
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
      mockTicketRepo.findById.mockResolvedValue(
        makeTicket(ESTADO_PENDIENTE_ID, 'ticket-001', true),
      );

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
    });
  });

  // ─── Ticket_compra ────────────────────────────────────────────────────────────

  describe('ticket_compra satélite', () => {
    it('retorna fallo si no existe ticket_compra para el ticket', async () => {
      mockTicketCompraRepo.findByTicketId.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_COMPRA_NO_ENCONTRADO');
    });
  });

  // ─── Delegación a la state machine ───────────────────────────────────────────

  describe('validación vía state machine', () => {
    it('retorna fallo si la máquina rechaza la transición hacia APROBADO', async () => {
      mockMachine.puedeTransicionar.mockReturnValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TRANSICION_INVALIDA');
    });

    it('resuelve la máquina con el tipoCodigo del ticket', async () => {
      await useCase.execute(validDto);

      expect(mockTipoTicketRepo.findCodigoById).toHaveBeenCalledWith(
        'e0000000-0000-4000-e000-000000000002',
      );
      expect(factory.resolve).toHaveBeenCalledWith('COMPRAS');
    });

    it('evalúa puedeTransicionar con el estado actual y destino APROBADO', async () => {
      await useCase.execute(validDto);

      expect(mockMachine.puedeTransicionar).toHaveBeenCalledWith(
        'PENDIENTE_APROBACION',
        'APROBADO',
        {},
      );
    });

    it('no persiste nada si la máquina rechaza la transición', async () => {
      mockMachine.puedeTransicionar.mockReturnValue(false);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Lógica de aprobación ─────────────────────────────────────────────────────

  describe('lógica de aprobación', () => {
    it('setea aprobadoPorId en el ticket_compra', async () => {
      let savedTicketCompra: TicketCompraEntity | undefined;
      mockTicketCompraRepo.save.mockImplementation(async (tc) => {
        savedTicketCompra = tc;
      });

      await useCase.execute(validDto);

      expect(savedTicketCompra!.aprobadoPorId).toBe(APROBADO_POR_ID);
    });

    it('setea aprobadoEn en el ticket_compra con fecha actual', async () => {
      const before = new Date();
      let savedTicketCompra: TicketCompraEntity | undefined;
      mockTicketCompraRepo.save.mockImplementation(async (tc) => {
        savedTicketCompra = tc;
      });

      await useCase.execute(validDto);
      const after = new Date();

      expect(savedTicketCompra!.aprobadoEn).toBeInstanceOf(Date);
      expect(savedTicketCompra!.aprobadoEn!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(savedTicketCompra!.aprobadoEn!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('no setea motivoRechazo (queda null)', async () => {
      let savedTicketCompra: TicketCompraEntity | undefined;
      mockTicketCompraRepo.save.mockImplementation(async (tc) => {
        savedTicketCompra = tc;
      });

      await useCase.execute(validDto);

      expect(savedTicketCompra!.motivoRechazo).toBeNull();
    });

    it('transiciona el ticket a estadoId APROBADO', async () => {
      await useCase.execute(validDto);

      const savedTicket = mockTicketRepo.save.mock.calls[0][0];
      expect(savedTicket.estadoId).toBe(ESTADO_APROBADO_ID);
    });

    it('crea operación CAMBIO_ESTADO con estadoAnterior=PENDIENTE_APROBACION y estadoNuevo=APROBADO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.estadoAnteriorId).toBe(ESTADO_PENDIENTE_ID);
      expect(savedOperacion.estadoNuevoId).toBe(ESTADO_APROBADO_ID);
    });

    it('la operacion usa el tipo CAMBIO_ESTADO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.tipoOperacionId).toBe(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    });
  });

  // ─── Transacción atómica ──────────────────────────────────────────────────────

  describe('transacción atómica', () => {
    it('persiste ticket + ticketCompra + operacion dentro del runner', async () => {
      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
      expect(mockTicketCompraRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('los tres saves ocurren DENTRO del callback del runner', async () => {
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
      mockTicketCompraRepo.save.mockImplementation(() => {
        callOrder.push('ticketCompra:save');
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
      expect(callOrder.indexOf('ticketCompra:save')).toBeGreaterThan(txStart);
      expect(callOrder.indexOf('ticketCompra:save')).toBeLessThan(txEnd);
      expect(callOrder.indexOf('operacion:save')).toBeGreaterThan(txStart);
      expect(callOrder.indexOf('operacion:save')).toBeLessThan(txEnd);
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con { ticket, ticketCompra }', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().ticket.estadoId).toBe(ESTADO_APROBADO_ID);
      expect(result.getValue().ticketCompra).toBeInstanceOf(TicketCompraEntity);
    });
  });
});
