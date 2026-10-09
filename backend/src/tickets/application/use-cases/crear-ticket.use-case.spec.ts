/**
 * T6.1/T6.2 [UNIT] — RED→GREEN: `CrearTicketUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre T4 (creación feliz,
 * estampado de solicitante/estado/ciclo/numero, validaciones de
 * tipo/prioridad/solicitante/ciclo activo) y T11 (ticketReferenciaId válido
 * e inválido).
 *
 * Ref spec: sdd/tickets-core/spec T4, T5, T11. Ref design: ADR-5 (advisory
 * lock DENTRO de la tx — se verifica que `generarNumero`/`save` corren
 * dentro de `txRunner.run`). Tarea: T6.1, T6.2.
 */
import { CrearTicketUseCase, CrearTicketDto } from './crear-ticket.use-case';
import { Result } from '../../../shared/domain/result';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { PrismaTenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { TicketCreadoEvent } from '../../domain/events/ticket-creado.event';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { AUTOR_SISTEMA } from '../../domain/constants/autor-sistema.constants';
import {
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  PrioridadNoEncontradaError,
  TicketReferenciaInvalidaError,
  SinCicloActivoError,
  SecuenciaAgotadaError,
} from '../../domain/errors/tickets.errors';

function baseDto(overrides: Partial<CrearTicketDto> = {}): CrearTicketDto {
  return {
    titulo: 'No enciende la PC',
    descripcion: 'Detalle',
    tipoId: 'tipo-soporte-uuid',
    prioridadId: 'prioridad-media-uuid',
    ticketReferenciaId: null,
    solicitanteId: 'solicitante-uuid',
    clienteId: 'cliente-uuid',
    autorId: 'solicitante-uuid',
    anio: 2026,
    ...overrides,
  };
}

describe('CrearTicketUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const estadoRepo = { findIdByCodigo: vi.fn().mockResolvedValue('estado-nuevo-uuid') };
    const tipoTicketRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
            'tipo-soporte-uuid',
          ),
        ),
    };
    const prioridadRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          PrioridadEntity.create(
            { codigo: 'MEDIA', nombre: 'Media', color: null, orden: 2, activo: true },
            'prioridad-media-uuid',
          ),
        ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-cambio-estado-uuid'),
    };
    const usuarioMasterChecker = { existeEnTenant: vi.fn().mockResolvedValue(true) };
    const numerador = { generarNumero: vi.fn().mockResolvedValue(Result.ok('SOP-2026-00001')) };
    const resolverCicloActivo = {
      resolver: vi.fn().mockResolvedValue(
        Result.ok(
          CicloClienteEntity.create(
            {
              cicloVigenteId: 'ciclo-vigente-uuid',
              nombre: 'Ciclo 2026',
              fechaInicio: new Date('2026-01-01'),
              fechaFin: new Date('2026-12-31'),
              activo: true,
            },
            'ciclo-activo-uuid',
          ),
        ),
      ),
    };
    // txRunner.run ejecuta el callback DIRECTAMENTE (sin Prisma real) — pero
    // preserva la semántica "corre dentro de la tx" para los tests. Igual
    // alCommitear() acá: para estos tests unitarios (que no ejercitan la
    // re-entrancia) alcanza con ejecutar el callback en el acto; el
    // comportamiento diferido real está cubierto abajo, contra el runner
    // REAL (`makeCollaboradoresConRunnerReal`). El try/catch de acá calca el
    // log-and-swallow que hace `PrismaTenantTransactionRunner` en producción
    // (sdd/preventivo WU-5 postcommit): desde esa corrección, el use case ya
    // NO envuelve el callback en su propio try/catch, así que el mock que lo
    // simula tiene que hacerlo para no romper el contrato con un fake ciego.
    const txRunner = {
      run: vi.fn((fn: () => Promise<unknown>) => fn()),
      alCommitear: vi.fn((fn: () => void) => {
        try {
          fn();
        } catch {
          // Swallow — mismo criterio que el runner real: un callback que
          // falla no debe propagar ni afectar al resto de la cola.
        }
      }),
    };
    const resolverAsignacion = { resolver: vi.fn().mockResolvedValue(null) };
    const eventPublisher = { publish: vi.fn() };

    const useCase = new CrearTicketUseCase(
      ticketRepo as never,
      operacionRepo as never,
      estadoRepo as never,
      tipoTicketRepo as never,
      prioridadRepo as never,
      tipoOperacionRepo as never,
      usuarioMasterChecker as never,
      numerador as never,
      resolverCicloActivo as never,
      resolverAsignacion,
      eventPublisher as never,
      txRunner as never,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      prioridadRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      numerador,
      resolverCicloActivo,
      resolverAsignacion,
      eventPublisher,
      txRunner,
    };
  }

  it('T4: crea el ticket estampando solicitante/estado NUEVO/ciclo activo/numero, y la operacion de apertura, dentro de la tx', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket).toBeInstanceOf(TicketEntity);
    expect(ticket.numero).toBe('SOP-2026-00001');
    expect(ticket.solicitanteId).toBe('solicitante-uuid');
    expect(ticket.estadoId).toBe('estado-nuevo-uuid');
    expect(ticket.cicloId).toBe('ciclo-activo-uuid');
    expect(ticket.asignadoId).toBeNull();

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    const operacionGuardada = c.operacionRepo.save.mock.calls[0][0];
    expect(operacionGuardada.estadoAnteriorId).toBeNull();
    expect(operacionGuardada.estadoNuevoId).toBe('estado-nuevo-uuid');
    expect(operacionGuardada.autorId).toBe('solicitante-uuid');
  });

  it('SA10 (Fase 4, aditivo, GATE G3): publica TicketCreadoEvent POST-COMMIT con ticketId/prioridadId', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());
    const ticket = result.getValue();

    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0];
    expect(evento).toBeInstanceOf(TicketCreadoEvent);
    expect(evento.ticketId).toBe(ticket.id);
    expect(evento.prioridadId).toBe('prioridad-media-uuid');
  });

  it('SA10: un fallo del eventPublisher NUNCA revierte la creación ya committeada (log-and-swallow)', async () => {
    const c = makeCollaborators();
    c.eventPublisher.publish.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
  });

  it('solicitante inválido (no existe/no pertenece al tenant) → SolicitanteInvalidoError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.usuarioMasterChecker.existeEnTenant.mockResolvedValue(false);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SolicitanteInvalidoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('sin ciclo activo → propaga SinCicloActivoError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.resolverCicloActivo.resolver.mockResolvedValue(Result.fail(new SinCicloActivoError()));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SinCicloActivoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('tipoId inexistente en el catálogo del tenant → TipoTicketNoEncontradoError (422)', async () => {
    const c = makeCollaborators();
    c.tipoTicketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketNoEncontradoError);
  });

  it('prioridadId inexistente en el catálogo del tenant → PrioridadNoEncontradaError (422)', async () => {
    const c = makeCollaborators();
    c.prioridadRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
  });

  it('T11: ticketReferenciaId válido (existe en el tenant) → OK, se estampa en el ticket nuevo', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(
      TicketEntity.create(
        {
          numero: 'SOP-2025-00099',
          titulo: 'Cerrado previo',
          descripcion: null,
          tipoId: 'tipo-soporte-uuid',
          estadoId: 'estado-cerrado-uuid',
          prioridadId: 'prioridad-media-uuid',
          cicloId: null,
          ticketReferenciaId: null,
          solicitanteId: 'solicitante-uuid',
        },
        'ticket-cerrado-uuid',
      ),
    );

    const result = await c.useCase.execute(baseDto({ ticketReferenciaId: 'ticket-cerrado-uuid' }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().ticketReferenciaId).toBe('ticket-cerrado-uuid');
  });

  it('T11: ticketReferenciaId inexistente en el tenant → TicketReferenciaInvalidaError (422)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto({ ticketReferenciaId: 'no-existe-uuid' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketReferenciaInvalidaError);
  });

  it('T11: ticketReferenciaId soft-deleted se trata como inexistente → TicketReferenciaInvalidaError', async () => {
    const c = makeCollaborators();
    const referenciado = TicketEntity.create(
      {
        numero: 'SOP-2025-00098',
        titulo: 'Borrado',
        descripcion: null,
        tipoId: 'tipo-soporte-uuid',
        estadoId: 'estado-cerrado-uuid',
        prioridadId: 'prioridad-media-uuid',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'solicitante-uuid',
      },
      'ticket-borrado-uuid',
    );
    referenciado.softDelete();
    c.ticketRepo.findById.mockResolvedValue(referenciado);

    const result = await c.useCase.execute(baseDto({ ticketReferenciaId: 'ticket-borrado-uuid' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketReferenciaInvalidaError);
  });

  it('secuencia agotada (numerador falla DENTRO de la tx) → propaga el error sin persistir', async () => {
    const c = makeCollaborators();
    c.numerador.generarNumero.mockResolvedValue(
      Result.fail(new SecuenciaAgotadaError('SOPORTE', 2026)),
    );

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SecuenciaAgotadaError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
    expect(c.operacionRepo.save).not.toHaveBeenCalled();
  });

  describe('asignación automática por regla del tipo (A1-A4, A7, A8, N1)', () => {
    const ASIGNACION = {
      asignadoId: 'u-responsable',
      estadoAsignadoId: 'estado-asignado-uuid',
      tipoOperacionAsignacionId: 'tipo-op-asignacion-uuid',
    };

    it('con regla: nace ASIGNADO con asignado_id, apertura null→ASIGNADO y ASIGNACION del sistema', async () => {
      const c = makeCollaborators();
      c.resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);

      const result = await c.useCase.execute(baseDto());

      const ticket = result.getValue();
      expect(ticket.estadoId).toBe('estado-asignado-uuid');
      expect(ticket.asignadoId).toBe('u-responsable');
      expect(c.resolverAsignacion.resolver).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tipo-soporte-uuid' }),
        'cliente-uuid',
      );
      const ops = c.operacionRepo.save.mock.calls.map(([op]) => op);
      expect(ops).toHaveLength(2);
      const apertura = ops.find((o) => o.tipoOperacionId === 'tipo-op-cambio-estado-uuid');
      const asignacion = ops.find((o) => o.tipoOperacionId === 'tipo-op-asignacion-uuid');
      expect(apertura.estadoAnteriorId).toBeNull();
      expect(apertura.estadoNuevoId).toBe('estado-asignado-uuid');
      expect(apertura.autorId).toBe('solicitante-uuid');
      expect(asignacion.autorId).toBe(AUTOR_SISTEMA);
      expect(asignacion.metadata).toEqual({
        origen: 'REGLA_TIPO',
        tipoId: 'tipo-soporte-uuid',
        asignadoId: 'u-responsable',
      });
    });

    it('sin regla: idéntico a hoy (NUEVO, sin asignado, una sola operación, solo ticket.creado)', async () => {
      const c = makeCollaborators();

      const result = await c.useCase.execute(baseDto());

      expect(result.getValue().estadoId).toBe('estado-nuevo-uuid');
      expect(result.getValue().asignadoId).toBeNull();
      expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
      expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(c.eventPublisher.publish.mock.calls[0][0]).toBeInstanceOf(TicketCreadoEvent);
    });

    it('regla rota (el resolver devuelve null): nace NUEVO y sin error', async () => {
      const c = makeCollaborators();
      c.resolverAsignacion.resolver.mockResolvedValue(null);

      const result = await c.useCase.execute(baseDto());

      expect(result.isOk()).toBe(true);
      expect(result.getValue().asignadoId).toBeNull();
    });

    it('con regla: publica ticket.asignado REGLA_TIPO después de ticket.creado, solo al correr la cola de alCommitear', async () => {
      const c = makeCollaborators();
      c.resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);
      const cola: Array<() => void> = [];
      c.txRunner.alCommitear.mockImplementation((fn: () => void) => {
        cola.push(fn);
      });

      const result = await c.useCase.execute(baseDto());

      expect(c.eventPublisher.publish).not.toHaveBeenCalled();
      cola.forEach((fn) => fn());
      const eventos = c.eventPublisher.publish.mock.calls.map(([e]) => e);
      expect(eventos[0]).toBeInstanceOf(TicketCreadoEvent);
      expect(eventos[1]).toBeInstanceOf(TicketAsignadoEvent);
      expect(eventos[1]).toMatchObject({
        ticketId: result.getValue().id,
        asignadoId: 'u-responsable',
        origen: 'REGLA_TIPO',
        autorId: null,
      });
      expect(eventos).toHaveLength(2);
    });

    it('si el resolver rechaza (consulta de tenant), el alta rechaza sin abrir la transacción', async () => {
      const c = makeCollaborators();
      c.resolverAsignacion.resolver.mockRejectedValue(new Error('tenant caido'));

      await expect(c.useCase.execute(baseDto())).rejects.toThrow('tenant caido');
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });
  });
});

/**
 * Defecto de re-entrancia (sdd/preventivo WU-5) — RED→GREEN.
 *
 * `CrearTicketUseCase` publica `TicketCreadoEvent` vía `txRunner.alCommitear()`
 * en vez de directo. Estos tests usan el `PrismaTenantTransactionRunner` REAL
 * (no un mock que "ejecuta directo") porque son justamente los que ejercitan
 * su semántica de commit diferido y re-entrancia — un mock `run: fn => fn()`
 * no puede reproducir el defecto: lo tapa igual que el
 * `NoopDomainEventPublisher` de generar-preventivos.integration.spec.ts.
 *
 * Escenario: `CrearTicketUseCase` corriendo RE-ENTRANTE, anidado dentro de la
 * transacción de OTRO caller (así es como lo usa `GenerarPreventivosUseCase`,
 * ADR-PV5).
 */
describe('CrearTicketUseCase — publicación post-commit bajo re-entrancia (runner real)', () => {
  function makeCollaboradoresConRunnerReal() {
    const ticketRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const estadoRepo = { findIdByCodigo: vi.fn().mockResolvedValue('estado-nuevo-uuid') };
    const tipoTicketRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
            'tipo-soporte-uuid',
          ),
        ),
    };
    const prioridadRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          PrioridadEntity.create(
            { codigo: 'MEDIA', nombre: 'Media', color: null, orden: 2, activo: true },
            'prioridad-media-uuid',
          ),
        ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-cambio-estado-uuid'),
    };
    const usuarioMasterChecker = { existeEnTenant: vi.fn().mockResolvedValue(true) };
    const numerador = { generarNumero: vi.fn().mockResolvedValue(Result.ok('SOP-2026-00001')) };
    const resolverCicloActivo = {
      resolver: vi.fn().mockResolvedValue(
        Result.ok(
          CicloClienteEntity.create(
            {
              cicloVigenteId: 'ciclo-vigente-uuid',
              nombre: 'Ciclo 2026',
              fechaInicio: new Date('2026-01-01'),
              fechaFin: new Date('2026-12-31'),
              activo: true,
            },
            'ciclo-activo-uuid',
          ),
        ),
      ),
    };
    const eventPublisher = { publish: vi.fn() };

    const tenantContext = new TenantContext();
    const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

    const useCase = new CrearTicketUseCase(
      ticketRepo as never,
      operacionRepo as never,
      estadoRepo as never,
      tipoTicketRepo as never,
      prioridadRepo as never,
      tipoOperacionRepo as never,
      usuarioMasterChecker as never,
      numerador as never,
      resolverCicloActivo as never,
      { resolver: vi.fn().mockResolvedValue(null) },
      eventPublisher as never,
      txRunner,
    );

    return { useCase, txRunner, tenantContext, eventPublisher };
  }

  // Doble mínimo del PrismaClient "normal": $transaction ejecuta el callback
  // pasándole un tx double cualquiera (no se usa su contenido en estos tests).
  function makePrismaClientDouble() {
    const txClient = { $transaction: vi.fn() };
    return {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
    };
  }

  it('NO publica mientras la transacción MÁS EXTERNA sigue abierta; SÍ publica después de que comitea', async () => {
    const { useCase, txRunner, tenantContext, eventPublisher } = makeCollaboradoresConRunnerReal();
    const prismaClient = makePrismaClientDouble();

    let publicadoDuranteLaTx: boolean | undefined;

    await tenantContext.run({ prismaClient, dbName: 'test_db', clienteId: 'cliente-uuid' }, () =>
      txRunner.run(async () => {
        // Simula GenerarPreventivosUseCase: llama a CrearTicketUseCase DENTRO
        // de una transacción ya abierta por otro caller (re-entrante).
        const result = await useCase.execute(baseDto());
        expect(result.isOk()).toBe(true);
        publicadoDuranteLaTx = eventPublisher.publish.mock.calls.length > 0;
      }),
    );

    expect(publicadoDuranteLaTx).toBe(false);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('si la transacción MÁS EXTERNA hace ROLLBACK, el evento NUNCA se publica', async () => {
    const { useCase, txRunner, tenantContext, eventPublisher } = makeCollaboradoresConRunnerReal();
    const prismaClient = makePrismaClientDouble();

    await expect(
      tenantContext.run({ prismaClient, dbName: 'test_db', clienteId: 'cliente-uuid' }, () =>
        txRunner.run(async () => {
          const result = await useCase.execute(baseDto());
          expect(result.isOk()).toBe(true);
          throw new Error('rollback forzado por el caller externo');
        }),
      ),
    ).rejects.toThrow('rollback forzado por el caller externo');

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
