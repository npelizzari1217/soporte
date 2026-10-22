/**
 * T6.3 [UNIT] — RED→GREEN: `ObtenerTicketUseCase` (T6 — scope por rol).
 *
 * Ref spec: sdd/tickets-core/spec T6. Tarea: T6.3.
 */
import { ObtenerTicketUseCase } from './obtener-ticket.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';

const TIPO = 'tipo-uuid';

function makeTicket(
  overrides: { solicitanteId?: string; id?: string; tipoId?: string } = {},
): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de test',
      descripcion: null,
      tipoId: overrides.tipoId ?? TIPO,
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
    const useCase = new ObtenerTicketUseCase(ticketRepo);
    return { useCase, ticketRepo };
  }

  it('actor con ticket:ver_todos puede ver cualquier ticket del tenant', async () => {
    const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      ...alcancePorTipo('actor-uuid', { [TIPO]: ['LECTURA', 'VER_TODOS'] }),
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().id).toBe('ticket-uuid');
  });

  it('actor SIN ver_todos ve su propio ticket (solicitante)', async () => {
    const ticket = makeTicket({ solicitanteId: 'actor-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      ...alcancePorTipo('actor-uuid', { [TIPO]: ['LECTURA'] }),
    });

    expect(result.isOk()).toBe(true);
  });

  it('actor SIN ver_todos y NO es el solicitante → 404 (no revela existencia)', async () => {
    const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      ...alcancePorTipo('actor-uuid', { [TIPO]: ['LECTURA'] }),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket inexistente → TicketNoEncontradoError', async () => {
    const { useCase } = makeUseCase(null);

    const result = await useCase.execute({
      ticketId: 'no-existe',
      ...alcancePorTipo('actor-uuid', { [TIPO]: ['LECTURA', 'VER_TODOS'] }),
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
      ...alcancePorTipo('solicitante-uuid', { [TIPO]: ['LECTURA', 'VER_TODOS'] }),
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
      ...alcancePorTipo('actor-uuid', { [TIPO]: ['LECTURA'] }),
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
      ...alcancePorTipo('actor-uuid', { [TIPO]: ['LECTURA', 'VER_TODOS'] }),
    });

    expect(result.isOk()).toBe(true);
  });

  it('actor SIN ver_todos que es técnico de una tarea activa ve el ticket (CA10)', async () => {
    const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
    const { useCase, ticketRepo } = makeUseCase(ticket, true);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      ...alcancePorTipo('tecnico-uuid', { [TIPO]: ['LECTURA'] }),
    });

    expect(result.getValue()).toBe(ticket);
    expect(ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'tecnico-uuid');
  });

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3)', () => {
    function makeDeTipo(tipoId: string) {
      const ticket = makeTicket({ solicitanteId: 'actor-uuid', tipoId });
      const ticketRepo = {
        findById: vi.fn<ITicketRepository['findById']>().mockResolvedValue(ticket),
        esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(true),
      };
      return new ObtenerTicketUseCase(ticketRepo);
    }
    const alcance = alcancePorTipo('actor-uuid', {
      'tipo-soporte': ['LECTURA', 'MODIFICACION'],
      'tipo-mantenimiento': ['LECTURA'],
    });

    it('un ticket de un tipo sin LECTURA es 404 aunque el actor sea su solicitante', async () => {
      const result = await makeDeTipo('tipo-electricidad').execute({
        ticketId: 'ticket-uuid',
        ...alcance,
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    });

    it.each(['tipo-soporte', 'tipo-mantenimiento'])(
      'un ticket de un tipo con LECTURA se ve (%s), con o sin otras acciones',
      async (tipoId) => {
        const result = await makeDeTipo(tipoId).execute({ ticketId: 'ticket-uuid', ...alcance });

        expect(result.getValue().tipoId).toBe(tipoId);
      },
    );

    it('sin restricción (ROOT o ADMINISTRADOR) ve un tipo sin filas', async () => {
      const result = await makeDeTipo('tipo-electricidad').execute({
        ticketId: 'ticket-uuid',
        ...alcanceSinRestriccion('actor-uuid'),
      });

      expect(result.isOk()).toBe(true);
    });
  });
});
