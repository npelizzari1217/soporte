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
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { TicketCreadoEvent } from '../../domain/events/ticket-creado.event';
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
            { codigo: 'SOPORTE', nombre: 'Soporte', activo: true },
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
    // preserva la semántica "corre dentro de la tx" para los tests.
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
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
});
