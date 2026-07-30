import { TransicionarEstadoDto, TransicionarEstadoUseCase } from './transicionar-estado.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { ITicketStateMachine } from '../../domain/state-machine/i-ticket-state-machine';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';
import {
  FechaCierreRequeridaError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';

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
      fechaCierre: null,
    },
    'ticket-uuid-001',
    new Date(),
    new Date(),
    softDeleted ? new Date() : null,
  );
}

function makeResueltoTicket(): TicketEntity {
  // Ticket actualmente en estado RESUELTO con fechaCierre seteada.
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
      fechaCierre: new Date('2026-06-20'),
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
  let publisher: vi.Mocked<IDomainEventPublisher>;
  let logger: vi.Mocked<ILogger>;
  let useCase: TransicionarEstadoUseCase;

  const CLIENTE_ID = 'cliente-uuid-tenant-a';

  const validDto: TransicionarEstadoDto = {
    ticketId: 'ticket-uuid-001',
    nuevoEstadoCodigo: 'EN_PROGRESO',
    autorId: AUTOR_ID,
    clienteId: CLIENTE_ID,
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

    publisher = { publish: vi.fn() };

    logger = { error: vi.fn() };

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
      publisher,
      logger,
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

  // ─── PR3: fechaCierre OBLIGATORIA al pasar a RESUELTO (ADR-4) ─────────────

  describe('fechaCierre — obligatoriedad y reapertura (ADR-4)', () => {
    // T3.4 — RED: estos tests fallan hasta que se implemente la lógica en T3.5

    describe('transición a RESUELTO SIN fechaCierre', () => {
      const dtoAResueltoSinFecha: TransicionarEstadoDto = {
        ticketId: 'ticket-uuid-001',
        nuevoEstadoCodigo: 'RESUELTO',
        autorId: AUTOR_ID,
        clienteId: CLIENTE_ID,
      };

      beforeEach(() => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
      });

      it('retorna fail con FechaCierreRequeridaError', async () => {
        const result = await useCase.execute(dtoAResueltoSinFecha);

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(FechaCierreRequeridaError);
        expect(result.getError().code).toBe('FECHA_CIERRE_REQUERIDA');
      });

      it('el ticket NO es mutado (estadoId permanece invariante)', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(dtoAResueltoSinFecha);

        expect(ticket.estadoId).toBe(ESTADO_ABIERTO_ID);
        expect(ticket.fechaCierre).toBeNull();
      });

      it('ticketRepo.save NO es llamado', async () => {
        await useCase.execute(dtoAResueltoSinFecha);

        expect(ticketRepo.save).not.toHaveBeenCalled();
        expect(operacionRepo.save).not.toHaveBeenCalled();
      });
    });

    describe('transición a RESUELTO CON fechaCierre', () => {
      const fechaCierre = new Date('2026-06-28');
      const dtoAResueltoConFecha: TransicionarEstadoDto = {
        ticketId: 'ticket-uuid-001',
        nuevoEstadoCodigo: 'RESUELTO',
        autorId: AUTOR_ID,
        clienteId: CLIENTE_ID,
        fechaCierre,
      };

      beforeEach(() => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
      });

      it('retorna Result.ok', async () => {
        const result = await useCase.execute(dtoAResueltoConFecha);

        expect(result.isOk()).toBe(true);
      });

      it('ticket.fechaCierre queda seteada con la fecha provista', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(dtoAResueltoConFecha);

        expect(ticket.fechaCierre).toBe(fechaCierre);
      });

      it('ticketRepo.save y operacionRepo.save son llamados', async () => {
        await useCase.execute(dtoAResueltoConFecha);

        expect(ticketRepo.save).toHaveBeenCalledTimes(1);
        expect(operacionRepo.save).toHaveBeenCalledTimes(1);
      });
    });

    describe('reapertura desde RESUELTO (RESUELTO → EN_PROGRESO) — ELIMINADA (ADR-1)', () => {
      // ADR-1: RESUELTO es ahora estado TERMINAL. El arco RESUELTO→EN_PROGRESO (reapertura)
      // ha sido eliminado del diagrama base. Cualquier intento de reabrir un ticket RESUELTO
      // debe ser rechazado por la invariante de entidad (canTransitionTo) antes de llegar
      // a la máquina de estados.
      // Change: tickets-maquina-estados-observaciones / PR1

      const dtoReapertura: TransicionarEstadoDto = {
        ticketId: 'ticket-uuid-002',
        nuevoEstadoCodigo: 'EN_PROGRESO',
        autorId: AUTOR_ID,
        clienteId: CLIENTE_ID,
      };

      beforeEach(() => {
        ticketRepo.findById.mockResolvedValue(makeResueltoTicket());
        estadoRepo.findById.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_EN_PROGRESO_ID, 'EN_PROGRESO'));
      });

      it('retorna TransicionInvalidaError (RESUELTO es terminal — reapertura dead code)', async () => {
        const result = await useCase.execute(dtoReapertura);

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
      });

      it('no modifica el ticket ni llama a save cuando la reapertura es rechazada', async () => {
        const ticket = makeResueltoTicket();
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(dtoReapertura);

        expect(ticketRepo.save).not.toHaveBeenCalled();
        expect(operacionRepo.save).not.toHaveBeenCalled();
        // fechaCierre no debe cambiar — la transición fue rechazada antes de tocar el ticket
        expect(ticket.fechaCierre).not.toBeNull();
      });
    });

    describe('transición a SIN_SOLUCION → setFechaCierre auto-now (ADR-6)', () => {
      const ESTADO_SIN_SOLUCION_ID = 'estado-sin-solucion-uuid';

      beforeEach(() => {
        estadoRepo.findByCodigo.mockResolvedValue(
          makeEstado(ESTADO_SIN_SOLUCION_ID, 'SIN_SOLUCION'),
        );
      });

      it('retorna Result.ok', async () => {
        const result = await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'SIN_SOLUCION',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
        });

        expect(result.isOk()).toBe(true);
      });

      it('ticket.fechaCierre queda seteada a una Date (now servidor)', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);
        const antes = new Date();

        await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'SIN_SOLUCION',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
        });

        expect(ticket.fechaCierre).toBeInstanceOf(Date);
        expect((ticket.fechaCierre as Date).getTime()).toBeGreaterThanOrEqual(antes.getTime());
      });

      it('setFechaCierre es llamado UNA vez', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);
        const spy = vi.spyOn(ticket, 'setFechaCierre');

        await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'SIN_SOLUCION',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
        });

        expect(spy).toHaveBeenCalledOnce();
      });
    });

    describe('transición a RECHAZADO → setFechaCierre auto-now (ADR-6)', () => {
      const ESTADO_RECHAZADO_ID = 'estado-rechazado-uuid';

      beforeEach(() => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RECHAZADO_ID, 'RECHAZADO'));
      });

      it('retorna Result.ok', async () => {
        const result = await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'RECHAZADO',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
        });

        expect(result.isOk()).toBe(true);
      });

      it('ticket.fechaCierre queda seteada a una Date (now servidor)', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);
        const antes = new Date();

        await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'RECHAZADO',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
        });

        expect(ticket.fechaCierre).toBeInstanceOf(Date);
        expect((ticket.fechaCierre as Date).getTime()).toBeGreaterThanOrEqual(antes.getTime());
      });

      it('setFechaCierre es llamado UNA vez', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);
        const spy = vi.spyOn(ticket, 'setFechaCierre');

        await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'RECHAZADO',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
        });

        expect(spy).toHaveBeenCalledOnce();
      });
    });

    describe('transición normal SIN involucrar estados terminales (ABIERTO → EN_PROGRESO via mock machine)', () => {
      // El mockMachine.puedeTransicionar devuelve true por defecto (beforeEach).
      // Este test verifica que setFechaCierre NO se llama en transiciones no terminales.
      it('setFechaCierre NO es llamado (no se toca fechaCierre)', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        const setFechaCierreSpy = vi.spyOn(ticket, 'setFechaCierre');
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(validDto); // ABIERTO → EN_PROGRESO (via mockMachine que retorna true)

        expect(setFechaCierreSpy).not.toHaveBeenCalled();
      });
    });
  });

  // ─── PR4 4.3/4.4/4.11: publicación post-commit de TicketEstadoCambiado ───────
  // Ref spec: R2 Scenarios 1-2, R6 "nada dentro de la tx", R1 "transición a CANCELADO".
  // Ref design: §6.A (publish tras txRunner.run(), antes del return).

  describe('publicación post-commit del evento TicketEstadoCambiado (D1, D4, D5)', () => {
    describe('4.3 — estado destino notificable (RESUELTO)', () => {
      const dto: TransicionarEstadoDto = {
        ticketId: 'ticket-uuid-001',
        nuevoEstadoCodigo: 'RESUELTO',
        autorId: AUTOR_ID,
        clienteId: CLIENTE_ID,
        fechaCierre: new Date('2026-06-28'),
      };

      beforeEach(() => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
      });

      it('publisher.publish() es llamado UNA vez con el evento TicketEstadoCambiado correcto', async () => {
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);

        await useCase.execute(dto);

        expect(publisher.publish).toHaveBeenCalledOnce();
        const published = publisher.publish.mock.calls[0][0] as TicketEstadoCambiado;
        expect(published).toBeInstanceOf(TicketEstadoCambiado);
        expect(published.ticketId).toBe(ticket.id);
        expect(published.numero).toBe(ticket.numero);
        expect(published.tituloTicket).toBe(ticket.titulo);
        expect(published.tipoCodigo).toBe('SOPORTE');
        expect(published.estadoAnteriorCodigo).toBe('ABIERTO');
        expect(published.estadoNuevoCodigo).toBe('RESUELTO');
        expect(published.solicitanteId).toBe(ticket.solicitanteId);
        expect(published.autorId).toBe(AUTOR_ID);
        expect(published.tenantId).toBe(CLIENTE_ID);
        expect(published.occurredAt).toBeInstanceOf(Date);
      });

      it('la transición sigue retornando Result.ok sin importar el publisher', async () => {
        const result = await useCase.execute(dto);

        expect(result.isOk()).toBe(true);
      });
    });

    describe('4.3 — estado destino NO notificable (EN_PROGRESO)', () => {
      it('publisher.publish() NO es llamado', async () => {
        await useCase.execute(validDto); // ABIERTO → EN_PROGRESO

        expect(publisher.publish).not.toHaveBeenCalled();
      });
    });

    describe('4.4 — nada de publicación ocurre DENTRO del callback del txRunner (R6/R10)', () => {
      it('publisher.publish es invocado DESPUÉS de que txRunner.run resuelve, nunca durante', async () => {
        const callOrder: string[] = [];
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));

        (txRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
          callOrder.push('tx:start');
          const r = await fn();
          callOrder.push('tx:end');
          return r;
        });
        publisher.publish.mockImplementation(() => {
          callOrder.push('publisher:publish');
        });

        await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'RESUELTO',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
          fechaCierre: new Date('2026-06-28'),
        });

        const txEnd = callOrder.indexOf('tx:end');
        const publishCall = callOrder.indexOf('publisher:publish');
        expect(publishCall).toBeGreaterThan(-1);
        expect(txEnd).toBeLessThan(publishCall);
      });
    });

    describe('4.11 — transición a CANCELADO notifica vía PATCH en COMPRAS/EDILICIA (R1)', () => {
      const ESTADO_CANCELADO_ID = 'estado-cancelado-uuid';

      beforeEach(() => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_CANCELADO_ID, 'CANCELADO'));
      });

      it('COMPRAS: publisher.publish() es llamado con estadoNuevoCodigo CANCELADO', async () => {
        tipoTicketRepo.findCodigoById.mockResolvedValue('COMPRAS');

        await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'CANCELADO',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
        });

        expect(publisher.publish).toHaveBeenCalledOnce();
        const published = publisher.publish.mock.calls[0][0] as TicketEstadoCambiado;
        expect(published.tipoCodigo).toBe('COMPRAS');
        expect(published.estadoNuevoCodigo).toBe('CANCELADO');
      });

      it('EDILICIA: publisher.publish() es llamado con estadoNuevoCodigo CANCELADO', async () => {
        tipoTicketRepo.findCodigoById.mockResolvedValue('EDILICIA');

        await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'CANCELADO',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
        });

        expect(publisher.publish).toHaveBeenCalledOnce();
        const published = publisher.publish.mock.calls[0][0] as TicketEstadoCambiado;
        expect(published.tipoCodigo).toBe('EDILICIA');
        expect(published.estadoNuevoCodigo).toBe('CANCELADO');
      });
    });

    // ─── Judgment Day PR4 Ronda 1 — guard defensivo consistente con crear-observacion ──
    // Ref: publisher.publish() post-commit sin try/catch — si emit() alguna vez
    // lanza, no debe tumbar una transición ya committeada (log-and-swallow).

    describe('4.12 (RED→GREEN) — publisher.publish() lanza post-commit', () => {
      it('execute() sigue devolviendo Result.ok de la transición ya committeada, no propaga el throw, y loguea el error', async () => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);
        const publishError = new Error('Event bus no disponible');
        publisher.publish.mockImplementation(() => {
          throw publishError;
        });

        const result = await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'RESUELTO',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
          fechaCierre: new Date('2026-06-28'),
        });

        expect(result.isOk()).toBe(true);
        expect(result.getValue().estadoId).toBe(ESTADO_RESUELTO_ID);
        // La tx ya committeó — no se re-invoca ni se revierte nada.
        expect(ticketRepo.save).toHaveBeenCalledOnce();
        expect(operacionRepo.save).toHaveBeenCalledOnce();
        expect(logger.error).toHaveBeenCalledOnce();
      });
    });

    // ─── Judgment Day PR4 Ronda 2 — WARNING: PII + stack en el log del catch ──

    describe('WARNING Ronda 2 — enmascarado de PII + stack en el catch post-commit', () => {
      it('el mensaje logueado enmascara un email embebido en el error, y el stack se pasa como 2do argumento', async () => {
        estadoRepo.findByCodigo.mockResolvedValue(makeEstado(ESTADO_RESUELTO_ID, 'RESUELTO'));
        const ticket = makeTicket(ESTADO_ABIERTO_ID, TIPO_TICKET_ID);
        ticketRepo.findById.mockResolvedValue(ticket);
        const publishError = new Error('Event bus no disponible, contactar admin@dbhost.internal');
        publisher.publish.mockImplementation(() => {
          throw publishError;
        });

        await useCase.execute({
          ticketId: 'ticket-uuid-001',
          nuevoEstadoCodigo: 'RESUELTO',
          autorId: AUTOR_ID,
          clienteId: CLIENTE_ID,
          fechaCierre: new Date('2026-06-28'),
        });

        expect(logger.error).toHaveBeenCalledOnce();
        const [mensajeLogueado, stackLogueado] = logger.error.mock.calls[0];
        expect(mensajeLogueado).not.toContain('admin@dbhost.internal');
        expect(mensajeLogueado).toContain('a***@dbhost.internal');
        expect(stackLogueado).toBe(publishError.stack);
      });
    });
  });
});
