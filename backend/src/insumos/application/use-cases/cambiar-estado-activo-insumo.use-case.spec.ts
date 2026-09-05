import { describe, expect, it, vi } from 'vitest';
import { CambiarEstadoActivoInsumoUseCase } from './cambiar-estado-activo-insumo.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';

describe('CambiarEstadoActivoInsumoUseCase', () => {
  function buildInsumo(): InsumoEntity {
    return InsumoEntity.create(
      {
        codigo: 'TON-001',
        nombre: 'Tóner negro',
        familiaId: 'fam-1',
        unidadMedidaId: 'uni-1',
        stockMinimo: null,
        activo: true,
        codigosAlternativos: [],
        compatibilidad: [],
      },
      'ins-1',
    );
  }

  function buildRepo(insumo: InsumoEntity | null) {
    return {
      findById: vi.fn().mockResolvedValue(insumo),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('deshabilita un insumo habilitado', async () => {
    const repo = buildRepo(buildInsumo());
    const useCase = new CambiarEstadoActivoInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'ins-1', activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('vuelve a habilitar un insumo deshabilitado (caso hermano)', async () => {
    const insumo = buildInsumo();
    insumo.desactivar();
    const repo = buildRepo(insumo);
    const useCase = new CambiarEstadoActivoInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'ins-1', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
  });

  /**
   * Deshabilitar NO es dar de baja. El listado filtra por `deletedAt: null`, así
   * que marcar la baja lógica haría desaparecer la fila de la única pantalla
   * que existe y dejaría la reactivación inalcanzable: nadie podría conseguir
   * el id para volver a habilitar el insumo.
   */
  it('deshabilitar no marca la baja lógica', async () => {
    const repo = buildRepo(buildInsumo());
    const useCase = new CambiarEstadoActivoInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'ins-1', activo: false });

    expect(result.getValue().deletedAt).toBeNull();
  });

  it('rechaza con INSUMO_NO_ENCONTRADO si el id no existe', async () => {
    const repo = buildRepo(null);
    const useCase = new CambiarEstadoActivoInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'inexistente', activo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
