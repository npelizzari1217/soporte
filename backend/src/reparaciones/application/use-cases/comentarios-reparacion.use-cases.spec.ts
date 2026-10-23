/**
 * [USE CASE] — `CrearComentarioReparacionUseCase` y `ListarComentariosReparacionUseCase`.
 *
 * Desde odd/ticket-unificado (S3) el comentario de Edilicia es un COMENTARIO del timeline del
 * ticket: se escribe como operación pública y se lee del timeline, con su misma visibilidad. Los
 * dos casos de uso reciben el id del ticket; traducir el id de la reparación es de
 * `ResolutorReparacion`.
 */
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { ListarTimelineUseCase } from '../../../tickets/application/use-cases/listar-timeline.use-case';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';
import { TareaTicketNoEditableError } from '../../../tickets/domain/errors/tareas.errors';
import { ComentarioReparacionNoPermitidoError } from '../../domain/errors/reparaciones.errors';
import { CrearComentarioReparacionUseCase } from './crear-comentario-reparacion.use-case';
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

/** Deps del caso de uso con el ticket editable; `verificar` se pisa en los tests de la regla. */
function armarCrear() {
  const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
  const tipoOperacionRepo = { findIdByCodigo: vi.fn().mockResolvedValue(TIPO_COMENTARIO) };
  const ticketRepo = {
    findById: vi.fn().mockResolvedValue(ticketActivo()),
    // El autor no solicitó el ticket ni es su responsable ni técnico de una tarea.
    esVisiblePara: vi.fn().mockResolvedValue(false),
  };
  const verificador = { verificar: vi.fn().mockResolvedValue(Result.ok(undefined)) };
  const useCase = new CrearComentarioReparacionUseCase(
    ticketRepo,
    operacionRepo,
    tipoOperacionRepo,
    verificador,
  );
  return { useCase, operacionRepo, tipoOperacionRepo, ticketRepo, verificador };
}

describe('CrearComentarioReparacionUseCase', () => {
  it('asienta un COMENTARIO público en el timeline del ticket, con el texto recortado', async () => {
    const { useCase, operacionRepo, tipoOperacionRepo } = armarCrear();

    const result = await useCase.execute({
      ticketId: TICKET_ID,
      texto: '  Falta el repuesto X  ',
      autorId: AUTOR_ID,
      alcance: SIN_RESTRICCION,
    });

    expect(result.isOk()).toBe(true);
    const comentario = result.getValue();
    expect(comentario.ticketId).toBe(TICKET_ID);
    expect(comentario.tipoOperacionId).toBe(TIPO_COMENTARIO);
    expect(comentario.descripcion).toBe('Falta el repuesto X');
    expect(comentario.autorId).toBe(AUTOR_ID);
    expect(comentario.esInterno).toBe(false);
    expect(tipoOperacionRepo.findIdByCodigo).toHaveBeenCalledWith('COMENTARIO');
    expect(operacionRepo.save).toHaveBeenCalledWith(comentario);
  });

  it.each([
    ['vacío', '   '],
    ['de más de 2000 caracteres', 'a'.repeat(2001)],
  ])('un texto %s es una precondición rota: throw, sin escribir', async (_caso, texto) => {
    const { useCase, operacionRepo } = armarCrear();

    await expect(
      useCase.execute({ ticketId: TICKET_ID, texto, autorId: AUTOR_ID, alcance: SIN_RESTRICCION }),
    ).rejects.toThrow('el texto tiene que tener entre 1 y 2000 caracteres');
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  it.each([
    ['no existe', null],
    [
      'está borrado',
      (() => {
        const t = ticketActivo();
        t.softDelete(new Date('2026-10-22T15:00:00Z'));
        return t;
      })(),
    ],
  ])(
    'el ticket %s → TicketNoEncontradoError, sin consultar la regla ni escribir',
    async (_c, t) => {
      const { useCase, operacionRepo, verificador, ticketRepo } = armarCrear();
      ticketRepo.findById.mockResolvedValue(t);

      const result = await useCase.execute({
        ticketId: TICKET_ID,
        texto: 'Falta el repuesto X',
        autorId: AUTOR_ID,
        alcance: SIN_RESTRICCION,
      });

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(verificador.verificar).not.toHaveBeenCalled();
      expect(operacionRepo.save).not.toHaveBeenCalled();
    },
  );
});

describe('CrearComentarioReparacionUseCase — ticket cerrado, cancelado o bloqueado (odd/ticket-cerrado-solo-lectura, S3)', () => {
  const DTO = {
    ticketId: TICKET_ID,
    texto: 'Falta el repuesto X',
    autorId: AUTOR_ID,
    alcance: SIN_RESTRICCION,
  };

  it.each([
    ['cerrado', 'El ticket está cerrado y no acepta comentarios nuevos.'],
    ['cancelado', 'El ticket está cancelado y no acepta comentarios nuevos.'],
    [
      'bloqueado',
      'La reparación está bloqueada por una compra en curso y no acepta comentarios nuevos.',
    ],
  ] as const)(
    'con el ticket %s falla con ComentarioReparacionNoPermitidoError y no escribe',
    async (motivo, mensaje) => {
      const { useCase, operacionRepo, verificador } = armarCrear();
      verificador.verificar.mockResolvedValue(Result.fail(new TareaTicketNoEditableError(motivo)));

      const result = await useCase.execute(DTO);

      const error = result.getError();
      expect(error).toBeInstanceOf(ComentarioReparacionNoPermitidoError);
      expect(error.message).toBe(mensaje);
      expect((error as ComentarioReparacionNoPermitidoError).motivo).toBe(motivo);
      expect(operacionRepo.save).not.toHaveBeenCalled();
    },
  );

  it('verifica el ticket pedido, no otro, y con el ticket editable persiste', async () => {
    const { useCase, operacionRepo, verificador } = armarCrear();

    const result = await useCase.execute(DTO);

    expect(result.isOk()).toBe(true);
    expect(verificador.verificar).toHaveBeenCalledWith(expect.objectContaining({ id: TICKET_ID }));
    expect(operacionRepo.save).toHaveBeenCalledTimes(1);
  });
});

describe('CrearComentarioReparacionUseCase — permisos por tipo del ticket (odd/permisos-por-tipo-ticket, D5 c)', () => {
  const dto = (alcance: AlcanceActorTicket) => ({
    ticketId: TICKET_ID,
    texto: 'Falta el repuesto X',
    autorId: AUTOR_ID,
    alcance,
  });

  it.each([
    ['sin LECTURA sobre el tipo', { 'tipo-mantenimiento': ['ALTAS', 'COMENTAR'] }],
    [
      'con LECTURA sin VER_TODOS y fuera de la regla de fila',
      { 'tipo-mantenimiento': ['LECTURA', 'COMENTAR'] },
    ],
  ] as const)('%s → TicketNoEncontradoError (404), sin escribir', async (_caso, permisos) => {
    const { useCase, operacionRepo, verificador } = armarCrear();

    const result = await useCase.execute(dto(alcancePorTipo(AUTOR_ID, permisos)));

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(verificador.verificar).not.toHaveBeenCalled();
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  it('lo ve sin ALTAS ni COMENTAR sobre el tipo → 403, sin escribir', async () => {
    const { useCase, operacionRepo } = armarCrear();

    const result = await useCase.execute(
      dto(
        alcancePorTipo(AUTOR_ID, {
          'tipo-mantenimiento': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
        }),
      ),
    );

    expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
    expect(result.getError().message).toBe(
      'El usuario no tiene el permiso "ALTAS o COMENTAR" sobre el tipo de este ticket.',
    );
    expect(operacionRepo.save).not.toHaveBeenCalled();
  });

  it.each([['ALTAS'], ['COMENTAR']] as const)(
    'lo ve con %s sobre el tipo → persiste',
    async (accion) => {
      const { useCase, operacionRepo } = armarCrear();

      const result = await useCase.execute(
        dto(alcancePorTipo(AUTOR_ID, { 'tipo-mantenimiento': ['LECTURA', 'VER_TODOS', accion] })),
      );

      expect(result.isOk()).toBe(true);
      expect(operacionRepo.save).toHaveBeenCalledTimes(1);
    },
  );

  it('por la regla de fila (es el solicitante) con COMENTAR → persiste', async () => {
    const { useCase, operacionRepo, ticketRepo } = armarCrear();
    ticketRepo.esVisiblePara.mockResolvedValue(true);

    const result = await useCase.execute(
      dto(alcancePorTipo(AUTOR_ID, { 'tipo-mantenimiento': ['LECTURA', 'COMENTAR'] })),
    );

    expect(result.isOk()).toBe(true);
    expect(operacionRepo.save).toHaveBeenCalledTimes(1);
  });
});

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
