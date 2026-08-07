/**
 * T9.3 [UNIT] — RED→GREEN: `ListarTimelineUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre T18 (filtro de
 * visibilidad por `es_interno`: sin `ticket:observar` excluye internas, con
 * él incluye todo) y reusa el mismo scope de acceso que `ObtenerTicketUseCase`
 * (T6) — un actor sin `ticket:ver_todos` y ajeno al ticket recibe 404, para
 * no filtrar el timeline (ni siquiera el público) a un tercero sin acceso.
 *
 * Ref spec: sdd/tickets-core/spec T18, T6. Tarea: T9.3.
 */
import { ListarTimelineUseCase, ListarTimelineDto } from './listar-timeline.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';

function makeTicket(solicitanteId = 'solicitante-uuid'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: 'tipo-soporte-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId,
    },
    'ticket-uuid',
  );
}

function makeOperacion(
  overrides: Partial<{ esInterno: boolean; id: string }> = {},
): OperacionTicketEntity {
  return OperacionTicketEntity.create(
    {
      ticketId: 'ticket-uuid',
      tipoOperacionId: 'tipo-op-uuid',
      descripcion: 'texto',
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: 'autor-uuid',
      esInterno: overrides.esInterno ?? false,
      metadata: null,
    },
    overrides.id,
  );
}

function baseDto(overrides: Partial<ListarTimelineDto> = {}): ListarTimelineDto {
  return {
    ticketId: 'ticket-uuid',
    actorId: 'solicitante-uuid',
    tienePermisoVerTodos: false,
    tienePermisoObservar: false,
    ...overrides,
  };
}

describe('ListarTimelineUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = { findById: vi.fn() };
    const operacionRepo = { listByTicket: vi.fn() };

    const useCase = new ListarTimelineUseCase(ticketRepo as never, operacionRepo as never);

    return { useCase, ticketRepo, operacionRepo };
  }

  it('T18: actor CON ticket:observar ve el timeline completo (públicas + internas), en orden cronológico', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    const publica = makeOperacion({ esInterno: false, id: 'op-1' });
    const interna = makeOperacion({ esInterno: true, id: 'op-2' });
    c.operacionRepo.listByTicket.mockResolvedValue([publica, interna]);

    const result = await c.useCase.execute(
      baseDto({ actorId: 'tecnico-uuid', tienePermisoVerTodos: true, tienePermisoObservar: true }),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([publica, interna]);
  });

  it('T18: actor SIN ticket:observar (solicitante) NUNCA ve operaciones es_interno=true', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('solicitante-uuid'));
    const publica = makeOperacion({ esInterno: false, id: 'op-1' });
    const interna = makeOperacion({ esInterno: true, id: 'op-2' });
    c.operacionRepo.listByTicket.mockResolvedValue([publica, interna]);

    const result = await c.useCase.execute(
      baseDto({
        actorId: 'solicitante-uuid',
        tienePermisoVerTodos: false,
        tienePermisoObservar: false,
      }),
    );

    expect(result.isOk()).toBe(true);
    const timeline = result.getValue();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].id).toBe('op-1');
    expect(timeline.every((op) => !op.esInterno)).toBe(true);
  });

  it('ticket inexistente → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.operacionRepo.listByTicket).not.toHaveBeenCalled();
  });

  it('ticket soft-deleted → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket();
    ticket.softDelete();
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('T6-reuse: actor ajeno sin ticket:ver_todos → TicketNoEncontradoError (404), no revela ni el timeline público', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('otro-solicitante-uuid'));

    const result = await c.useCase.execute(
      baseDto({ actorId: 'tercero-uuid', tienePermisoVerTodos: false }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.operacionRepo.listByTicket).not.toHaveBeenCalled();
  });

  it('actor con ticket:ver_todos pero SIN ticket:observar accede al timeline de un ticket ajeno, filtrando internas', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('otro-solicitante-uuid'));
    const publica = makeOperacion({ esInterno: false, id: 'op-1' });
    c.operacionRepo.listByTicket.mockResolvedValue([publica]);

    const result = await c.useCase.execute(
      baseDto({
        actorId: 'colaborador-uuid',
        tienePermisoVerTodos: true,
        tienePermisoObservar: false,
      }),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([publica]);
  });
});
