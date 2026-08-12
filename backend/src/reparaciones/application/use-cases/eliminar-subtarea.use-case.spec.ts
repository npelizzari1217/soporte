/**
 * T9.5 [UNIT+INTEGRATION][RED→GREEN] — `EliminarSubtareaUseCase`.
 *
 * Soft delete + recalcula avance sobre las activas restantes + registra
 * AVANCE_EDILICIO.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E5. Tarea: T9.5.
 */
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { EliminarSubtareaUseCase } from './eliminar-subtarea.use-case';
import { SubtareaNoEncontradaError } from '../../domain/errors/reparaciones.errors';

describe('EliminarSubtareaUseCase', () => {
  function buildDeps() {
    const subtareaRepo = {
      findById: vi.fn(),
      findActiveByTicketEdiliciaId: vi.fn(),
      delete: vi.fn(),
    };
    const ticketEdiliciaRepo = { findById: vi.fn(), save: vi.fn() };
    const operacionRepo = { save: vi.fn() };
    const tipoOperacionRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-avance-uuid') };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new EliminarSubtareaUseCase(
      subtareaRepo as any,
      ticketEdiliciaRepo as any,
      operacionRepo as any,
      tipoOperacionRepo as any,
      txRunner as any,
    );

    return { useCase, subtareaRepo, ticketEdiliciaRepo, operacionRepo };
  }

  it('elimina la subtarea y recalcula el avance sobre las activas restantes', async () => {
    const { useCase, subtareaRepo, ticketEdiliciaRepo, operacionRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    edilicia.actualizarAvance(50);
    const aEliminar = SubtareaEdiliciaEntity.create(
      { ticketEdiliciaId: 'edilicia-uuid', descripcion: 'Pendiente a borrar' },
      'subtarea-uuid',
    );
    const restante = SubtareaEdiliciaEntity.create({
      ticketEdiliciaId: 'edilicia-uuid',
      descripcion: 'Completada',
    });
    restante.completar('usuario-uuid');
    subtareaRepo.findById.mockResolvedValue(aEliminar);
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    // Tras el soft delete, findActiveByTicketEdiliciaId ya NO debe incluir `aEliminar`.
    subtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([restante]);

    const result = await useCase.execute({ subtareaId: 'subtarea-uuid', autorId: 'tecnico-uuid' });

    expect(result.isOk()).toBe(true);
    expect(subtareaRepo.delete).toHaveBeenCalledWith('subtarea-uuid');
    // 1 completada / 1 activa restante = 100
    expect(edilicia.porcentajeAvance).toBe(100);
    expect(ticketEdiliciaRepo.save).toHaveBeenCalledWith(edilicia);
    const operacion = operacionRepo.save.mock.calls[0][0];
    expect(operacion.metadata).toEqual({ porcentaje_anterior: 50, porcentaje_nuevo: 100 });
  });

  it('recalcula a 0 cuando no quedan subtareas activas', async () => {
    const { useCase, subtareaRepo, ticketEdiliciaRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    edilicia.actualizarAvance(100);
    const unica = SubtareaEdiliciaEntity.create(
      { ticketEdiliciaId: 'edilicia-uuid', descripcion: 'Unica' },
      'subtarea-uuid',
    );
    subtareaRepo.findById.mockResolvedValue(unica);
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    subtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([]);

    const result = await useCase.execute({ subtareaId: 'subtarea-uuid', autorId: 'tecnico-uuid' });

    expect(result.isOk()).toBe(true);
    expect(edilicia.porcentajeAvance).toBe(0);
  });

  it('falla con SubtareaNoEncontradaError si la subtarea no existe', async () => {
    const { useCase, subtareaRepo } = buildDeps();
    subtareaRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({ subtareaId: 'inexistente', autorId: 'tecnico-uuid' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SubtareaNoEncontradaError);
  });
});
