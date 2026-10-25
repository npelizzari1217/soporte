/**
 * [USE CASE] — `ListarComentariosReparacionUseCase`.
 *
 * Desde odd/ticket-unificado (S3) el comentario de Edilicia es un COMENTARIO del timeline del
 * ticket: se lee del timeline, con su misma visibilidad. Desde T2b (L19) se escribe como comentario
 * interno con `CrearComentarioUseCase` de Tickets, que tiene sus propios tests. El caso de uso
 * recibe el id del ticket, el mismo que llega en la ruta; el 404 lo traduce `comoReparacion`.
 */
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { ListarTimelineUseCase } from '../../../tickets/application/use-cases/listar-timeline.use-case';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';
import { ListarComentariosReparacionUseCase } from './listar-comentarios-reparacion.use-case';

const TICKET_ID = 'ticket-uuid';
const AUTOR_ID = 'autor-uuid';
const TIPO_COMENTARIO = 'tipo-op-comentario';
/** ROOT y ADMINISTRADOR: los tests que no versan sobre permisos por tipo. */
const SIN_RESTRICCION = alcanceSinRestriccion(AUTOR_ID);

function ticketActivo(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'MAN-1',
      titulo: 'Pérdida en el baño',
      descripcion: null,
      tipoId: 'tipo-mantenimiento',
      estadoId: 'estado-en-proceso',
      prioridadId: 'prioridad-media',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    TICKET_ID,
  );
}

describe('ListarComentariosReparacionUseCase', () => {
  /** Una operación del timeline, de tipo y visibilidad dados, en un instante dado. */
  function operacion(
    id: string,
    tipoOperacionId: string,
    creadaEn: string,
    esInterno = false,
  ): OperacionTicketEntity {
    return OperacionTicketEntity.reconstitute(
      {
        ticketId: TICKET_ID,
        tipoOperacionId,
        descripcion: `texto ${id}`,
        estadoAnteriorId: null,
        estadoNuevoId: null,
        autorId: AUTOR_ID,
        esInterno,
        metadata: null,
      },
      id,
      new Date(creadaEn),
      new Date(creadaEn),
      null,
    );
  }

  /**
   * Timeline REAL (`ListarTimelineUseCase`) sobre un ticket con un cambio de estado, dos
   * comentarios públicos y uno interno: el caso de uso tiene que heredar su acceso y su
   * visibilidad, no reimplementarlos.
   */
  function armarListar() {
    const operaciones = [
      operacion('op-1-apertura', 'tipo-op-cambio-estado', '2026-10-01T10:00:00Z'),
      operacion('op-2-viejo', TIPO_COMENTARIO, '2026-10-01T11:00:00Z'),
      operacion('op-3-interno', TIPO_COMENTARIO, '2026-10-01T12:00:00Z', true),
      operacion('op-4-nuevo', TIPO_COMENTARIO, '2026-10-01T13:00:00Z'),
    ];
    const ticketRepo = {
      findById: vi.fn().mockResolvedValue(ticketActivo()),
      esVisiblePara: vi.fn().mockResolvedValue(false),
    };
    const operacionRepo = { listByTicket: vi.fn().mockResolvedValue(operaciones) };
    const tipoOperacionRepo = { findIdByCodigo: vi.fn().mockResolvedValue(TIPO_COMENTARIO) };
    const useCase = new ListarComentariosReparacionUseCase(
      new ListarTimelineUseCase(ticketRepo, operacionRepo),
      tipoOperacionRepo,
    );
    return { useCase, ticketRepo, operacionRepo };
  }

  const ids = (ops: OperacionTicketEntity[]): string[] => ops.map((op) => op.id);

  it('con OBSERVAR: los comentarios, internos incluidos, del más nuevo al más viejo, sin el cambio de estado', async () => {
    const { useCase, operacionRepo } = armarListar();

    const result = await useCase.execute(TICKET_ID, SIN_RESTRICCION);

    expect(ids(result.getValue())).toEqual(['op-4-nuevo', 'op-3-interno', 'op-2-viejo']);
    expect(operacionRepo.listByTicket).toHaveBeenCalledWith(TICKET_ID);
  });

  it('sin OBSERVAR sobre el tipo: solo los públicos, igual que el timeline', async () => {
    const { useCase } = armarListar();

    const result = await useCase.execute(
      TICKET_ID,
      alcancePorTipo(AUTOR_ID, { 'tipo-mantenimiento': ['LECTURA', 'VER_TODOS'] }),
    );

    expect(ids(result.getValue())).toEqual(['op-4-nuevo', 'op-2-viejo']);
  });

  it('dos comentarios del mismo instante: desempata por id, el mayor primero', async () => {
    const { useCase, operacionRepo } = armarListar();
    operacionRepo.listByTicket.mockResolvedValue([
      operacion('0190a-b', TIPO_COMENTARIO, '2026-10-01T11:00:00Z'),
      operacion('0190a-c', TIPO_COMENTARIO, '2026-10-01T11:00:00Z'),
      operacion('0190a-a', TIPO_COMENTARIO, '2026-10-01T11:00:00Z'),
    ]);

    const result = await useCase.execute(TICKET_ID, SIN_RESTRICCION);

    expect(ids(result.getValue())).toEqual(['0190a-c', '0190a-b', '0190a-a']);
  });

  it('sin LECTURA sobre el tipo del ticket → 404, sin leer el timeline', async () => {
    const { useCase, operacionRepo } = armarListar();

    const result = await useCase.execute(
      TICKET_ID,
      alcancePorTipo(AUTOR_ID, { 'tipo-otro': ['LECTURA', 'VER_TODOS', 'OBSERVAR'] }),
    );

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(operacionRepo.listByTicket).not.toHaveBeenCalled();
  });

  it('un ticket que no existe es 404, no un listado vacío', async () => {
    const { useCase, ticketRepo, operacionRepo } = armarListar();
    ticketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(TICKET_ID, SIN_RESTRICCION);

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(operacionRepo.listByTicket).not.toHaveBeenCalled();
  });
});
