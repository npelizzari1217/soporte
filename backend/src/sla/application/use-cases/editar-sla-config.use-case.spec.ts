/**
 * SA4 [UNIT] — RED→GREEN: EditarSlaConfigUseCase (S1 — edición de
 * horas/activo por prioridad, protegido por permiso de gestión SLA).
 *
 * Ref spec: sdd/premium/spec S1. Tarea: SA4/SA5.
 */
import { EditarSlaConfigUseCase } from './editar-sla-config.use-case';
import { SlaConfigEntity } from '../../domain/entities/sla-config.entity';
import { SlaConfigNoEncontradaError, HorasInvalidasError } from '../../domain/errors/sla.errors';

function makeRepo(config: SlaConfigEntity | null) {
  return {
    findById: vi.fn().mockResolvedValue(config),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('EditarSlaConfigUseCase', () => {
  it('edita horas de una config existente y la persiste', async () => {
    const config = SlaConfigEntity.create({ prioridadId: 'prio-1', horas: 4, activo: true });
    const repo = makeRepo(config);
    const useCase = new EditarSlaConfigUseCase(repo);

    const result = await useCase.execute({ id: config.id, horas: 6 });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().horas).toBe(6);
    expect(repo.save).toHaveBeenCalledWith(config);
  });

  it('edita activo sin tocar horas', async () => {
    const config = SlaConfigEntity.create({ prioridadId: 'prio-1', horas: 4, activo: true });
    const repo = makeRepo(config);
    const useCase = new EditarSlaConfigUseCase(repo);

    const result = await useCase.execute({ id: config.id, activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
    expect(result.getValue().horas).toBe(4);
  });

  it('retorna SlaConfigNoEncontradaError si el id no existe', async () => {
    const repo = makeRepo(null);
    const useCase = new EditarSlaConfigUseCase(repo);

    const result = await useCase.execute({ id: 'no-existe', horas: 6 });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SlaConfigNoEncontradaError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('retorna HorasInvalidasError si horas <= 0, sin persistir', async () => {
    const config = SlaConfigEntity.create({ prioridadId: 'prio-1', horas: 4, activo: true });
    const repo = makeRepo(config);
    const useCase = new EditarSlaConfigUseCase(repo);

    const result = await useCase.execute({ id: config.id, horas: 0 });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(HorasInvalidasError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
