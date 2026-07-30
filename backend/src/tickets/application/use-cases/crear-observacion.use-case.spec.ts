/**
 * P2.T5 [RED → GREEN con P2.T6] — Unit tests para CrearObservacionUseCase.
 *
 * Todos los repositorios son mockeados (sin Prisma ni DB).
 * El txRunner ejecuta el callback inmediatamente (patrón establecido en PR1).
 *
 * Cubre (ADR-2, ADR-7, Req Observaciones del técnico):
 * 1.  Ticket APROBADO sin nuevoEstadoCodigo → auto-transición EN_PROGRESO (2 operaciones)
 * 2.  Ticket APROBADO con nuevoEstadoCodigo: 'EN_PROGRESO' → equivalente al 1
 * 3.  Ticket APROBADO + nuevoEstadoCodigo: 'RESUELTO' + fechaCierre → setFechaCierre(fecha)
 * 4.  Ticket APROBADO + nuevoEstadoCodigo: 'RESUELTO' SIN fechaCierre → FechaCierreRequeridaError 422
 * 5.  Ticket APROBADO + nuevoEstadoCodigo: 'SUSPENDIDO' → sin setFechaCierre
 * 6.  Ticket APROBADO + nuevoEstadoCodigo: 'SIN_SOLUCION' → setFechaCierre(now)
 * 7.  nuevoEstadoCodigo: 'ABIERTO' desde APROBADO → TransicionInvalidaError 422
 * 8.  Ticket EN_PROGRESO → solo OBSERVACION, sin cambio de estado, sin fecha
 * 9.  nuevoEstadoCodigo ignorado cuando ticket no está en APROBADO
 * 10. Ticket en estado terminal (RESUELTO) → ObservacionNoPermitidaError 422
 * 11. Rollback: si falla save(CAMBIO_ESTADO) → execute() rechaza (la tx rollbackea)
 * 12. Ticket de otro tenant (findById → null) → TicketNoEncontradoError 404
 *
 * Ref spec: Req Observaciones del técnico (tickets-core/spec.md), ADR-2
 * Change: tickets-maquina-estados-observaciones / PR2
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CrearObservacionDto, CrearObservacionUseCase } from './crear-observacion.use-case';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { TicketEntity, TicketProps } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';
import {
  EstadoCatalogoNoEncontradoError,
  FechaCierreRequeridaError,
  ObservacionNoPermitidaError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TICKET_ID = 'ticket-uuid-pr2-001';
const AUTOR_ID = 'user-autor-pr2-001';
const _ESTADO_ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001'; // disponible para tests futuros
const ESTADO_APROBADO_ID = 'c0000000-0000-4000-c000-000000000003';
const ESTADO_EN_PROGRESO_ID = 'c0000000-0000-4000-c000-000000000005';
const ESTADO_SUSPENDIDO_ID = 'c0000000-0000-4000-c000-000000000009';
const ESTADO_RESUELTO_ID = 'c0000000-0000-4000-c000-000000000006';
const ESTADO_SIN_SOLUCION_ID = 'c0000000-0000-4000-c000-00000000000a';
const TIPO_OP_OBSERVACION_ID = 'f0000000-0000-4000-f000-000000000009';
const TIPO_OP_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEstado(codigo: string, id: string): EstadoEntity {
  return EstadoEntity.create({ codigo, nombre: codigo, color: null, orden: 10, activo: true }, id);
}

function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
  return {
    numero: 'SOP-2026-00101',
    titulo: 'Ticket de observación',
    descripcion: null,
    tipoId: 'tipo-uuid-001',
    estadoId: ESTADO_APROBADO_ID,
    prioridadId: 'prio-uuid-001',
    cicloId: null,
    solicitanteId: 'user-solicitante-001',
    asignadoId: null,
    fechaCierre: null,
    ...overrides,
  };
}

function makeTicket(estadoId: string = ESTADO_APROBADO_ID): TicketEntity {
  return TicketEntity.reconstitute(
    makeTicketProps({ estadoId }),
    TICKET_ID,
    new Date(),
    new Date(),
    null,
  );
}

const CLIENTE_ID = 'cliente-uuid-tenant-a';

const baseDto: CrearObservacionDto = {
  ticketId: TICKET_ID,
  texto: 'Observación del técnico',
  autorId: AUTOR_ID,
  clienteId: CLIENTE_ID,
};

// ─── Mocks factory ────────────────────────────────────────────────────────────

function makeMocks() {
  const ticketRepo: vi.Mocked<ITicketRepository> = {
    findById: vi.fn(),
    findByNumero: vi.fn(),
    findLastSecuencia: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
  };

  const estadoRepo: vi.Mocked<IEstadoRepository> = {
    findById: vi.fn(),
    findByCodigo: vi.fn(),
    findAllActive: vi.fn(),
    findAll: vi.fn(),
  };

  const operacionRepo: vi.Mocked<IOperacionTicketRepository> = {
    findByTicketId: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };

  const tipoOperacionRepo: vi.Mocked<ITipoOperacionRepository> = {
    findIdByCodigo: vi.fn(),
  };

  // tipoTicketRepo (D6): resuelve tipoCodigo post-commit, solo si hubo
  // auto-transición a estado notificable. Default 'SOPORTE' — sensato para
  // no dejar el mock "colgado" en los escenarios que SÍ publican (RESUELTO,
  // SIN_SOLUCION ya están en el set notificable).
  const tipoTicketRepo: vi.Mocked<ITipoTicketRepository> = {
    findCodigoById: vi.fn().mockResolvedValue('SOPORTE'),
  };

  // publisher (D1): fire-and-forget, publish() no retorna nada relevante.
  const publisher: vi.Mocked<IDomainEventPublisher> = {
    publish: vi.fn(),
  };

  // logger (puerto ILogger, Judgment Day PR4 Ronda 2): stub tipado, sin casts.
  const logger: vi.Mocked<ILogger> = {
    error: vi.fn(),
  };

  // txRunner ejecuta el callback inmediatamente (sin DB real)
  const txRunner: ITenantTransactionRunner = {
    run: vi.fn((fn) => fn()),
  };

  return {
    ticketRepo,
    estadoRepo,
    operacionRepo,
    tipoOperacionRepo,
    tipoTicketRepo,
    publisher,
    logger,
    txRunner,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CrearObservacionUseCase', () => {
  let ticketRepo: vi.Mocked<ITicketRepository>;
  let estadoRepo: vi.Mocked<IEstadoRepository>;
  let operacionRepo: vi.Mocked<IOperacionTicketRepository>;
  let tipoOperacionRepo: vi.Mocked<ITipoOperacionRepository>;
  let tipoTicketRepo: vi.Mocked<ITipoTicketRepository>;
  let publisher: vi.Mocked<IDomainEventPublisher>;
  let logger: vi.Mocked<ILogger>;
  let txRunner: ITenantTransactionRunner;
  let useCase: CrearObservacionUseCase;

  beforeEach(() => {
    const mocks = makeMocks();
    ticketRepo = mocks.ticketRepo;
    estadoRepo = mocks.estadoRepo;
    operacionRepo = mocks.operacionRepo;
    tipoOperacionRepo = mocks.tipoOperacionRepo;
    tipoTicketRepo = mocks.tipoTicketRepo;
    publisher = mocks.publisher;
    logger = mocks.logger;
    txRunner = mocks.txRunner;
    useCase = new CrearObservacionUseCase(
      ticketRepo,
      estadoRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      tipoTicketRepo,
      publisher,
      logger,
    );
  });

  // ─── Setup helpers compartidos ──────────────────────────────────────────────

  /** Configura el mock de repos para ticket en APROBADO. */
  function setupAprobado() {
    const ticket = makeTicket(ESTADO_APROBADO_ID);
    ticketRepo.findById.mockResolvedValue(ticket);
    estadoRepo.findById.mockResolvedValue(makeEstado('APROBADO', ESTADO_APROBADO_ID));
    tipoOperacionRepo.findIdByCodigo.mockImplementation((codigo) => {
      if (codigo === 'OBSERVACION') return Promise.resolve(TIPO_OP_OBSERVACION_ID);
      if (codigo === 'CAMBIO_ESTADO') return Promise.resolve(TIPO_OP_CAMBIO_ESTADO_ID);
      return Promise.resolve(null);
    });
    return ticket;
  }

  // ─── Escenario 1: APROBADO sin nuevoEstadoCodigo → EN_PROGRESO ──────────────

  it('Sc1: ticket APROBADO sin nuevoEstadoCodigo → auto-transición a EN_PROGRESO', async () => {
    const ticket = setupAprobado();
    estadoRepo.findByCodigo.mockImplementation((codigo) => {
      if (codigo === 'EN_PROGRESO')
        return Promise.resolve(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
      return Promise.resolve(null);
    });

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    // ticket.estadoId actualizado a EN_PROGRESO
    expect(ticket.estadoId).toBe(ESTADO_EN_PROGRESO_ID);
    // ticketRepo.save fue llamado (estado cambió)
    expect(ticketRepo.save).toHaveBeenCalledOnce();
    // 2 saves en operacionRepo: OBSERVACION + CAMBIO_ESTADO
    expect(operacionRepo.save).toHaveBeenCalledTimes(2);
    // txRunner.run fue invocado
    expect(txRunner.run as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
  });

  // ─── Escenario 2: APROBADO con nuevoEstadoCodigo EN_PROGRESO explícito ───────

  it('Sc2: ticket APROBADO con nuevoEstadoCodigo EN_PROGRESO → idéntico al Sc1', async () => {
    const ticket = setupAprobado();
    estadoRepo.findByCodigo.mockImplementation((codigo) => {
      if (codigo === 'EN_PROGRESO')
        return Promise.resolve(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
      return Promise.resolve(null);
    });

    const result = await useCase.execute({ ...baseDto, estadoDestinoCodigo: 'EN_PROGRESO' });

    expect(result.isOk()).toBe(true);
    expect(ticket.estadoId).toBe(ESTADO_EN_PROGRESO_ID);
    expect(ticketRepo.save).toHaveBeenCalledOnce();
    expect(operacionRepo.save).toHaveBeenCalledTimes(2);
  });

  // ─── Escenario 3: APROBADO → RESUELTO con fechaCierre ────────────────────────

  it('Sc3: APROBADO + nuevoEstadoCodigo RESUELTO + fechaCierre → setFechaCierre(fecha)', async () => {
    const ticket = setupAprobado();
    estadoRepo.findByCodigo.mockImplementation((codigo) => {
      if (codigo === 'RESUELTO') return Promise.resolve(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));
      return Promise.resolve(null);
    });
    const fechaCierre = new Date('2026-06-29');
    const setFechaCierreSpy = vi.spyOn(ticket, 'setFechaCierre');

    // Re-inject ticket via findById (spy before execute)
    ticketRepo.findById.mockResolvedValue(ticket);

    const result = await useCase.execute({
      ...baseDto,
      estadoDestinoCodigo: 'RESUELTO',
      fechaCierre,
    });

    expect(result.isOk()).toBe(true);
    expect(setFechaCierreSpy).toHaveBeenCalledWith(fechaCierre);
    expect(ticket.estadoId).toBe(ESTADO_RESUELTO_ID);
    expect(operacionRepo.save).toHaveBeenCalledTimes(2);
  });

  // ─── Escenario 4: APROBADO → RESUELTO SIN fechaCierre → fail 422 ─────────────

  it('Sc4: APROBADO + nuevoEstadoCodigo RESUELTO SIN fechaCierre → FechaCierreRequeridaError', async () => {
    setupAprobado();

    const result = await useCase.execute({
      ...baseDto,
      estadoDestinoCodigo: 'RESUELTO',
      // fechaCierre omitida
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FechaCierreRequeridaError);
    // Nada debería persistirse
    expect(ticketRepo.save).not.toHaveBeenCalled();
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  // ─── Escenario 5: APROBADO → SUSPENDIDO → sin setFechaCierre ─────────────

  it('Sc5: APROBADO + nuevoEstadoCodigo SUSPENDIDO → no setea fechaCierre', async () => {
    const ticket = setupAprobado();
    estadoRepo.findByCodigo.mockImplementation((codigo) => {
      if (codigo === 'SUSPENDIDO')
        return Promise.resolve(makeEstado('SUSPENDIDO', ESTADO_SUSPENDIDO_ID));
      return Promise.resolve(null);
    });
    const setFechaCierreSpy = vi.spyOn(ticket, 'setFechaCierre');
    ticketRepo.findById.mockResolvedValue(ticket);

    const result = await useCase.execute({ ...baseDto, estadoDestinoCodigo: 'SUSPENDIDO' });

    expect(result.isOk()).toBe(true);
    expect(setFechaCierreSpy).not.toHaveBeenCalled();
    expect(ticket.estadoId).toBe(ESTADO_SUSPENDIDO_ID);
    expect(operacionRepo.save).toHaveBeenCalledTimes(2);
  });

  // ─── Escenario 6: APROBADO → SIN_SOLUCION → setFechaCierre(now) ──────────

  it('Sc6: APROBADO + nuevoEstadoCodigo SIN_SOLUCION → setFechaCierre(now)', async () => {
    const ticket = setupAprobado();
    estadoRepo.findByCodigo.mockImplementation((codigo) => {
      if (codigo === 'SIN_SOLUCION')
        return Promise.resolve(makeEstado('SIN_SOLUCION', ESTADO_SIN_SOLUCION_ID));
      return Promise.resolve(null);
    });
    const setFechaCierreSpy = vi.spyOn(ticket, 'setFechaCierre');
    ticketRepo.findById.mockResolvedValue(ticket);

    const result = await useCase.execute({ ...baseDto, estadoDestinoCodigo: 'SIN_SOLUCION' });

    expect(result.isOk()).toBe(true);
    expect(setFechaCierreSpy).toHaveBeenCalledOnce();
    // El argumento debe ser un Date (now)
    const llamadaCon = setFechaCierreSpy.mock.calls[0][0];
    expect(llamadaCon).toBeInstanceOf(Date);
    expect(ticket.estadoId).toBe(ESTADO_SIN_SOLUCION_ID);
  });

  // ─── Escenario 7: APROBADO → ABIERTO (inválido) → TransicionInvalidaError ────

  it('Sc7: nuevoEstadoCodigo ABIERTO desde APROBADO → TransicionInvalidaError 422', async () => {
    setupAprobado();

    const result = await useCase.execute({
      ...baseDto,
      // @ts-expect-error: probando valor inválido para la state machine
      estadoDestinoCodigo: 'ABIERTO',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
    expect(ticketRepo.save).not.toHaveBeenCalled();
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  // ─── Escenario 8: Ticket EN_PROGRESO → solo OBSERVACION, sin cambio estado ───

  it('Sc8: ticket EN_PROGRESO → registra OBSERVACION, sin cambio de estado', async () => {
    const ticket = makeTicket(ESTADO_EN_PROGRESO_ID);
    ticketRepo.findById.mockResolvedValue(ticket);
    estadoRepo.findById.mockResolvedValue(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OP_OBSERVACION_ID);

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    // Solo 1 save en operacionRepo (OBSERVACION), no CAMBIO_ESTADO
    expect(operacionRepo.save).toHaveBeenCalledOnce();
    // ticketRepo.save NO debería llamarse (no cambia el estado)
    expect(ticketRepo.save).not.toHaveBeenCalled();
    // estadoId no cambia
    expect(ticket.estadoId).toBe(ESTADO_EN_PROGRESO_ID);
  });

  // ─── Escenario 9: nuevoEstadoCodigo ignorado fuera de APROBADO ───────────────

  it('Sc9: nuevoEstadoCodigo ignorado cuando ticket no está en APROBADO', async () => {
    const ticket = makeTicket(ESTADO_EN_PROGRESO_ID);
    ticketRepo.findById.mockResolvedValue(ticket);
    estadoRepo.findById.mockResolvedValue(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OP_OBSERVACION_ID);

    const result = await useCase.execute({ ...baseDto, estadoDestinoCodigo: 'RESUELTO' });

    expect(result.isOk()).toBe(true);
    // Estado no cambia
    expect(ticket.estadoId).toBe(ESTADO_EN_PROGRESO_ID);
    // Solo 1 operacion (OBSERVACION)
    expect(operacionRepo.save).toHaveBeenCalledOnce();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  // ─── Escenario 10: Estado terminal → ObservacionNoPermitidaError ──────────────

  it('Sc10: ticket RESUELTO (terminal) → ObservacionNoPermitidaError 422', async () => {
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_RESUELTO_ID));
    estadoRepo.findById.mockResolvedValue(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ObservacionNoPermitidaError);
    expect(operacionRepo.save).not.toHaveBeenCalled();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  // ─── Escenario 11: Rollback — falla save(CAMBIO_ESTADO) ──────────────────────

  it('Sc11: si falla save(CAMBIO_ESTADO) → execute() rechaza (transacción rollbackea)', async () => {
    setupAprobado();
    estadoRepo.findByCodigo.mockImplementation((codigo) => {
      if (codigo === 'EN_PROGRESO')
        return Promise.resolve(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
      return Promise.resolve(null);
    });

    const dbError = new Error('Constraint violation en CAMBIO_ESTADO');
    // Primera llamada (OBSERVACION) OK; segunda (CAMBIO_ESTADO) falla
    operacionRepo.save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(dbError);

    await expect(useCase.execute(baseDto)).rejects.toThrow(dbError);
  });

  // ─── Escenario 12: Ticket no encontrado → TicketNoEncontradoError ─────────────

  it('Sc12: ticket de otro tenant (findById → null) → TicketNoEncontradoError 404', async () => {
    ticketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(estadoRepo.findById).not.toHaveBeenCalled();
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  // ─── Extras: cobertura de infraestructura ────────────────────────────────────

  it('Estado actual del ticket no existe en catálogo → EstadoCatalogoNoEncontradoError', async () => {
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_APROBADO_ID));
    estadoRepo.findById.mockResolvedValue(null); // catálogo corrupto

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstadoCatalogoNoEncontradoError);
  });

  it('tipo_operacion OBSERVACION no existe en catálogo → TipoOperacionNoEncontradoError', async () => {
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_EN_PROGRESO_ID));
    estadoRepo.findById.mockResolvedValue(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(null); // catálogo no sembrado

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoOperacionNoEncontradoError);
  });

  // ─── W1: RECHAZADO bloquea observaciones (verify PR2 folded) ─────────────────

  it('W1: ticket RECHAZADO (terminal) → ObservacionNoPermitidaError 422', async () => {
    // ADR: RECHAZADO es estado terminal activo — bloquea observaciones igual que RESUELTO.
    const ESTADO_RECHAZADO_ID = 'c0000000-0000-4000-c000-000000000004';
    ticketRepo.findById.mockResolvedValue(makeTicket(ESTADO_RECHAZADO_ID));
    estadoRepo.findById.mockResolvedValue(makeEstado('RECHAZADO', ESTADO_RECHAZADO_ID));

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ObservacionNoPermitidaError);
    expect((result.getError() as ObservacionNoPermitidaError).code).toBe(
      'OBSERVACION_NO_PERMITIDA',
    );
    expect(operacionRepo.save).not.toHaveBeenCalled();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  // ─── S1: Rollback ante fallo en primer save (OBSERVACION) — verify PR2 folded ─

  it('S1: si falla el PRIMER save (operacionRepo.save para OBSERVACION) → execute() rechaza', async () => {
    // Ref verify PR2 suggestion S1: el Sc11 existente cubre fallo en CAMBIO_ESTADO.
    // Este test cubre el fallo en la PRIMERA operación (OBSERVACION) cuando el ticket
    // no está en APROBADO (solo 1 save esperado, el de OBSERVACION).
    const ticket = makeTicket(ESTADO_EN_PROGRESO_ID);
    ticketRepo.findById.mockResolvedValue(ticket);
    estadoRepo.findById.mockResolvedValue(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
    tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OP_OBSERVACION_ID);

    const dbError = new Error('Falla al guardar OBSERVACION');
    operacionRepo.save.mockRejectedValueOnce(dbError);

    await expect(useCase.execute(baseDto)).rejects.toThrow(dbError);
    // El ticket no debe haber cambiado de estado (no se llamó save del ticket)
    expect(ticketRepo.save).not.toHaveBeenCalled();
    expect(ticket.estadoId).toBe(ESTADO_EN_PROGRESO_ID);
  });

  // ─── PR4 4.6/4.7: publicación post-commit de TicketEstadoCambiado ────────────
  // Ref spec: R3 Scenarios 1-3 (anti-regresión CRÍTICA — la reestructura del
  // txRunner.run NO debe cambiar la semántica transaccional de ningún test
  // de arriba, todos siguen 100% verdes).
  // Ref design: §6.B (extraer return del txRunner.run, publicar afuera), D6.

  describe('publicación post-commit del evento TicketEstadoCambiado (auto-transición, D1/D4/D6)', () => {
    it('4.6 — APROBADO → RESUELTO (estado clave): publica tras el commit con el evento correcto', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'RESUELTO')
          return Promise.resolve(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);
      tipoTicketRepo.findCodigoById.mockResolvedValue('SOPORTE');
      const fechaCierre = new Date('2026-06-29');

      const result = await useCase.execute({
        ...baseDto,
        estadoDestinoCodigo: 'RESUELTO',
        fechaCierre,
      });

      expect(result.isOk()).toBe(true);
      expect(publisher.publish).toHaveBeenCalledOnce();
      const published = publisher.publish.mock.calls[0][0] as TicketEstadoCambiado;
      expect(published).toBeInstanceOf(TicketEstadoCambiado);
      expect(published.ticketId).toBe(TICKET_ID);
      expect(published.numero).toBe(ticket.numero);
      expect(published.tituloTicket).toBe(ticket.titulo);
      expect(published.tipoCodigo).toBe('SOPORTE');
      expect(published.estadoAnteriorCodigo).toBe('APROBADO');
      expect(published.estadoNuevoCodigo).toBe('RESUELTO');
      expect(published.solicitanteId).toBe(ticket.solicitanteId);
      expect(published.autorId).toBe(AUTOR_ID);
      expect(published.tenantId).toBe(CLIENTE_ID);
      expect(tipoTicketRepo.findCodigoById).toHaveBeenCalledWith(ticket.tipoId);
    });

    it('4.6 — publisher.publish() es invocado DESPUÉS de que txRunner.run resuelve (R6/R10)', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'RESUELTO')
          return Promise.resolve(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);
      const callOrder: string[] = [];

      (txRunner.run as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: () => Promise<unknown>) => {
          callOrder.push('tx:start');
          const r = await fn();
          callOrder.push('tx:end');
          return r;
        },
      );
      publisher.publish.mockImplementation(() => {
        callOrder.push('publisher:publish');
      });

      await useCase.execute({
        ...baseDto,
        estadoDestinoCodigo: 'RESUELTO',
        fechaCierre: new Date('2026-06-29'),
      });

      const txEnd = callOrder.indexOf('tx:end');
      const publishCall = callOrder.indexOf('publisher:publish');
      expect(publishCall).toBeGreaterThan(-1);
      expect(txEnd).toBeLessThan(publishCall);
    });

    it('4.6 — APROBADO → SUSPENDIDO (estado NO clave): NO publica', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'SUSPENDIDO')
          return Promise.resolve(makeEstado('SUSPENDIDO', ESTADO_SUSPENDIDO_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);

      const result = await useCase.execute({ ...baseDto, estadoDestinoCodigo: 'SUSPENDIDO' });

      expect(result.isOk()).toBe(true);
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('4.6 — APROBADO → EN_PROGRESO (default, estado NO clave): NO publica', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'EN_PROGRESO')
          return Promise.resolve(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);

      const result = await useCase.execute(baseDto);

      expect(result.isOk()).toBe(true);
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('4.6 — APROBADO → SIN_SOLUCION (estado clave): publica tras el commit', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'SIN_SOLUCION')
          return Promise.resolve(makeEstado('SIN_SOLUCION', ESTADO_SIN_SOLUCION_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);

      const result = await useCase.execute({ ...baseDto, estadoDestinoCodigo: 'SIN_SOLUCION' });

      expect(result.isOk()).toBe(true);
      expect(publisher.publish).toHaveBeenCalledOnce();
      const published = publisher.publish.mock.calls[0][0] as TicketEstadoCambiado;
      expect(published.estadoNuevoCodigo).toBe('SIN_SOLUCION');
    });

    it('4.7 (anti-regresión) — ticket NO en APROBADO (EN_PROGRESO, solo observación): NO publica', async () => {
      const ticket = makeTicket(ESTADO_EN_PROGRESO_ID);
      ticketRepo.findById.mockResolvedValue(ticket);
      estadoRepo.findById.mockResolvedValue(makeEstado('EN_PROGRESO', ESTADO_EN_PROGRESO_ID));
      tipoOperacionRepo.findIdByCodigo.mockResolvedValue(TIPO_OP_OBSERVACION_ID);

      const result = await useCase.execute(baseDto);

      expect(result.isOk()).toBe(true);
      expect(publisher.publish).not.toHaveBeenCalled();
      expect(tipoTicketRepo.findCodigoById).not.toHaveBeenCalled();
    });

    it('4.7 (anti-regresión) — falla al resolver tipoCodigo (findCodigoById → null): NO publica, pero el Result sigue OK', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'RESUELTO')
          return Promise.resolve(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);
      tipoTicketRepo.findCodigoById.mockResolvedValue(null);

      const result = await useCase.execute({
        ...baseDto,
        estadoDestinoCodigo: 'RESUELTO',
        fechaCierre: new Date('2026-06-29'),
      });

      expect(result.isOk()).toBe(true);
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('4.7 (anti-regresión) — transición inválida (Sc7, ABIERTO desde APROBADO): NO publica ni resuelve tipoCodigo', async () => {
      setupAprobado();

      const result = await useCase.execute({
        ...baseDto,
        // @ts-expect-error: probando valor inválido para la state machine
        estadoDestinoCodigo: 'ABIERTO',
      });

      expect(result.isFail()).toBe(true);
      expect(publisher.publish).not.toHaveBeenCalled();
      expect(tipoTicketRepo.findCodigoById).not.toHaveBeenCalled();
    });

    // ─── Judgment Day PR4 Ronda 1 — CRITICAL: guard post-commit ────────────────
    // Ref: findCodigoById()/publish() post-commit SIN try/catch → un reject
    // se propaga fuera de execute() pese a que la tx ya committeó (ticket +
    // OperacionTicket ya persistidos). Rompe el invariante fire-and-forget
    // (R6/R10) y expondría un retry-duplicado si el cliente reintentara tras
    // un 500 crudo.

    it('4.8 (RED→GREEN) — findCodigoById RECHAZA post-commit: execute() sigue devolviendo Result.ok de la observación ya committeada, no propaga el throw, y loguea el error', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'RESUELTO')
          return Promise.resolve(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);
      const dbError = new Error('Pool de conexiones agotado');
      tipoTicketRepo.findCodigoById.mockRejectedValue(dbError);

      const result = await useCase.execute({
        ...baseDto,
        estadoDestinoCodigo: 'RESUELTO',
        fechaCierre: new Date('2026-06-29'),
      });

      // La tx ya committeó: el fallo POST-commit (lookup de la notificación)
      // NUNCA debe romper la respuesta de una operación ya persistida.
      expect(result.isOk()).toBe(true);
      expect(result.getValue().estadoId).toBe(ESTADO_RESUELTO_ID);
      // Nada revierte la tx ya committeada — los saves ya ocurrieron una sola vez.
      expect(ticketRepo.save).toHaveBeenCalledOnce();
      expect(operacionRepo.save).toHaveBeenCalledTimes(2);
      // Sin tipoCodigo no se puede armar el evento → NO se publica.
      expect(publisher.publish).not.toHaveBeenCalled();
      // Se loguea el error (nivel ERROR, vía el puerto ILogger) para no
      // perder observabilidad del fallo.
      expect(logger.error).toHaveBeenCalledOnce();
    });

    // ─── Judgment Day PR4 Ronda 2 — WARNING: PII + stack en el log del catch ──

    it('WARNING Ronda 2 — el mensaje logueado enmascara un email embebido en el error, y el stack se pasa como 2do argumento', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'RESUELTO')
          return Promise.resolve(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);
      const dbError = new Error('Pool de conexiones agotado, contactar admin@dbhost.internal');
      tipoTicketRepo.findCodigoById.mockRejectedValue(dbError);

      await useCase.execute({
        ...baseDto,
        estadoDestinoCodigo: 'RESUELTO',
        fechaCierre: new Date('2026-06-29'),
      });

      expect(logger.error).toHaveBeenCalledOnce();
      const [mensajeLogueado, stackLogueado] = logger.error.mock.calls[0];
      expect(mensajeLogueado).not.toContain('admin@dbhost.internal');
      expect(mensajeLogueado).toContain('a***@dbhost.internal');
      expect(stackLogueado).toBe(dbError.stack);
    });

    // ─── Judgment Day PR4 Ronda 2 — WARNING: cobertura del reject de publisher.publish ──
    // Ref: el try guarda DOS fallos posibles (findCodigoById Y publisher.publish),
    // pero solo el primero tenía test. Este cubre el segundo: findCodigoById
    // resuelve OK y publisher.publish LANZA sincrónicamente (D10 — publish() es
    // `: void`, no async, así que "lanza" y no "rechaza").

    it('WARNING Ronda 2 (RED→GREEN) — publisher.publish() LANZA sincrónicamente post-commit: execute() sigue devolviendo Result.ok, traga el error, loguea 1 vez', async () => {
      const ticket = setupAprobado();
      estadoRepo.findByCodigo.mockImplementation((codigo) => {
        if (codigo === 'RESUELTO')
          return Promise.resolve(makeEstado('RESUELTO', ESTADO_RESUELTO_ID));
        return Promise.resolve(null);
      });
      ticketRepo.findById.mockResolvedValue(ticket);
      tipoTicketRepo.findCodigoById.mockResolvedValue('SOPORTE');
      const publishError = new Error('Event bus no disponible');
      publisher.publish.mockImplementation(() => {
        throw publishError;
      });

      const result = await useCase.execute({
        ...baseDto,
        estadoDestinoCodigo: 'RESUELTO',
        fechaCierre: new Date('2026-06-29'),
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().estadoId).toBe(ESTADO_RESUELTO_ID);
      // La tx ya committeó — nada se re-invoca ni se revierte.
      expect(ticketRepo.save).toHaveBeenCalledOnce();
      expect(operacionRepo.save).toHaveBeenCalledTimes(2);
      expect(publisher.publish).toHaveBeenCalledOnce();
      expect(logger.error).toHaveBeenCalledOnce();
    });
  });
});
