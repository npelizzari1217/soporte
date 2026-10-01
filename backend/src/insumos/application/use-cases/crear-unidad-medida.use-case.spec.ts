import { describe, expect, it, vi } from 'vitest';
import { CrearUnidadMedidaUseCase } from './crear-unidad-medida.use-case';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';
import { UnidadMedidaCodigoDuplicadoError } from '../../domain/errors/unidades-medida.errors';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';

describe('CrearUnidadMedidaUseCase', () => {
  function buildRepo(
    overrides: Partial<Pick<IUnidadMedidaRepository, 'findByCodigo' | 'save'>> = {},
  ) {
    return {
      findByCodigo: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('crea la unidad cuando el codigo no está en uso', async () => {
    const repo = buildRepo();
    const useCase = new CrearUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ codigo: 'UN', nombre: 'Unidad' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('UN');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  /**
   * `unidades_medida.codigo` es UNIQUE case-sensitive: sin normalizar acá,
   * `un` y `UN` conviven como dos unidades distintas y el catálogo queda con
   * duplicados que el UNIQUE no puede frenar.
   */
  it('normaliza el codigo a mayúscula antes de persistir', async () => {
    const repo = buildRepo();
    const useCase = new CrearUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ codigo: '  un  ', nombre: 'Unidad' });

    expect(result.getValue().codigo).toBe('UN');
  });

  /**
   * El `nombre` viaja por la misma capa que el `codigo`. Sin el recorte acá,
   * `'  Unidad  '` se persiste con los espacios de borde y el catálogo muestra
   * un nombre desalineado que nadie escribió así.
   */
  it('recorta los espacios de borde del nombre antes de persistir', async () => {
    const repo = buildRepo();
    const useCase = new CrearUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ codigo: 'UN', nombre: '  Unidad  ' });

    expect(result.getValue().nombre).toBe('Unidad');
  });

  it('crea la unidad no entera por defecto y entera si el DTO lo pide', async () => {
    const repo = buildRepo();
    const useCase = new CrearUnidadMedidaUseCase(repo);

    const comun = await useCase.execute({ codigo: 'LT', nombre: 'Litro' });
    const entera = await useCase.execute({ codigo: 'BOB', nombre: 'Bobina', entera: true });

    expect(comun.getValue().entera).toBe(false);
    expect(entera.getValue().entera).toBe(true);
    expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ entera: true }));
  });

  it('busca el duplicado por el codigo YA normalizado', async () => {
    const repo = buildRepo();
    const useCase = new CrearUnidadMedidaUseCase(repo);

    await useCase.execute({ codigo: 'un', nombre: 'Unidad' });

    expect(repo.findByCodigo).toHaveBeenCalledWith('UN');
  });

  it('rechaza con UnidadMedidaCodigoDuplicadoError si el codigo ya existe (habilitado o no)', async () => {
    const existente = UnidadMedidaEntity.create({ codigo: 'UN', nombre: 'X', activo: false });
    const repo = buildRepo({ findByCodigo: vi.fn().mockResolvedValue(existente) });
    const useCase = new CrearUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ codigo: 'UN', nombre: 'Unidad' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnidadMedidaCodigoDuplicadoError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
