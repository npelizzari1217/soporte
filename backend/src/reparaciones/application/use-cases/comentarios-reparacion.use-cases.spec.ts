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
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';
import { CrearComentarioReparacionUseCase } from './crear-comentario-reparacion.use-case';
import { ListarComentariosReparacionUseCase } from './listar-comentarios-reparacion.use-case';

const REPARACION_ID = 'edilicia-uuid';
const AUTOR_ID = 'autor-uuid';

function reparacionActiva(): TicketEdiliciaEntity {
  return TicketEdiliciaEntity.create({ ticketId: 'ticket-uuid', ubicacion: null }, REPARACION_ID);
}

function reparacionEliminada(): TicketEdiliciaEntity {
  const entity = reparacionActiva();
  entity.softDelete();
  return entity;
}

describe('CrearComentarioReparacionUseCase', () => {
  it('persiste el comentario recortado y lo devuelve', async () => {
    const ticketEdiliciaRepo = { findById: vi.fn().mockResolvedValue(reparacionActiva()) };
    const comentarioRepo = { crear: vi.fn().mockResolvedValue(undefined) };
    const useCase = new CrearComentarioReparacionUseCase(ticketEdiliciaRepo, comentarioRepo);

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
    const ticketEdiliciaRepo = { findById: vi.fn().mockResolvedValue(encontrado) };
    const comentarioRepo = { crear: vi.fn() };
    const useCase = new CrearComentarioReparacionUseCase(ticketEdiliciaRepo, comentarioRepo);

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
