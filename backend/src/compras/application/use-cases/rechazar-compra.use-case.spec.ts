import { RechazarCompraUseCase, RechazarCompraDto } from './rechazar-compra.use-case';
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
const ESTADO_RECHAZADO_ID = 'c0000000-0000-4000-c000-000000000004';
const ESTADO_CERRADO_ID = 'c0000000-0000-4000-c000-000000000007';
const TIPO_OPERACION_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';
const APROBADO_POR_ID = 'user-aprobador-001';

const validDto: RechazarCompraDto = {
  ticketId: 'ticket-001',
  aprobadoPorId: APROBADO_POR_ID,
  motivoRechazo: 'El presupuesto supera el límite autorizado.',
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('RechazarCompraUseCase', () => {
  let useCase: RechazarCompraUseCase;
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

    // Default happy-path: ticket en PENDIENTE_APROBACION
    mockTicketRepo.findById.mockResolvedValue(makeTicket(ESTADO_PENDIENTE_ID));
    mockTicketCompraRepo.findByTicketId.mockResolvedValue(
      TicketCompraEntity.create('ticket-001', 'ticket-compra-001'),
    );
    mockEstadoRepo.findById.mockResolvedValue(
      makeEstado(ESTADO_PENDIENTE_ID, 'PENDIENTE_APROBACION'),
    );
    // findByCodigo returns different estados depending on argument
    mockEstadoRepo.findByCodigo.mockImplementation(async (codigo: string) => {
      if (codigo === 'RECHAZADO') return makeEstado(ESTADO_RECHAZADO_ID, 'RECHAZADO');
      if (codigo === 'CERRADO') return makeEstado(ESTADO_CERRADO_ID, 'CERRADO');
      return null;
    });
    mockTipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    mockTipoTicketRepo.findCodigoById.mockResolvedValue('COMPRAS');
    mockTicketRepo.save.mockResolvedValue(undefined);
    mockTicketCompraRepo.save.mockResolvedValue(undefined);
    mockOperacionRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new RechazarCompraUseCase(
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

  // ─── Validación de motivoRechazo ──────────────────────────────────────────────

  describe('validación de motivoRechazo', () => {
    it('retorna fallo si motivoRechazo no se provee (cadena vacía)', async () => {
      const result = await useCase.execute({ ...validDto, motivoRechazo: '' });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('MOTIVO_RECHAZO_REQUERIDO');
    });

    it('retorna fallo si motivoRechazo es solo espacios en blanco', async () => {
      const result = await useCase.execute({ ...validDto, motivoRechazo: '   ' });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('MOTIVO_RECHAZO_REQUERIDO');
    });

    it('no modifica nada si motivoRechazo está vacío', async () => {
      await useCase.execute({ ...validDto, motivoRechazo: '' });

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Delegación a la state machine ───────────────────────────────────────────

  describe('validación vía state machine', () => {
    it('retorna fallo si la máquina rechaza la transición hacia RECHAZADO', async () => {
      mockMachine.puedeTransicionar.mockReturnValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TRANSICION_INVALIDA');
    });

    it('retorna fallo si la máquina rechaza la segunda transición RECHAZADO → CERRADO', async () => {
      // Primera transición (PENDIENTE→RECHAZADO) permitida, segunda (RECHAZADO→CERRADO) bloqueada
      mockMachine.puedeTransicionar
        .mockReturnValueOnce(true) // PENDIENTE_APROBACION → RECHAZADO: permitida
        .mockReturnValueOnce(false); // RECHAZADO → CERRADO: bloqueada

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

    it('evalúa puedeTransicionar para AMBAS transiciones de la doble secuencia', async () => {
      await useCase.execute(validDto);

      expect(mockMachine.puedeTransicionar).toHaveBeenCalledWith(
        'PENDIENTE_APROBACION',
        'RECHAZADO',
        {},
      );
      expect(mockMachine.puedeTransicionar).toHaveBeenCalledWith('RECHAZADO', 'CERRADO', {});
    });

    it('no persiste nada si la máquina rechaza la primera transición', async () => {
      mockMachine.puedeTransicionar.mockReturnValue(false);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
      expect(mockTicketRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Lógica de rechazo y doble transición ────────────────────────────────────

  describe('lógica de rechazo', () => {
    it('setea aprobadoPorId en el ticket_compra', async () => {
      let savedTicketCompra: TicketCompraEntity | undefined;
      mockTicketCompraRepo.save.mockImplementation(async (tc) => {
        savedTicketCompra = tc;
      });

      await useCase.execute(validDto);

      expect(savedTicketCompra!.aprobadoPorId).toBe(APROBADO_POR_ID);
    });

    it('setea motivoRechazo en el ticket_compra', async () => {
      let savedTicketCompra: TicketCompraEntity | undefined;
      mockTicketCompraRepo.save.mockImplementation(async (tc) => {
        savedTicketCompra = tc;
      });

      await useCase.execute(validDto);

      expect(savedTicketCompra!.motivoRechazo).toBe(validDto.motivoRechazo);
    });

    it('setea aprobadoEn en el ticket_compra', async () => {
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
  });

  describe('doble transición RECHAZADO → CERRADO', () => {
    it('crea DOS operaciones de CAMBIO_ESTADO en la misma tx', async () => {
      await useCase.execute(validDto);

      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(2);
    });

    it('la primera operacion es PENDIENTE_APROBACION → RECHAZADO', async () => {
      await useCase.execute(validDto);

      const primeraOp = mockOperacionRepo.save.mock.calls[0][0] as any;
      expect(primeraOp.estadoAnteriorId).toBe(ESTADO_PENDIENTE_ID);
      expect(primeraOp.estadoNuevoId).toBe(ESTADO_RECHAZADO_ID);
    });

    it('la segunda operacion es RECHAZADO → CERRADO', async () => {
      await useCase.execute(validDto);

      const segundaOp = mockOperacionRepo.save.mock.calls[1][0] as any;
      expect(segundaOp.estadoAnteriorId).toBe(ESTADO_RECHAZADO_ID);
      expect(segundaOp.estadoNuevoId).toBe(ESTADO_CERRADO_ID);
    });

    it('el estado final del ticket (persistido) es CERRADO', async () => {
      await useCase.execute(validDto);

      const savedTicket = mockTicketRepo.save.mock.calls[0][0];
      expect(savedTicket.estadoId).toBe(ESTADO_CERRADO_ID);
    });
  });

  // ─── Transacción atómica ──────────────────────────────────────────────────────

  describe('transacción atómica', () => {
    it('persiste ticket + ticketCompra + dos operaciones dentro del runner', async () => {
      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockTicketRepo.save).toHaveBeenCalledTimes(1);
      expect(mockTicketCompraRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOperacionRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con { ticket, ticketCompra }', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().ticket.estadoId).toBe(ESTADO_CERRADO_ID);
      expect(result.getValue().ticketCompra).toBeInstanceOf(TicketCompraEntity);
    });
  });
});
