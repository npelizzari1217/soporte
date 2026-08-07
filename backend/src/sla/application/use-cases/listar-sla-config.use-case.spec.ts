/**
 * SA4 [UNIT] — RED→GREEN: ListarSlaConfigUseCase (S1 — lectura de la config
 * de SLA del tenant, las 4 filas por prioridad).
 *
 * Ref spec: sdd/premium/spec S1. Tarea: SA4/SA5.
 */
import { ListarSlaConfigUseCase } from './listar-sla-config.use-case';
import { SlaConfigEntity } from '../../domain/entities/sla-config.entity';

describe('ListarSlaConfigUseCase', () => {
  it('retorna todas las filas de sla_config del tenant', async () => {
    const configs = [
      SlaConfigEntity.create({ prioridadId: 'p-baja', horas: 48, activo: true }),
      SlaConfigEntity.create({ prioridadId: 'p-critica', horas: 4, activo: true }),
    ];
    const repo = { findAll: vi.fn().mockResolvedValue(configs) };
    const useCase = new ListarSlaConfigUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual(configs);
    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });

  it('retorna array vacío si no hay filas sembradas', async () => {
    const repo = { findAll: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarSlaConfigUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
