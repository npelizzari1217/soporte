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
      compatibilidad: [],
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

  /**
   * El filtro por familia se resuelve en el repositorio (consulta contra
   * `familia.esRepuesto`, ver `prisma-insumo.repository.integration.spec.ts`
   * para los asserts de filtrado real, con su gemelo invertido). Acá solo se
   * prueba que el caso de uso DELEGA el parámetro tal cual, sin perderlo ni
   * reinterpretarlo.
   */
  it('delega esRepuesto=true al repositorio', async () => {
    const repo = { findAllActive: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarInsumosUseCase(repo);

    await useCase.execute(true);

    expect(repo.findAllActive).toHaveBeenCalledWith(true);
  });

  /** Gemelo invertido del caso anterior: `false` no se confunde con `undefined`. */
  it('delega esRepuesto=false al repositorio', async () => {
    const repo = { findAllActive: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarInsumosUseCase(repo);

    await useCase.execute(false);

    expect(repo.findAllActive).toHaveBeenCalledWith(false);
  });

  /**
   * Comportamiento cuando el parámetro se omite: delega `undefined`, que el
   * repositorio interpreta como "sin filtrar" — devuelve repuestos y
   * consumibles por igual. Ver el JSDoc de `execute` para por qué este
   * default NO es un descuido.
   */
  it('esRepuesto omitido: delega undefined al repositorio, sin filtrar', async () => {
    const repo = { findAllActive: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarInsumosUseCase(repo);

    await useCase.execute();

    expect(repo.findAllActive).toHaveBeenCalledWith(undefined);
  });
});
