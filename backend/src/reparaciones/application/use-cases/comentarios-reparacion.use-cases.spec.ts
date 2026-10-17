/**
 * [USE CASE][RED→GREEN] — `CrearComentarioReparacionUseCase` y
 * `ListarComentariosReparacionUseCase`.
 *
 * Ambos comparten la misma precondición (la reparación tiene que existir y no
 * estar eliminada), así que viven en el mismo archivo: el camino feliz de
 * cada uno + el `Result.fail` compartido, parametrizado.
 */
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { ComentarioReparacionEntity } from '../../domain/entities/comentario-reparacion.entity';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { TareaTicketNoEditableError } from '../../../tickets/domain/errors/tareas.errors';
import {
  ComentarioReparacionNoPermitidoError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { CrearComentarioReparacionUseCase } from './crear-comentario-reparacion.use-case';
import { ListarComentariosReparacionUseCase } from './listar-comentarios-reparacion.use-case';

const REPARACION_ID = 'edilicia-uuid';
const AUTOR_ID = 'autor-uuid';

function reparacionActiva(): TicketEdiliciaEntity {
  return TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid', ubicacion: null }, REPARACION_ID);
}

function ticketActivo(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'ED-1',
      titulo: 'Pérdida en el baño',
      descripcion: null,
      tipoId: 'tipo-edilicia',
      estadoId: 'estado-en-proceso',
      prioridadId: 'prioridad-media',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

/** Deps del caso de uso con el ticket editable; `verificar` se pisa en los tests de la regla. */
function armarCrear(encontrado: TicketEdiliciaEntity | null = reparacionActiva()) {
  const ticketEdiliciaRepo = { findById: vi.fn().mockResolvedValue(encontrado) };
  const comentarioRepo = { crear: vi.fn().mockResolvedValue(undefined) };
  const ticketRepo = { findById: vi.fn().mockResolvedValue(ticketActivo()) };
  const verificador = { verificar: vi.fn().mockResolvedValue(Result.ok(undefined)) };
  const useCase = new CrearComentarioReparacionUseCase(
    ticketEdiliciaRepo,
    comentarioRepo,
    ticketRepo,
    verificador,
  );
  return { useCase, ticketEdiliciaRepo, comentarioRepo, ticketRepo, verificador };
}

function reparacionEliminada(): TicketEdiliciaEntity {
  const entity = reparacionActiva();
  entity.softDelete();
  return entity;
}

describe('CrearComentarioReparacionUseCase', () => {
  it('persiste el comentario recortado y lo devuelve', async () => {
    const { useCase, comentarioRepo } = armarCrear();

    const result = await useCase.execute({
      ticketEdiliciaId: REPARACION_ID,
      texto: '  Falta el repuesto X  ',
      autorId: AUTOR_ID,
    });

    expect(result.isOk()).toBe(true);
    const comentario = result.getValue();
    expect(comentario.texto).toBe('Falta el repuesto X');
    expect(comentario.ticketEdiliciaId).toBe(REPARACION_ID);
    expect(comentario.autorId).toBe(AUTOR_ID);
    expect(comentarioRepo.crear).toHaveBeenCalledWith(comentario);
  });

  it.each([
    ['la reparación no existe', null],
    ['la reparación está eliminada', reparacionEliminada()],
  ])('falla con TicketEdiliciaNoEncontradoError cuando %s', async (_label, encontrado) => {
    const { useCase, comentarioRepo } = armarCrear(encontrado);

    const result = await useCase.execute({
      ticketEdiliciaId: REPARACION_ID,
      texto: 'Falta el repuesto X',
      autorId: AUTOR_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    // No se escribe nada si la precondición no se cumple.
    expect(comentarioRepo.crear).not.toHaveBeenCalled();
  });
});

describe('CrearComentarioReparacionUseCase — ticket cerrado, cancelado o bloqueado (odd/ticket-cerrado-solo-lectura, S3)', () => {
  const DTO = { ticketEdiliciaId: REPARACION_ID, texto: 'Falta el repuesto X', autorId: AUTOR_ID };

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
      const { useCase, comentarioRepo, verificador, ticketRepo } = armarCrear();
      verificador.verificar.mockResolvedValue(Result.fail(new TareaTicketNoEditableError(motivo)));

      const result = await useCase.execute(DTO);

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(ComentarioReparacionNoPermitidoError);
      expect(error.message).toBe(mensaje);
      expect((error as ComentarioReparacionNoPermitidoError).motivo).toBe(motivo);
      expect(ticketRepo.findById).toHaveBeenCalledWith('ticket-uuid');
      expect(comentarioRepo.crear).not.toHaveBeenCalled();
    },
  );

  it('verifica el ticket de la reparación, no otro, y con el ticket editable persiste', async () => {
    const { useCase, comentarioRepo, verificador } = armarCrear();

    const result = await useCase.execute(DTO);

    expect(result.isOk()).toBe(true);
    expect(verificador.verificar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ticket-uuid' }),
    );
    expect(comentarioRepo.crear).toHaveBeenCalledTimes(1);
  });

  it('si el ticket de la reparación no existe, TicketNoEncontradoError sin consultar la regla', async () => {
    const { useCase, comentarioRepo, verificador, ticketRepo } = armarCrear();
    ticketRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(DTO);

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(verificador.verificar).not.toHaveBeenCalled();
    expect(comentarioRepo.crear).not.toHaveBeenCalled();
  });
});

describe('ListarComentariosReparacionUseCase', () => {
  it('devuelve los comentarios de la reparación', async () => {
    const comentario = ComentarioReparacionEntity.create({
      ticketEdiliciaId: REPARACION_ID,
      texto: 'Falta el repuesto X',
      autorId: AUTOR_ID,
    });
    const ticketEdiliciaRepo = { findById: vi.fn().mockResolvedValue(reparacionActiva()) };
    const comentarioRepo = {
      listarPorTicketEdilicia: vi.fn().mockResolvedValue([comentario]),
    };
    const useCase = new ListarComentariosReparacionUseCase(ticketEdiliciaRepo, comentarioRepo);

    const result = await useCase.execute(REPARACION_ID);

    expect(result.getValue()).toEqual([comentario]);
    expect(comentarioRepo.listarPorTicketEdilicia).toHaveBeenCalledWith(REPARACION_ID);
  });

  it.each([
    ['la reparación no existe', null],
    ['la reparación está eliminada', reparacionEliminada()],
  ])('falla con TicketEdiliciaNoEncontradoError cuando %s', async (_label, encontrado) => {
    const ticketEdiliciaRepo = { findById: vi.fn().mockResolvedValue(encontrado) };
    const comentarioRepo = { listarPorTicketEdilicia: vi.fn() };
    const useCase = new ListarComentariosReparacionUseCase(ticketEdiliciaRepo, comentarioRepo);

    const result = await useCase.execute(REPARACION_ID);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    // Un id inválido no se disfraza de listado vacío.
    expect(comentarioRepo.listarPorTicketEdilicia).not.toHaveBeenCalled();
  });
});
