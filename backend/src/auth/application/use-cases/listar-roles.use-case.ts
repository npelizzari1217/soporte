import { RoleEntity } from '../../domain/entities/role.entity';
import { IRoleRepository } from '../../domain/ports/i-role.repository';

/**
 * ListarRolesUseCase — `GET /roles` (sdd/beta-frontend item 3).
 *
 * Catálogo GLOBAL de roles (`master.roles`, compartido por todos los
 * tenants) — sin filtro de `clienteId` (no aplica: el rol NO es un recurso
 * del tenant, es la matriz RBAC compartida). Usado por el frontend para
 * poblar el selector de rol del formulario de alta de usuario (antes
 * hardcodeado en `features/usuarios/types.ts`, ver apply-progress G-roles).
 */
export class ListarRolesUseCase {
  constructor(private readonly roleRepo: Pick<IRoleRepository, 'findAll'>) {}

  async execute(): Promise<RoleEntity[]> {
    return this.roleRepo.findAll();
  }
}
