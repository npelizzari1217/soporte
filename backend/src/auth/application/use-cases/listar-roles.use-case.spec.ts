/**
 * [UNIT] RED→GREEN: `ListarRolesUseCase` (sdd/beta-frontend item 3).
 */
import { ListarRolesUseCase } from './listar-roles.use-case';
import { RoleEntity } from '../../domain/entities/role.entity';

describe('ListarRolesUseCase', () => {
  it('retorna todos los roles del catálogo global (delegación directa al repo)', async () => {
    const roles = [
      RoleEntity.create(
        { codigo: 'ADMINISTRADOR', nombre: 'Administrador', descripcion: null, permisos: [] },
        'r1',
      ),
      RoleEntity.create(
        { codigo: 'USUARIO', nombre: 'Usuario', descripcion: null, permisos: [] },
        'r2',
      ),
    ];
    const roleRepo = { findAll: vi.fn().mockResolvedValue(roles) };

    const useCase = new ListarRolesUseCase(roleRepo);
    const result = await useCase.execute();

    expect(result).toBe(roles);
    expect(roleRepo.findAll).toHaveBeenCalledTimes(1);
  });
});
