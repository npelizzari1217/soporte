/**
 * listar-tipos-componente-admin.use-case.spec.ts — TDD RED→GREEN (sdd/tipos-componente-master, PR2).
 */
import { describe, expect, it, vi } from 'vitest';
import { ListarTiposComponenteAdminUseCase } from './listar-tipos-componente-admin.use-case';
import { ITipoComponenteMasterRepository } from '../../domain/ports/i-tipo-componente-master.repository';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';

describe('ListarTiposComponenteAdminUseCase', () => {
  it('lista TODOS los tipos de componente (incluye inactivos)', async () => {
    const activo = TipoComponente.create({ codigo: 'CPU', nombre: 'Procesador' }).getValue();
    const inactivo = TipoComponente.create({ codigo: 'RAM', nombre: 'Memoria' }).getValue();
    inactivo.desactivar();
    const repo: Pick<ITipoComponenteMasterRepository, 'findAll'> = {
      findAll: vi.fn().mockResolvedValue([activo, inactivo]),
    };
    const useCase = new ListarTiposComponenteAdminUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([activo, inactivo]);
    expect(repo.findAll).toHaveBeenCalled();
  });
});
