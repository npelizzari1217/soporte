/**
 * T6.3 [UNIT] — RED→GREEN: `ObtenerTicketUseCase` (T6 — scope por rol).
 *
 * Ref spec: sdd/tickets-core/spec T6. Tarea: T6.3.
 */
import { ObtenerTicketUseCase } from './obtener-ticket.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { Modulo } from '../../../shared/domain/modulos';

function makeTicket(overrides: { solicitanteId?: string; id?: string } = {}): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de test',
      descripcion: null,
      tipoId: 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: overrides.solicitanteId ?? 'solicitante-uuid',
    },
    overrides.id ?? 'ticket-uuid',
  );
}

describe('ObtenerTicketUseCase', () => {
  function makeUseCase(ticket: TicketEntity | null, tieneTareaActiva = false) {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticket),
      // CA10: el repositorio decide si el actor es técnico de una tarea activa del ticket.
      esVisiblePara: vi
        .fn<ITicketRepository['esVisiblePara']>()
        .mockResolvedValue(tieneTareaActiva),
    };
    // Sin restricción de módulo en estos casos: el repo de tipos no se consulta.
    const useCase = new ObtenerTicketUseCase(ticketRepo, { findById: vi.fn() });
    return { useCase, ticketRepo };
  }

  it('actor con ticket:ver_todos puede ver cualquier ticket del tenant', async () => {
    const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: true,
      modulosPermitidos: null,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().id).toBe('ticket-uuid');
  });

  it('actor SIN ver_todos ve su propio ticket (solicitante)', async () => {
    const ticket = makeTicket({ solicitanteId: 'actor-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: false,
      modulosPermitidos: null,
    });

    expect(result.isOk()).toBe(true);
  });

  it('actor SIN ver_todos y NO es el solicitante → 404 (no revela existencia)', async () => {
    const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: false,
      modulosPermitidos: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket inexistente → TicketNoEncontradoError', async () => {
    const { useCase } = makeUseCase(null);

    const result = await useCase.execute({
      ticketId: 'no-existe',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: true,
      modulosPermitidos: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket soft-deleted se trata como inexistente → TicketNoEncontradoError', async () => {
    const ticket = makeTicket();
    ticket.softDelete();
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'solicitante-uuid',
      tienePermisoVerTodos: true,
      modulosPermitidos: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket de solicitante externo (solicitanteId null): sin ver_todos se deniega con 404', async () => {
    const ticket = TicketEntity.create(
      {
        numero: 'SOP-2026-00002',
        titulo: 'Pedido del formulario publico',
        descripcion: null,
        tipoId: 'tipo-uuid',
        estadoId: 'estado-uuid',
        prioridadId: 'prioridad-uuid',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: null,
        solicitanteExternoId: 'externo-uuid',
      },
      'ticket-uuid',
    );
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: false,
      modulosPermitidos: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket de solicitante externo: con ver_todos se puede ver', async () => {
    const ticket = TicketEntity.create(
      {
        numero: 'SOP-2026-00002',
        titulo: 'Pedido del formulario publico',
        descripcion: null,
        tipoId: 'tipo-uuid',
        estadoId: 'estado-uuid',
        prioridadId: 'prioridad-uuid',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: null,
        solicitanteExternoId: 'externo-uuid',
      },
      'ticket-uuid',
    );
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: true,
      modulosPermitidos: null,
    });

    expect(result.isOk()).toBe(true);
  });

  it('actor SIN ver_todos que es técnico de una tarea activa ve el ticket (CA10)', async () => {
    const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
    const { useCase, ticketRepo } = makeUseCase(ticket, true);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'tecnico-uuid',
      tienePermisoVerTodos: false,
      modulosPermitidos: null,
    });

    expect(result.getValue()).toBe(ticket);
    expect(ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'tecnico-uuid');
  });

  describe('módulo del tipo (odd/permisos-por-tipo-ticket, S0)', () => {
    function makeConTipo(moduloDelTipo: Modulo) {
      const ticket = makeTicket({ solicitanteId: 'actor-uuid' });
      const ticketRepo = {
        findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticket),
        esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(true),
      };
      const tipoTicketRepo = {
        findById: vi.fn().mockResolvedValue(
          TipoTicketEntity.create(
            {
              codigo: 'MANTENIMIENTO',
              nombre: 'Mantenimiento',
              modulo: moduloDelTipo,
              activo: true,
            },
            'tipo-uuid',
          ),
        ),
      };
      return new ObtenerTicketUseCase(ticketRepo, tipoTicketRepo);
    }

    it('un ticket de un tipo de otro módulo es 404 aunque el actor sea su solicitante y tenga VER_TODOS', async () => {
      const result = await makeConTipo('EDILICIA').execute({
        ticketId: 'ticket-uuid',
        actorId: 'actor-uuid',
        tienePermisoVerTodos: true,
        modulosPermitidos: ['TICKETS'],
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    });

    it('un ticket de un tipo de sus módulos se ve', async () => {
      const result = await makeConTipo('TICKETS').execute({
        ticketId: 'ticket-uuid',
        actorId: 'actor-uuid',
        tienePermisoVerTodos: false,
        modulosPermitidos: ['TICKETS'],
      });

      expect(result.isOk()).toBe(true);
    });

    it('sin restricción de módulo (ROOT o ADMINISTRADOR) ve un tipo de cualquier módulo', async () => {
      const result = await makeConTipo('EDILICIA').execute({
        ticketId: 'ticket-uuid',
        actorId: 'actor-uuid',
        tienePermisoVerTodos: true,
        modulosPermitidos: null,
      });

      expect(result.isOk()).toBe(true);
    });
  });
});
