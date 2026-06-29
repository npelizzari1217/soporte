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
import { FechaResolucionRequeridaError } from '../../domain/errors/tickets.errors';

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
      fechaResolucion: null,
    },
    'ticket-uuid-001',
    new Date(),
    new Date(),
    softDeleted ? new Date() : null,
  );
}

function makeResueltoTicket(): TicketEntity {
  // Ticket actualmente en estado RESUELTO con fechaResolucion seteada.
  return TicketEntity.reconstitute(
    {
      numero: 'SOP-2026-00002',
      titulo: 'Ticket resuelto',
      descripcion: null,
      tipoId: TIPO_TICKET_ID,
      estadoId: ESTADO_RESUELTO_ID,
      prioridadId: 'prio-001',
      cicloId: null,
      solicitanteId: 'user-solicitante',
      asignadoId: null,
      fechaResolucion: new Date('2026-06-20'),
    },
    'ticket-uuid-002',
    new Date(),
    new Date(),
    null,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const ESTADO_ABIERTO_ID = 'estado-abierto-uuid';
const ESTADO_EN_PROGRESO_ID = 'estado-en-progreso-uuid';
const ESTADO_RESUELTO_ID = 'estado-resuelto-uuid';
const TIPO_TICKET_ID = 'tipo-ticket-uuid';
const TIPO_OPERACION_CAMBIO_ESTADO_ID = 'tipo-op-cambio-uuid';
const AUTOR_ID = 'user-autor-uuid';

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('TransicionarEstadoUseCase', () => {
  let ticketRepo: vi.Mocked<ITicketRepository>;
  let operacionRepo: vi.Mocked<IOperacionTicketRepository>;
  let estadoRepo: vi.Mocked<IEstadoRepository>;
  let tipoTicketRepo: vi.Mocked<ITipoTicketRepository>;
  let tipoOperacionRepo: vi.Mocked<ITipoOperacionRepository>;
  let factory: Pick<TicketStateMachineFactory, 'resolve'>;
  let mockMachine: vi.Mocked<ITicketStateMachine>;
  let txRunner: ITenantTransactionRunner;
  let useCase: TransicionarEstadoUseCase;

  const validDto: TransicionarEstadoDto = {
    ticketId: 'ticket-uuid-001',
    nuevoEstadoCodigo: 'EN_PROGRESO',
    autorId: AUTOR_ID,
  };

  beforeEach(() => {
    ticketRepo = {
      findById: vi.fn(),
      findByNumero: vi.fn(),
      findLastSecuencia: vi.fn(),
      findAll: vi.fn(),
      findByEstado: vi.fn(),
      save: vi.fn<Promise<void>, [TicketEntity]>(),
      delete: vi.fn(),
    };

    operacionRepo = {
      findByTicketId: vi.fn(),
      save: vi.fn<Promise<void>, [OperacionTicketEntity]>(),
    };

    estadoRepo = {
      findById: vi.fn(),
      findByCodigo: vi.fn(),
      findAllActive: vi.fn(),
      findAll: vi.fn(),
    };

    tipoTicketRepo = { findCodigoById: vi.fn() };
    tipoOperacionRepo = { findIdByCodigo: vi.fn() };

    mockMachine = { puedeTransicionar: vi.fn() };
    factory = { resolve: vi.fn().mockReturnValue(mockMachine) };

    txRunner = {
      run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
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

      (txRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
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

  // ─── PR3: fechaResolucion OBLIGATORIA al pasar a RESUELTO (ADR-4) ─────────────

  describe('fechaResolucion — obligatoriedad y reapertura (ADR-4)', () => {
    // T3.4 — RED: estos tests fallan hasta que se implemente la lógica en T3.5

    describe('transición a RESUELTO SIN fechaResolucion', () => {
      const dtoAResueltoSinFecha: TransicionarEstadoDto = {
        ticketId: 'ticket-uuid-001',
        nuevoEstadoCodigo: 'RESUELTO',
        autorId: AUTOR_ID,
      };

      beforeEach(() => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
      });

      it('retorna fail con FechaResolucionRequeridaError', async () => {
        const result = await useCase.execute(dtoAResueltoSinFecha);

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(FechaResolucionRequeridaError);
        expect(result.getError().code).toBe('FECHA_RESOLUCION_REQUERIDA');
      });

      it('el ticket NO es mutado (estadoId permanece invariante)', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(dtoAResueltoSinFecha);

        expect(ticket.estadoId).toBe(ESTADO_ABIERTO_ID);
        expect(ticket.fechaResolucion).toBeNull();
      });

      it('ticketRepo.save NO es llamado', async () => {
        await useCase.execute(dtoAResueltoSinFecha);

        expect(ticketRepo.save).not.toHaveBeenCalled();
        expect(operacionRepo.save).not.toHaveBeenCalled();
      });
    });

    describe('transición a RESUELTO CON fechaResolucion', () => {
      const fechaResolucion = new Date('2026-06-28');
      const dtoAResueltoConFecha: TransicionarEstadoDto = {
        ticketId: 'ticket-uuid-001',
        nuevoEstadoCodigo: 'RESUELTO',
        autorId: AUTOR_ID,
        fechaResolucion,
      };

      beforeEach(() => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
      });

      it('retorna Result.ok', async () => {
        const result = await useCase.execute(dtoAResueltoConFecha);

        expect(result.isOk()).toBe(true);
      });

      it('ticket.fechaResolucion queda seteada con la fecha provista', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(dtoAResueltoConFecha);

        expect(ticket.fechaResolucion).toBe(fechaResolucion);
      });

      it('ticketRepo.save y operacionRepo.save son llamados', async () => {
        await useCase.execute(dtoAResueltoConFecha);

        expect(ticketRepo.save).toHaveBeenCalledTimes(1);
        expect(operacionRepo.save).toHaveBeenCalledTimes(1);
      });
    });

    describe('reapertura desde RESUELTO (RESUELTO → EN_PROGRESO)', () => {
      const dtoReapertura: TransicionarEstadoDto = {
        ticketId: 'ticket-uuid-002',
        nuevoEstadoCodigo: 'EN_PROGRESO',
        autorId: AUTOR_ID,
      };

      beforeEach(() => {
        ticketRepo.findById.mockResolvedValue(makeResueltoTicket());
        estadoRepo.findById.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_EN_PROGRESO_ID, 'EN_PROGRESO'));
      });

      it('ticket.fechaResolucion queda null después de la reapertura', async () => {
        const ticket = makeResueltoTicket();
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(dtoReapertura);

        expect(ticket.fechaResolucion).toBeNull();
      });

      it('retorna Result.ok', async () => {
        const result = await useCase.execute(dtoReapertura);

        expect(result.isOk()).toBe(true);
      });
    });

    describe('transición normal SIN involucrar RESUELTO (ABIERTO → EN_PROGRESO)', () => {
      it('setFechaResolucion NO es llamado (no se toca fechaResolucion)', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        const setFechaResolucionSpy = vi.spyOn(ticket, 'setFechaResolucion');
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(validDto); // ABIERTO → EN_PROGRESO

        expect(setFechaResolucionSpy).not.toHaveBeenCalled();
      });
    });
  });
});
