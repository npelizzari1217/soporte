/**
 * listar-ciclos-vigentes-admin.use-case.spec.ts — TDD RED→GREEN
 * (sdd/ciclos-abm-root).
 *
 * Lista TODOS los ciclos del catálogo master (incluyendo soft-deleted) para
 * la pantalla ABM de ROOT — a diferencia de `ListarCiclosVigentesUseCase`
 * (`findAllActivos`) que solo sirve para el selector de adopción del tenant.
 */
import { describe, expect, it, vi } from 'vitest';
import { ListarCiclosVigentesAdminUseCase } from './listar-ciclos-vigentes-admin.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';

describe('ListarCiclosVigentesAdminUseCase', () => {
  it('retorna todos los ciclos del repositorio (incluye soft-deleted)', async () => {
    const activo = CicloVigenteEntity.create({
      nombre: 'Activo',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    });
    const eliminado = CicloVigenteEntity.create({
      nombre: 'Eliminado',
      fechaInicio: new Date('2025-01-01'),
      fechaFin: new Date('2025-12-31'),
      activo: true,
    });
    eliminado.softDelete();

    const repo: Pick<ICicloVigenteRepository, 'findAll'> = {
      findAll: vi.fn().mockResolvedValue([activo, eliminado]),
    };
    const useCase = new ListarCiclosVigentesAdminUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([activo, eliminado]);
  });
});
