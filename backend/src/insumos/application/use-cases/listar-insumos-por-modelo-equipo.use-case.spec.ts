import { describe, expect, it, vi } from 'vitest';
import { ListarInsumosPorModeloEquipoUseCase } from './listar-insumos-por-modelo-equipo.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { CompatibilidadModelo } from '../../domain/entities/compatibilidad-modelo';

describe('ListarInsumosPorModeloEquipoUseCase', () => {
  function buildInsumo(
    codigo: string,
    activo: boolean,
    compatibilidad: CompatibilidadModelo[],
  ): InsumoEntity {
    return InsumoEntity.create({
      codigo,
      nombre: `Insumo ${codigo}`,
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo,
      codigosAlternativos: [],
      compatibilidad,
    });
  }

  /**
   * El filtrado por modelo lo hace la consulta del repositorio, así que lo que
   * este caso de uso tiene que probar es que el id llega intacto: si se
   * perdiera, la respuesta sería el catálogo entero y el usuario vería tóneres
   * que no le sirven a su impresora.
   */
  it('consulta el repositorio con el id del modelo recibido', async () => {
    const repo = { findAllByModeloEquipo: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarInsumosPorModeloEquipoUseCase(repo);

    await useCase.execute('mod-1');

    expect(repo.findAllByModeloEquipo).toHaveBeenCalledWith('mod-1');
  });

  /**
   * El listado incluye los deshabilitados, con el mismo criterio que
   * `ListarInsumosUseCase`: son los que el administrador necesita ver para
   * volver a habilitarlos.
   */
  it('retorna los insumos compatibles del repo, habilitados y deshabilitados', async () => {
    const compatibilidad = [{ modeloEquipoId: 'mod-1', rol: 'NEGRO' }];
    const insumos = [
      buildInsumo('TON-001', true, compatibilidad),
      buildInsumo('TON-002', false, compatibilidad),
    ];
    const repo = { findAllByModeloEquipo: vi.fn().mockResolvedValue(insumos) };
    const useCase = new ListarInsumosPorModeloEquipoUseCase(repo);

    const result = await useCase.execute('mod-1');

    expect(result.map((i) => i.codigo)).toEqual(['TON-001', 'TON-002']);
    expect(result.map((i) => i.activo)).toEqual([true, false]);
  });

  /**
   * Un modelo sin insumos compatibles es una lista vacía, no un error: por eso
   * el caso de uso no devuelve `Result`. Sin este caso, nada impediría que
   * alguien lo convirtiera en un 404.
   */
  it('devuelve la lista vacía cuando el modelo no tiene ningún insumo compatible', async () => {
    const repo = { findAllByModeloEquipo: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarInsumosPorModeloEquipoUseCase(repo);

    await expect(useCase.execute('mod-sin-insumos')).resolves.toEqual([]);
  });
});
