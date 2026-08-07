import { describe, it, expect, vi } from 'vitest';
import { ListarCiclosUseCase } from './listar-ciclos.use-case';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

function buildCiclo(nombre: string, activo: boolean) {
  return CicloClienteEntity.create({
    nombre,
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo,
    cicloVigenteId: 'master-1',
  });
}

describe('ListarCiclosUseCase (G4, sdd/beta-frontend)', () => {
  it('retorna todos los ciclos del tenant + el id del ciclo vigente (activo=true)', async () => {
    const activo = buildCiclo('Ciclo 2026', true);
    const inactivo = buildCiclo('Ciclo 2025', false);
    const cicloClienteRepo = { findAll: vi.fn().mockResolvedValue([activo, inactivo]) };
    const useCase = new ListarCiclosUseCase(cicloClienteRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.ciclos).toEqual([activo, inactivo]);
    expect(value.cicloActivoId).toBe(activo.id);
  });

  it('cicloActivoId es null cuando ningún ciclo del tenant está activo', async () => {
    const inactivo = buildCiclo('Ciclo 2025', false);
    const cicloClienteRepo = { findAll: vi.fn().mockResolvedValue([inactivo]) };
    const useCase = new ListarCiclosUseCase(cicloClienteRepo as never);

    const result = await useCase.execute();

    expect(result.getValue().cicloActivoId).toBeNull();
  });

  it('retorna listas vacías cuando el tenant no adoptó ningún ciclo', async () => {
    const cicloClienteRepo = { findAll: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarCiclosUseCase(cicloClienteRepo as never);

    const result = await useCase.execute();

    expect(result.getValue()).toEqual({ ciclos: [], cicloActivoId: null });
  });
});
