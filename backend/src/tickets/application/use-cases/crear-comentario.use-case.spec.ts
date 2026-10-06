/**
 * T9.1/T9.2 [UNIT] — RED→GREEN: `CrearComentarioUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre T16 (comentario
 * público visible + evento POST-persist, rechazo 422 en estado terminal),
 * T17 (comentario interno, sin evento, sin restricción de estado).
 *
 * Ref spec: sdd/tickets-core/spec T16, T17. Ref design: ADR-6. Tarea: T9.1, T9.2.
 */
import { CrearComentarioUseCase, CrearComentarioDto } from './crear-comentario.use-case';
import type { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketComentadoEvent } from '../../domain/events/ticket-comentado.event';
import {
  TicketNoEncontradoError,
  ComentarioNoPermitidoError,
} from '../../domain/errors/tickets.errors';

const ESTADOS: Record<string, EstadoEntity> = {
  NUEVO: EstadoEntity.create(
    { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 1, activo: true },
    'estado-nuevo-uuid',
  ),
  RESUELTO: EstadoEntity.create(
    { codigo: 'RESUELTO', nombre: 'Resuelto', color: null, orden: 4, activo: true },
    'estado-resuelto-uuid',
  ),
  CERRADO: EstadoEntity.create(
    { codigo: 'CERRADO', nombre: 'Cerrado', color: null, orden: 5, activo: true },
    'estado-cerrado-uuid',
  ),
  CANCELADO: EstadoEntity.create(
    { codigo: 'CANCELADO', nombre: 'Cancelado', color: null, orden: 6, activo: true },
    'estado-cancelado-uuid',
  ),
};

function makeTicket(
  estadoCodigo: keyof typeof ESTADOS = 'NUEVO',
  origen: { solicitanteId: string | null; solicitanteExternoId?: string | null } = {
    solicitanteId: 'solicitante-uuid',
  },
): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: 'tipo-soporte-uuid',
      estadoId: ESTADOS[estadoCodigo].id,
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      ...origen,
    },
    'ticket-uuid',
  );
}

function baseDto(overrides: Partial<CrearComentarioDto> = {}): CrearComentarioDto {
  return {
    ticketId: 'ticket-uuid',
    texto: 'Un comentario de prueba',
    autorId: 'autor-uuid',
    esInterno: false,
    ...overrides,
  };
}

describe('CrearComentarioUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = { findById: vi.fn() };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const estadoRepo = {
      findById: vi.fn((id: string) =>
        Promise.resolve(Object.values(ESTADOS).find((e) => e.id === id) ?? null),
      ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-comentario-uuid'),
    };
    const eventPublisher = { publish: vi.fn() };
    const txRunner = {
      llamadas: 0,
      async run<T>(fn: () => Promise<T>): Promise<T> {
        this.llamadas += 1;
        return fn();
      },
      alCommitear: vi.fn(),
    } satisfies ITenantTransactionRunner & { llamadas: number };
    const primeraRespuestaRepo = { registrarSiFalta: vi.fn().mockResolvedValue(undefined) };

    const useCase = new CrearComentarioUseCase(
      ticketRepo as never,
      operacionRepo as never,
      estadoRepo as never,
      tipoOperacionRepo as never,
      eventPublisher as never,
      txRunner,
      primeraRespuestaRepo,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoOperacionRepo,
      eventPublisher,
      txRunner,
      primeraRespuestaRepo,
    };
  }

  it('T16: comentario público en ticket NUEVO — crea operación COMENTARIO es_interno=false y emite TicketComentadoEvent', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(
      baseDto({ esInterno: false, texto: 'Hola, ¿alguna novedad?' }),
    );

    expect(result.isOk()).toBe(true);
    const operacion = result.getValue();
    expect(operacion.ticketId).toBe('ticket-uuid');
    expect(operacion.tipoOperacionId).toBe('tipo-op-comentario-uuid');
    expect(operacion.descripcion).toBe('Hola, ¿alguna novedad?');
    expect(operacion.esInterno).toBe(false);
    expect(operacion.autorId).toBe('autor-uuid');
    expect(c.operacionRepo.save).toHaveBeenCalledWith(operacion);

    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0] as TicketComentadoEvent;
    expect(evento).toBeInstanceOf(TicketComentadoEvent);
    expect(evento.name).toBe('ticket.comentado');
    expect(evento.ticketId).toBe('ticket-uuid');
    expect(evento.autorId).toBe('autor-uuid');
  });

  it.each(['RESUELTO', 'CERRADO', 'CANCELADO'] as const)(
    'T16: comentario público rechazado (422) si el ticket está en estado terminal %s',
    async (estadoCodigo) => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket(estadoCodigo));

      const result = await c.useCase.execute(baseDto({ esInterno: false }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ComentarioNoPermitidoError);
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
      expect(c.eventPublisher.publish).not.toHaveBeenCalled();
    },
  );

  it('T17: comentario interno — crea operación es_interno=true, NUNCA emite evento', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(
      baseDto({ esInterno: true, texto: 'Nota técnica interna' }),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue().esInterno).toBe(true);
    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('T17: comentario interno se permite incluso en estado terminal (CERRADO) — solo T16 restringe por estado', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('CERRADO'));

    const result = await c.useCase.execute(baseDto({ esInterno: true }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().esInterno).toBe(true);
    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('ticket inexistente → TicketNoEncontradoError (404), sin persistir', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.operacionRepo.save).not.toHaveBeenCalled();
  });

  it('ticket soft-deleted → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket('NUEVO');
    ticket.softDelete();
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('publisher que lanza → log-and-swallow, Result.ok igual (el comentario ya persistido no se revierte)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
    c.eventPublisher.publish.mockImplementation(() => {
      throw new Error('boom: listener roto');
    });

    const result = await c.useCase.execute(baseDto({ esInterno: false }));

    expect(result.isOk()).toBe(true);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
  });

  describe('primera respuesta (sla-primera-respuesta R1)', () => {
    it('comentario público de un técnico registra la fecha de la operación, dentro de la tx', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      const result = await c.useCase.execute(baseDto({ esInterno: false }));

      const operacion = result.getValue();
      expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledTimes(1);
      expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledWith(
        'ticket-uuid',
        operacion.createdAt,
      );
      expect(c.txRunner.llamadas).toBe(1);
    });

    it('registra después de guardar la operación, ambos dentro de la misma tx', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
      const orden: string[] = [];
      c.operacionRepo.save.mockImplementation(() => {
        orden.push('save');
        return Promise.resolve();
      });
      c.primeraRespuestaRepo.registrarSiFalta.mockImplementation(() => {
        orden.push('registrar');
        return Promise.resolve();
      });
      c.txRunner.run = async <T>(fn: () => Promise<T>): Promise<T> => {
        orden.push('tx-inicio');
        const r = await fn();
        orden.push('tx-fin');
        return r;
      };

      await c.useCase.execute(baseDto({ esInterno: false }));

      expect(orden).toEqual(['tx-inicio', 'save', 'registrar', 'tx-fin']);
    });

    it('un comentario interno no la registra', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      await c.useCase.execute(baseDto({ esInterno: true }));

      expect(c.primeraRespuestaRepo.registrarSiFalta).not.toHaveBeenCalled();
    });

    it('un comentario público del propio solicitante no la registra', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      await c.useCase.execute(baseDto({ esInterno: false, autorId: 'solicitante-uuid' }));

      expect(c.primeraRespuestaRepo.registrarSiFalta).not.toHaveBeenCalled();
      expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('solicitante externo (solicitanteId null): cualquier autor interno la registra', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(
        makeTicket('NUEVO', { solicitanteId: null, solicitanteExternoId: 'externo-uuid' }),
      );

      await c.useCase.execute(baseDto({ esInterno: false, autorId: 'cualquier-interno-uuid' }));

      expect(c.primeraRespuestaRepo.registrarSiFalta).toHaveBeenCalledTimes(1);
    });

    it('un rechazo por estado terminal no registra nada', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('CERRADO'));

      await c.useCase.execute(baseDto({ esInterno: false }));

      expect(c.txRunner.llamadas).toBe(0);
      expect(c.primeraRespuestaRepo.registrarSiFalta).not.toHaveBeenCalled();
    });
  });
});
