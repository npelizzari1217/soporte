import { describe, it, expect, vi } from 'vitest';
import { ListarEquiposUseCase } from './listar-equipos.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { equipoDadoDeBaja, equipoVigente } from '../../testing/equipos-unit.fixtures';

function armar() {
  const vigente = equipoVigente({ nombre: 'Vigente' });
  const deBaja = equipoDadoDeBaja();
  const equipoRepo = {
    findAllActive: vi.fn(async () => [vigente]),
    findAllIncluyendoDadosDeBaja: vi.fn(async () => [vigente, deBaja]),
  } satisfies Pick<IEquipoInformaticoRepository, 'findAllActive' | 'findAllIncluyendoDadosDeBaja'>;
  return { equipoRepo, vigente, deBaja, useCase: new ListarEquiposUseCase(equipoRepo) };
}

describe('ListarEquiposUseCase', () => {
  it('por defecto retorna solo los equipos vigentes y no consulta los dados de baja', async () => {
    const { useCase, equipoRepo, vigente } = armar();

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([vigente]);
    expect(equipoRepo.findAllIncluyendoDadosDeBaja).not.toHaveBeenCalled();
  });

  it('incluirDadosDeBaja=false equivale al default', async () => {
    const { useCase, equipoRepo } = armar();

    await useCase.execute({ incluirDadosDeBaja: false });

    expect(equipoRepo.findAllActive).toHaveBeenCalledTimes(1);
    expect(equipoRepo.findAllIncluyendoDadosDeBaja).not.toHaveBeenCalled();
  });

  it('incluirDadosDeBaja=true retorna vigentes y dados de baja', async () => {
    const { useCase, equipoRepo, vigente, deBaja } = armar();

    const result = await useCase.execute({ incluirDadosDeBaja: true });

    expect(result.getValue()).toEqual([vigente, deBaja]);
    expect(result.getValue().map((e) => e.activo)).toEqual([true, false]);
    expect(equipoRepo.findAllActive).not.toHaveBeenCalled();
  });
});
