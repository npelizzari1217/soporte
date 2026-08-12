/**
 * T9.1 [UNIT][RED] — `CrearSubtareaUseCase`.
 *
 * Persiste subtarea + recalcula avance + op AVANCE_EDILICIO con
 * `metadata={porcentaje_anterior,porcentaje_nuevo}`, en tx.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E3. Tarea: T9.1, T9.2.
 */
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { CrearSubtareaUseCase } from './crear-subtarea.use-case';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';

describe('CrearSubtareaUseCase', () => {
  function buildDeps() {
    const ticketEdiliciaRepo = { findById: vi.fn(), save: vi.fn() };
    const subtareaRepo = {
      findActiveByTicketEdiliciaId: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    };
    const operacionRepo = { save: vi.fn() };
    const tipoOperacionRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-avance-uuid') };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new CrearSubtareaUseCase(
      ticketEdiliciaRepo as any,
      subtareaRepo as any,
      operacionRepo as any,
      tipoOperacionRepo as any,
      txRunner as any,
    );

    return { useCase, ticketEdiliciaRepo, subtareaRepo, operacionRepo };
  }

  const baseDto = {
    ticketEdiliciaId: 'edilicia-uuid',
    descripcion: 'Reparar cañería',
    autorId: 'usuario-uuid',
  };

  it('crea la subtarea, recalcula avance (0 con 1 sola subtarea sin completar) y registra AVANCE_EDILICIO', async () => {
    const { useCase, ticketEdiliciaRepo, subtareaRepo, operacionRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBeInstanceOf(SubtareaEdiliciaEntity);
    expect(subtareaRepo.save).toHaveBeenCalled();
    expect(ticketEdiliciaRepo.save).toHaveBeenCalledWith(edilicia);
    expect(edilicia.porcentajeAvance).toBe(0);

    const operacion = operacionRepo.save.mock.calls[0][0];
    expect(operacion.metadata).toEqual({ porcentaje_anterior: 0, porcentaje_nuevo: 0 });
  });

  it('recalcula avance considerando subtareas activas existentes', async () => {
    const { useCase, ticketEdiliciaRepo, subtareaRepo, operacionRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    const existente = SubtareaEdiliciaEntity.create({
      ticketEdiliciaId: 'edilicia-uuid',
      descripcion: 'Ya completada',
    });
    existente.completar('usuario-uuid');
    subtareaRepo.findActiveByTicketEdiliciaId.mockResolvedValue([existente]);

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    // 1 completada / 2 activas (existente + nueva) = 50
    expect(edilicia.porcentajeAvance).toBe(50);
    const operacion = operacionRepo.save.mock.calls[0][0];
    expect(operacion.metadata).toEqual({ porcentaje_anterior: 0, porcentaje_nuevo: 50 });
  });

  it('falla con TicketEdiliciaNoEncontradoError si el satélite no existe', async () => {
    const { useCase, ticketEdiliciaRepo } = buildDeps();
    ticketEdiliciaRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
  });
});
