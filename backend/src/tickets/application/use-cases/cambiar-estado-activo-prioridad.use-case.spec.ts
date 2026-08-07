/**
 * T11.2 [UNIT] — RED→GREEN: `CambiarEstadoActivoPrioridadUseCase` (T2,
 * PR11 — activar/desactivar).
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
 */
import { CambiarEstadoActivoPrioridadUseCase } from './cambiar-estado-activo-prioridad.use-case';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { PrioridadNoEncontradaError } from '../../domain/errors/tickets.errors';

describe('CambiarEstadoActivoPrioridadUseCase', () => {
  function makeCollaborators(prioridad: PrioridadEntity | null) {
    const prioridadRepo = {
      findById: vi.fn().mockResolvedValue(prioridad),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoPrioridadUseCase(prioridadRepo as never);
    return { useCase, prioridadRepo };
  }

  it('activo:false da de baja (soft delete) la prioridad y persiste', async () => {
    const prioridad = PrioridadEntity.create(
      { codigo: 'ALTA', nombre: 'Alta', color: null, orden: 30, activo: true },
      'id-1',
    );
    const c = makeCollaborators(prioridad);

    const result = await c.useCase.execute({ id: 'id-1', activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().isDeleted()).toBe(true);
    expect(result.getValue().activo).toBe(false);
    expect(c.prioridadRepo.save).toHaveBeenCalledWith(prioridad);
  });

  it('activo:true reactiva una prioridad dada de baja', async () => {
    const prioridad = PrioridadEntity.create(
      { codigo: 'ALTA', nombre: 'Alta', color: null, orden: 30, activo: true },
      'id-1',
    );
    prioridad.desactivar();
    const c = makeCollaborators(prioridad);

    const result = await c.useCase.execute({ id: 'id-1', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().isDeleted()).toBe(false);
    expect(result.getValue().activo).toBe(true);
  });

  it('prioridad inexistente → PrioridadNoEncontradaError (404)', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({ id: 'no-existe', activo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
    expect(c.prioridadRepo.save).not.toHaveBeenCalled();
  });
});
