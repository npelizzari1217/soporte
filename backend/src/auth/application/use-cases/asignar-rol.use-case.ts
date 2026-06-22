import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IRoleRepository } from '../../domain/ports/i-role.repository';
import {
  UsuarioNoEncontradoError,
  RolNoEncontradoError,
  RolYaAsignadoError,
} from '../../domain/errors/auth.errors';

/** DTO de entrada para AsignarRolUseCase. */
export interface AsignarRolDto {
  usuarioId: string;
  rolCodigo: string;
}

/**
 * AsignarRolUseCase — asigna un rol existente a un usuario.
 *
 * Flujo:
 * 1. Carga usuario por id (con roles actuales) → 404 si no existe.
 * 2. Verifica que el rol no esté ya asignado (por código) → 409 si existe.
 * 3. Carga el rol por código → 404 si no existe.
 * 4. Agrega el rol al usuario (usuario.addRol).
 * 5. Persiste el usuario (el repo sincroniza usuarios_roles).
 *
 * Tarea: 2.B.8
 */
export class AsignarRolUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly roleRepo: IRoleRepository,
  ) {}

  async execute(dto: AsignarRolDto): Promise<Result<void, DomainError>> {
    // 1. Cargar usuario con roles actuales
    const usuario = await this.usuarioRepo.findById(dto.usuarioId);
    if (!usuario) {
      return Result.fail(new UsuarioNoEncontradoError(dto.usuarioId));
    }

    // 2. Verificar que el rol no esté ya asignado (por código para evitar duplicados)
    const yaAsignado = usuario.roles.some((r) => r.codigo === dto.rolCodigo);
    if (yaAsignado) {
      return Result.fail(new RolYaAsignadoError(dto.rolCodigo));
    }

    // 3. Cargar el rol por código
    const rol = await this.roleRepo.findByCodigo(dto.rolCodigo);
    if (!rol) {
      return Result.fail(new RolNoEncontradoError(dto.rolCodigo));
    }

    // 4. Agregar el rol al usuario
    usuario.addRol(rol);

    // 5. Persistir
    await this.usuarioRepo.save(usuario);

    return Result.ok(undefined as unknown as void);
  }
}
