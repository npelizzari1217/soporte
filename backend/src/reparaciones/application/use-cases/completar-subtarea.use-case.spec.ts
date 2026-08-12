/**
 * T9.3 [UNIT][RED] — `CompletarSubtareaUseCase`.
 *
 * completada_por=actor; recalcula; NO auto-transiciona a RESUELTO al llegar
 * a 100.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E4. Tarea: T9.3, T9.4.
 */
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { CompletarSubtareaUseCase } from './completar-subtarea.use-case';
import { SubtareaNoEncontradaError } from '../../domain/errors/reparaciones.errors';

describe('CompletarSubtareaUseCase', () => {
  function buildDeps() {
    const subtareaRepo = {
      findById: vi.fn(),
      findActiveByTicketEdiliciaId: vi.fn(),
      save: vi.fn(),
    };
    const ticketEdiliciaRepo = { findById: vi.fn(), save: vi.fn() };
    const operacionRepo = { save: vi.fn() };
    const tipoOperacionRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-avance-uuid') };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new CompletarSubtareaUseCase(
      subtareaRepo as any,
      ticketEdiliciaRepo as any,
      operacionRepo as any,
      tipoOperacionRepo as any,
      txRunner as any,
    );

    return { useCase, subtareaRepo, ticketEdiliciaRepo, operacionRepo };
  }

  it('completa la subtarea (completada=true, completadaPorId=actor) y recalcula avance', async () => {
    const { useCase, subtareaRepo, ticketEdiliciaRepo, operacionRepo } = buildDeps();
    const subtarea = SubtareaEdiliciaEntity.create(
      { ticketEdiliciaId: 'edilicia-uuid', descripcion: 'Reparar cañería' },
      'subtarea-uuid',
    );
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    subtareaRepo.findById.mockResolvedValue(subtarea);
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    subtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([subtarea]);

    const result = await useCase.execute({
      subtareaId: 'subtarea-uuid',
      completadaPorId: 'tecnico-uuid',
    });

    expect(result.isOk()).toBe(true);
    expect(subtarea.completada).toBe(true);
    expect(subtarea.completadaPorId).toBe('tecnico-uuid');
    expect(edilicia.porcentajeAvance).toBe(100);
    expect(subtareaRepo.save).toHaveBeenCalledWith(subtarea);
    expect(ticketEdiliciaRepo.save).toHaveBeenCalledWith(edilicia);
    const operacion = operacionRepo.save.mock.calls[0][0];
    expect(operacion.metadata).toEqual({ porcentaje_anterior: 0, porcentaje_nuevo: 100 });
  });

  it('falla con SubtareaNoEncontradaError si la subtarea no existe', async () => {
    const { useCase, subtareaRepo } = buildDeps();
    subtareaRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      subtareaId: 'inexistente',
      completadaPorId: 'tecnico-uuid',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SubtareaNoEncontradaError);
  });

  it('falla con SubtareaNoEncontradaError si la subtarea ya fue eliminada (soft delete)', async () => {
    const { useCase, subtareaRepo } = buildDeps();
    const eliminada = SubtareaEdiliciaEntity.create({
      ticketEdiliciaId: 'edilicia-uuid',
      descripcion: 'X',
    });
    eliminada.softDelete();
    subtareaRepo.findById.mockResolvedValue(eliminada);

    const result = await useCase.execute({
      subtareaId: eliminada.id,
      completadaPorId: 'tecnico-uuid',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SubtareaNoEncontradaError);
  });
});
