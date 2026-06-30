import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { IRoleRepository } from '../../domain/ports/i-role.repository';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { UsuarioConflictError, RolNoEncontradoError } from '../../domain/errors/auth.errors';

/** DTO de entrada para CrearUsuarioUseCase. */
export interface CrearUsuarioDto {
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  rolCodigo: string;
  /** Resuelto server-side por TenantGuard → NUNCA del body HTTP. */
  clienteId: string;
}

/**
 * CrearUsuarioUseCase — crea un nuevo usuario en el tenant resuelto.
 *
 * Flujo:
 * 1. Verifica unicidad del email → UsuarioConflictError si ya existe.
 * 2. Busca el rol por código → RolNoEncontradoError si no existe.
 * 3. Crea la entidad con activo=TRUE, isGlobalAdmin=FALSE (inmutable desde aquí).
 * 4. Hashea la contraseña con argon2id (IHashProvider).
 * 5. Persiste via usuarioRepo.create().
 *
 * Invariantes de seguridad:
 * - is_global_admin es SIEMPRE false: no puede ser establecido desde este use case.
 * - clienteId viene del TenantContext (server-side), NUNCA del body.
 * - password NUNCA aparece en la entidad ni en el Result (solo passwordHash).
 *
 * Spec ref: clientes-tenancy/POST /usuarios
 * Tarea: T3.3
 */
export class CrearUsuarioUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly hashProvider: IHashProvider,
    private readonly roleRepo: IRoleRepository,
  ) {}

  async execute(dto: CrearUsuarioDto): Promise<Result<UsuarioEntity, DomainError>> {
    // 1. Verificar unicidad del email
    const existing = await this.usuarioRepo.findByEmail(dto.email);
    if (existing) {
      return Result.fail(new UsuarioConflictError(dto.email));
    }

    // 2. Buscar el rol (validación temprana antes de crear la entidad)
    const rol = await this.roleRepo.findByCodigo(dto.rolCodigo);
    if (!rol) {
      return Result.fail(new RolNoEncontradoError(dto.rolCodigo));
    }

    // 3. Crear la entidad de dominio
    //    - activo=TRUE: el usuario comienza activo
    //    - isGlobalAdmin=FALSE: NUNCA se eleva desde este use case
    //    - passwordHash vacío: se setea en el paso 4
    const entity = UsuarioEntity.create({
      email: dto.email,
      nombre: dto.nombre,
      apellido: dto.apellido,
      passwordHash: '', // placeholder — sobreescrito en hashPassword()
      clienteId: dto.clienteId,
      activo: true,
      isGlobalAdmin: false,
      roles: [rol],
    });

    // 4. Hashear la contraseña (argon2id via IHashProvider)
    await entity.hashPassword(dto.password, this.hashProvider);

    // 5. Persistir
    await this.usuarioRepo.create(entity);

    return Result.ok(entity);
  }
}
