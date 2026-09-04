import { describe, expect, it, vi } from 'vitest';
import { CrearFamiliaInsumoUseCase } from './crear-familia-insumo.use-case';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';
import { FamiliaInsumoCodigoDuplicadoError } from '../../domain/errors/familias-insumo.errors';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';

describe('CrearFamiliaInsumoUseCase', () => {
  function buildRepo(
    overrides: Partial<Pick<IFamiliaInsumoRepository, 'findByCodigo' | 'save'>> = {},
  ) {
    return {
      findByCodigo: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('crea la familia cuando el codigo no está en uso', async () => {
    const repo = buildRepo();
    const useCase = new CrearFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ codigo: 'TONER', nombre: 'Tóner' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('TONER');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  /**
   * `familias_insumo.codigo` es UNIQUE case-sensitive: sin normalizar acá,
   * `toner` y `TONER` conviven como dos familias distintas y el catálogo queda
   * con duplicados que el UNIQUE no puede frenar.
   */
  it('normaliza el codigo a mayúscula antes de persistir', async () => {
    const repo = buildRepo();
    const useCase = new CrearFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ codigo: '  toner  ', nombre: 'Tóner' });

    expect(result.getValue().codigo).toBe('TONER');
  });

  /**
   * El `nombre` viaja por la misma capa que el `codigo`. Sin el recorte acá,
   * `'  Tóner  '` se persiste con los espacios de borde y el catálogo muestra
   * un nombre desalineado que nadie escribió así.
   */
  it('recorta los espacios de borde del nombre antes de persistir', async () => {
    const repo = buildRepo();
    const useCase = new CrearFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ codigo: 'TONER', nombre: '  Tóner  ' });

    expect(result.getValue().nombre).toBe('Tóner');
  });

  it('busca el duplicado por el codigo YA normalizado', async () => {
    const repo = buildRepo();
    const useCase = new CrearFamiliaInsumoUseCase(repo);

    await useCase.execute({ codigo: 'toner', nombre: 'Tóner' });

    expect(repo.findByCodigo).toHaveBeenCalledWith('TONER');
  });

  it('rechaza con FamiliaInsumoCodigoDuplicadoError si el codigo ya existe (habilitado o no)', async () => {
    const existente = FamiliaInsumoEntity.create({ codigo: 'TONER', nombre: 'X', activo: false });
    const repo = buildRepo({ findByCodigo: vi.fn().mockResolvedValue(existente) });
    const useCase = new CrearFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ codigo: 'TONER', nombre: 'Tóner' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FamiliaInsumoCodigoDuplicadoError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
