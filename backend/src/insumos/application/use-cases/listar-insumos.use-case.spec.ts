import { describe, expect, it, vi } from 'vitest';
import { ListarInsumosUseCase } from './listar-insumos.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';

describe('ListarInsumosUseCase', () => {
  function buildInsumo(codigo: string, activo: boolean): InsumoEntity {
    return InsumoEntity.create({
      codigo,
      nombre: `Insumo ${codigo}`,
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo,
      codigosAlternativos: [],
    });
  }

  /**
   * El listado incluye los deshabilitados a propósito: son los que el
   * administrador necesita ver para volver a habilitarlos. Filtrarlos acá
   * dejaría la reactivación inalcanzable.
   */
  it('retorna los insumos vigentes del repo, habilitados y deshabilitados', async () => {
    const insumos = [buildInsumo('TON-001', true), buildInsumo('TON-002', false)];
    const repo = { findAllActive: vi.fn().mockResolvedValue(insumos) };
    const useCase = new ListarInsumosUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.codigo)).toEqual(['TON-001', 'TON-002']);
    expect(result.map((i) => i.activo)).toEqual([true, false]);
  });
});
