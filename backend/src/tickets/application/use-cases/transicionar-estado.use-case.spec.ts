import { TransicionarEstadoDto, TransicionarEstadoUseCase } from './transicionar-estado.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { ITicketStateMachine } from '../../domain/state-machine/i-ticket-state-machine';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';

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

function makeTicket(estadoId: string, tipoId: string, softDeleted = false): TicketEntity {
  return TicketEntity.reconstitute(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de test',
      descripcion: null,
      tipoId,
      estadoId,
      prioridadId: 'prio-001',
      cicloId: null,
      solicitanteId: 'user-solicitante',
      asignadoId: null,
      fechaVencimiento: null,
    },
    'ticket-uuid-001',
    new Date(),
    new Date(),
    softDeleted ? new Date() : null,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const ESTADO_ABIERTO_ID = 'estado-abierto-uuid';
const ESTADO_EN_PROGRESO_ID = 'estado-en-progreso-uuid';
const TIPO_TICKET_ID = 'tipo-ticket-uuid';
const TIPO_OPERACION_CAMBIO_ESTADO_ID = 'tipo-op-cambio-uuid';
const AUTOR_ID = 'user-autor-uuid';

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('TransicionarEstadoUseCase', () => {
  let ticketRepo: jest.Mocked<ITicketRepository>;
  let operacionRepo: jest.Mocked<IOperacionTicketRepository>;
  let estadoRepo: jest.Mocked<IEstadoRepository>;
  let tipoTicketRepo: jest.Mocked<ITipoTicketRepository>;
  let tipoOperacionRepo: jest.Mocked<ITipoOperacionRepository>;
  let factory: Pick<TicketStateMachineFactory, 'resolve'>;
  let mockMachine: jest.Mocked<ITicketStateMachine>;
  let txRunner: ITenantTransactionRunner;
  let useCase: TransicionarEstadoUseCase;

  const validDto: TransicionarEstadoDto = {
    ticketId: 'ticket-uuid-001',
    nuevoEstadoCodigo: 'EN_PROGRESO',
    autorId: AUTOR_ID,
  };

  beforeEach(() => {
    ticketRepo = {
      findById: jest.fn(),
      findByNumero: jest.fn(),
      findLastSecuencia: jest.fn(),
      findAll: jest.fn(),
      findByEstado: jest.fn(),
      save: jest.fn<Promise<void>, [TicketEntity]>(),
      delete: jest.fn(),
    };

    operacionRepo = {
      findByTicketId: jest.fn(),
      save: jest.fn<Promise<void>, [OperacionTicketEntity]>(),
    };

    estadoRepo = {
      findById: jest.fn(),
      findByCodigo: jest.fn(),
      findAllActive: jest.fn(),
      findAll: jest.fn(),
    };

    tipoTicketRepo = { findCodigoById: jest.fn() };
    tipoOperacionRepo = { findIdByCodigo: jest.fn() };

    mockMachine = { puedeTransicionar: jest.fn() };
    factory = { resolve: jest.fn().mockReturnValue(mockMachine) };

    txRunner = {
      run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    };

    // Default happy-path mocks
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID));
    estadoRepo.findById.mockResolvedValue(makeEstado(ESTADO_ABIERTO_ID, 'ABIERTO'));
    estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_EN_PROGRESO_ID, 'EN_PROGRESO'));
    tipoTicketRepo.findCodigoById.mockResolvedValue('SOPORTE');
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    mockMachine.puedeTransicionar.mockReturnValue(true);
    ticketRepo.save.mockResolvedValue(undefined);
    operacionRepo.save.mockResolvedValue(undefined);

    useCase = new TransicionarEstadoUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      factory,
      txRunner,
    );
  });

  // ─── Ticket no encontrado ─────────────────────────────────────────────────────

  describe('ticket no encontrado', () => {
    it('retorna fail con TicketNoEncontradoError cuando el ticket no existe', async () => {
      ticketRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TICKET_NO_ENCONTRADO');
    });

    it('busca el ticket por el ticketId del DTO', async () => {
      await useCase.execute(validDto);

      expect(ticketRepo.findById).toHaveBeenCalledWith('ticket-uuid-001');
    });
  });

  // ─── Resolución de estados ────────────────────────────────────────────────────

  describe('resolución de estados', () => {
    it('busca el estado actual usando el estadoId almacenado en el ticket', async () => {
      await useCase.execute(validDto);

      expect(estadoRepo.findById).toHaveBeenCalledWith(ESTADO_ABIERTO_ID);
    });

    it('retorna fail cuando el estado actual no se encuentra en el catálogo', async () => {
      estadoRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('ESTADO_CATALOGO_NO_ENCONTRADO');
    });

    it('busca el estado destino por el código del DTO', async () => {
      await useCase.execute(validDto);

      expect(estadoRepo.findByCodigo).toHaveBeenCalledWith('EN_PROGRESO');
    });

    it('retorna fail con EstadoDestinoInvalidoError cuando el nuevoEstadoCodigo no existe', async () => {
      // CRITICAL-1 fix: código enviado por el usuario no existe → ESTADO_DESTINO_INVALIDO (422)
      // distinto de ESTADO_CATALOGO_NO_ENCONTRADO (estadoId corrupto en DB → 500).
      estadoRepo.findByCodigo.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('ESTADO_DESTINO_INVALIDO');
    });
  });

  // ─── Invariante de entidad (ticket soft-deleted) ──────────────────────────────

  describe('invariante de entidad', () => {
    it('retorna fail con TransicionInvalidaError cuando el ticket está soft-deleted', async () => {
      ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID, true));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TRANSICION_INVALIDA');
    });

    it('no llama a la máquina de estados cuando la entidad rechaza la transición', async () => {
      ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID, true));

      await useCase.execute(validDto);

      expect(mockMachine.puedeTransicionar).not.toHaveBeenCalled();
    });
  });

  // ─── Routing a la máquina de estados ─────────────────────────────────────────

  describe('routing a la máquina de estados vía factory', () => {
    it('resuelve el tipoCodigo del ticket usando tipoTicketRepo', async () => {
      await useCase.execute(validDto);

      expect(tipoTicketRepo.findCodigoById).toHaveBeenCalledWith(TIPO_TICKET_ID);
    });

    it('llama al factory con el tipoCodigo resuelto', async () => {
      await useCase.execute(validDto);

      expect(factory.resolve).toHaveBeenCalledWith('SOPORTE');
    });

    it('llama a puedeTransicionar con los códigos de estado correctos', async () => {
      await useCase.execute(validDto);

      expect(mockMachine.puedeTransicionar).toHaveBeenCalledWith(
        'ABIERTO',
        'EN_PROGRESO',
        expect.any(Object),
      );
    });
  });

  // ─── Tipo de ticket no encontrado ────────────────────────────────────────────

  describe('tipo de ticket no encontrado (inconsistencia de datos)', () => {
    beforeEach(() => {
      tipoTicketRepo.findCodigoById.mockResolvedValue(null);
    });

    it('retorna fail con TipoTicketNoEncontradoError cuando findCodigoById retorna null', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_TICKET_NO_ENCONTRADO');
    });

    it('NO llama al factory cuando el tipoCodigo no resuelve', async () => {
      await useCase.execute(validDto);

      expect(factory.resolve).not.toHaveBeenCalled();
    });

    it('NO llama a puedeTransicionar cuando el tipoCodigo no resuelve', async () => {
      await useCase.execute(validDto);

      expect(mockMachine.puedeTransicionar).not.toHaveBeenCalled();
    });

    it('NO modifica el estadoId del ticket cuando el tipoCodigo no resuelve', async () => {
      const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
      ticketRepo.findById.mockResolvedValue(ticket);

      await useCase.execute(validDto);

      expect(ticket.estadoId).toBe(ESTADO_ABIERTO_ID);
    });

    it('NO persiste nada cuando el tipoCodigo no resuelve', async () => {
      await useCase.execute(validDto);

      expect(ticketRepo.save).not.toHaveBeenCalled();
      expect(operacionRepo.save).not.toHaveBeenCalled();
      expect(txRunner.run).not.toHaveBeenCalled();
    });
  });

  // ─── Transición inválida (máquina de estados rechaza) ────────────────────────

  describe('transición inválida — la máquina de estados rechaza', () => {
    beforeEach(() => {
      mockMachine.puedeTransicionar.mockReturnValue(false);
    });

    it('retorna Result.fail con TransicionInvalidaError', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TRANSICION_INVALIDA');
    });

    it('NO actualiza el estadoId del ticket', async () => {
      const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
      ticketRepo.findById.mockResolvedValue(ticket);

      await useCase.execute(validDto);

      expect(ticket.estadoId).toBe(ESTADO_ABIERTO_ID);
    });

    it('NO persiste operacion_ticket', async () => {
      await useCase.execute(validDto);

      expect(operacionRepo.save).not.toHaveBeenCalled();
    });

    it('NO llama al TenantTransactionRunner', async () => {
      await useCase.execute(validDto);

      expect(txRunner.run).not.toHaveBeenCalled();
    });

    it('NO persiste el ticket', async () => {
      await useCase.execute(validDto);

      expect(ticketRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Transición válida ────────────────────────────────────────────────────────

  describe('transición válida', () => {
    it('actualiza el estadoId del ticket al nuevo estado', async () => {
      const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
      ticketRepo.findById.mockResolvedValue(ticket);

      await useCase.execute(validDto);

      expect(ticket.estadoId).toBe(ESTADO_EN_PROGRESO_ID);
    });

    it('crea una operacion CAMBIO_ESTADO con estadoAnteriorId y estadoNuevoId correctos', async () => {
      await useCase.execute(validDto);

      const savedOperacion = operacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.estadoAnteriorId).toBe(ESTADO_ABIERTO_ID);
      expect(savedOperacion.estadoNuevoId).toBe(ESTADO_EN_PROGRESO_ID);
    });

    it('la operacion usa el tipo_operacion_id de CAMBIO_ESTADO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = operacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.tipoOperacionId).toBe(TIPO_OPERACION_CAMBIO_ESTADO_ID);
    });

    it('la operacion referencia al ticket correcto', async () => {
      await useCase.execute(validDto);

      const savedOperacion = operacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.ticketId).toBe('ticket-uuid-001');
    });

    it('la operacion lleva el autorId del DTO', async () => {
      await useCase.execute(validDto);

      const savedOperacion = operacionRepo.save.mock.calls[0][0] as any;
      expect(savedOperacion.autorId).toBe(AUTOR_ID);
    });

    it('resuelve el id de CAMBIO_ESTADO del catálogo tipo_operacion', async () => {
      await useCase.execute(validDto);

      expect(tipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('CAMBIO_ESTADO');
    });

    it('guarda ticket y operacion dentro del TenantTransactionRunner', async () => {
      await useCase.execute(validDto);

      expect(txRunner.run).toHaveBeenCalledTimes(1);
      expect(ticketRepo.save).toHaveBeenCalledTimes(1);
      expect(operacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ticket.save y operacion.save ocurren DENTRO del callback del runner', async () => {
      const callOrder: string[] = [];

      (txRunner.run as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      ticketRepo.save.mockImplementation(() => {
        callOrder.push('ticket:save');
        return Promise.resolve();
      });
      operacionRepo.save.mockImplementation(() => {
        callOrder.push('operacion:save');
        return Promise.resolve();
      });

      await useCase.execute(validDto);

      const txStart = callOrder.indexOf('tx:start');
      const txEnd = callOrder.indexOf('tx:end');
      expect(txStart).toBeLessThan(callOrder.indexOf('ticket:save'));
      expect(txStart).toBeLessThan(callOrder.indexOf('operacion:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('ticket:save'));
      expect(txEnd).toBeGreaterThan(callOrder.indexOf('operacion:save'));
    });

    it('retorna Result.ok con el ticket actualizado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().estadoId).toBe(ESTADO_EN_PROGRESO_ID);
    });

    it('retorna fail con TipoOperacionNoEncontradoError cuando CAMBIO_ESTADO no está en catálogo', async () => {
      tipoOperacionRepo.findIdByCodigo.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_OPERACION_NO_ENCONTRADO');
    });
  });
});
