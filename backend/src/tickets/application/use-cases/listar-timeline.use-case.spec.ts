/**
 * T9.3 [UNIT] — RED→GREEN: `ListarTimelineUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre T18 (filtro de
 * visibilidad por `es_interno`: sin `OBSERVAR` sobre el tipo del ticket excluye
 * internas, con él incluye todo) y reusa el mismo scope de acceso que
 * `ObtenerTicketUseCase` (T6) — un actor sin `VER_TODOS` sobre el tipo y ajeno
 * al ticket recibe 404, para no filtrar el timeline (ni siquiera el público) a
 * un tercero sin acceso.
 *
 * Ref spec: sdd/tickets-core/spec T18, T6. Tarea: T9.3.
 */
import { ListarTimelineUseCase, ListarTimelineDto } from './listar-timeline.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';

const TIPO = 'tipo-soporte-uuid';

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

/** DTO de un actor con `acciones` sobre el tipo del ticket (por defecto, solo `LECTURA`). */
function baseDto(
  actorId = 'solicitante-uuid',
  acciones: readonly AccionTipoTicket[] = ['LECTURA'],
): ListarTimelineDto {
  return { ticketId: 'ticket-uuid', ...alcancePorTipo(actorId, { [TIPO]: acciones }) };
}

describe('ListarTimelineUseCase', () => {
  function makeCollaborators() {
    // `esVisiblePara` en false por defecto: sin tarea activa del actor (CA10).
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>(),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
    };
    const operacionRepo = { listByTicket: vi.fn<IOperacionTicketRepository['listByTicket']>() };

    const useCase = new ListarTimelineUseCase(ticketRepo, operacionRepo);

    return { useCase, ticketRepo, operacionRepo };
  }

  it('T18: actor CON OBSERVAR sobre el tipo ve el timeline completo (públicas + internas), en orden cronológico', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    const publica = makeOperacion({ esInterno: false, id: 'op-1' });
    const interna = makeOperacion({ esInterno: true, id: 'op-2' });
    c.operacionRepo.listByTicket.mockResolvedValue([publica, interna]);

    const result = await c.useCase.execute(
      baseDto('tecnico-uuid', ['LECTURA', 'VER_TODOS', 'OBSERVAR']),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([publica, interna]);
  });

  it('T18: actor SIN OBSERVAR sobre el tipo (solicitante) NUNCA ve operaciones es_interno=true', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('solicitante-uuid'));
    const publica = makeOperacion({ esInterno: false, id: 'op-1' });
    const interna = makeOperacion({ esInterno: true, id: 'op-2' });
    c.operacionRepo.listByTicket.mockResolvedValue([publica, interna]);

    const result = await c.useCase.execute(baseDto('solicitante-uuid'));

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

  it('T6-reuse: actor ajeno sin VER_TODOS → TicketNoEncontradoError (404), no revela ni el timeline público', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('otro-solicitante-uuid'));

    const result = await c.useCase.execute(baseDto('tercero-uuid'));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.operacionRepo.listByTicket).not.toHaveBeenCalled();
  });

  it('el técnico de una tarea activa ve el timeline público sin ver_todos (CA10)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('otro-solicitante-uuid'));
    c.ticketRepo.esVisiblePara.mockResolvedValue(true);
    const publica = makeOperacion({ esInterno: false, id: 'op-1' });
    const interna = makeOperacion({ esInterno: true, id: 'op-2' });
    c.operacionRepo.listByTicket.mockResolvedValue([publica, interna]);

    const result = await c.useCase.execute(baseDto('tecnico-uuid'));

    expect(result.getValue()).toEqual([publica]);
    expect(c.ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'tecnico-uuid');
  });

  it('actor con VER_TODOS pero SIN OBSERVAR accede al timeline de un ticket ajeno, filtrando internas', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('otro-solicitante-uuid'));
    const publica = makeOperacion({ esInterno: false, id: 'op-1' });
    c.operacionRepo.listByTicket.mockResolvedValue([publica]);

    const result = await c.useCase.execute(baseDto('colaborador-uuid', ['LECTURA', 'VER_TODOS']));

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([publica]);
  });

  it('ticket de solicitante externo (solicitanteId null): sin ver_todos → 404 y no lee el timeline', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(
      TicketEntity.create(
        {
          numero: 'SOP-2026-00002',
          titulo: 'Pedido del formulario publico',
          descripcion: null,
          tipoId: TIPO,
          estadoId: 'estado-uuid',
          prioridadId: 'prioridad-uuid',
          cicloId: null,
          ticketReferenciaId: null,
          solicitanteId: null,
          solicitanteExternoId: 'externo-uuid',
        },
        'ticket-uuid',
      ),
    );

    const result = await c.useCase.execute(baseDto('tercero-uuid'));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.operacionRepo.listByTicket).not.toHaveBeenCalled();
  });

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3, D5 c)', () => {
    it('un ticket de un tipo sin LECTURA es 404 aunque el actor sea el solicitante', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('solicitante-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        ...alcancePorTipo('solicitante-uuid', {
          'otro-tipo': ['LECTURA', 'VER_TODOS', 'OBSERVAR'],
        }),
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.operacionRepo.listByTicket).not.toHaveBeenCalled();
    });

    it('OBSERVAR sobre OTRO tipo no muestra las internas de este', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('solicitante-uuid'));
      const publica = makeOperacion({ esInterno: false, id: 'op-1' });
      const interna = makeOperacion({ esInterno: true, id: 'op-2' });
      c.operacionRepo.listByTicket.mockResolvedValue([publica, interna]);

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        ...alcancePorTipo('solicitante-uuid', { [TIPO]: ['LECTURA'], 'otro-tipo': ['OBSERVAR'] }),
      });

      expect(result.getValue()).toEqual([publica]);
    });

    it('ROOT o ADMINISTRADOR (sin restricción) ve el timeline completo', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('otro-solicitante-uuid'));
      const publica = makeOperacion({ esInterno: false, id: 'op-1' });
      const interna = makeOperacion({ esInterno: true, id: 'op-2' });
      c.operacionRepo.listByTicket.mockResolvedValue([publica, interna]);

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        ...alcanceSinRestriccion('admin-uuid'),
      });

      expect(result.getValue()).toEqual([publica, interna]);
    });

    it('`soloPublicas` excluye las internas aun con OBSERVAR (el PDF)', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('solicitante-uuid'));
      const publica = makeOperacion({ esInterno: false, id: 'op-1' });
      const interna = makeOperacion({ esInterno: true, id: 'op-2' });
      c.operacionRepo.listByTicket.mockResolvedValue([publica, interna]);

      const result = await c.useCase.execute({
        ...baseDto('solicitante-uuid', ['LECTURA', 'OBSERVAR']),
        soloPublicas: true,
      });

      expect(result.getValue()).toEqual([publica]);
    });
  });
});
