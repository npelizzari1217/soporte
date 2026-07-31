import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RootRequeridoError, UsuarioConflictError } from '../../domain/errors/auth.errors';

/** DTO de entrada para CrearRootUseCase. */
export interface CrearRootDto {
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  /** Tenant de origen — resuelto server-side desde TenantContext (D7), NUNCA del body. */
  clienteId: string;
  /** Identidad del actor — authz de aplicación independiente del guard (defensa en profundidad, R7). */
  actor: { id: string; isRoot: boolean };
}

/**
 * CrearRootUseCase — crea un usuario con isGlobalAdmin=true.
 *
 * Único camino de aplicación que eleva el flag isGlobalAdmin (POST /usuarios,
 * vía CrearUsuarioUseCase, lo fuerza SIEMPRE a false — R2 escenario CRÍTICO).
 *
 * AuthZ en DOS lugares (R7/Dz2):
 * 1. GlobalAdminGuard en la capa de presentación (UsuariosController).
 * 2. actor.isRoot revalidado ACÁ, en aplicación — independiente del guard.
 *    Si el guard se removiera por error, este use case igual rechaza.
 *
 * El root se crea SIN rol RBAC (roles: []) — refuerza la ortogonalidad
 * (Dz1: ser root no implica ser ADMINISTRADOR).
 *
 * Spec ref: root-tenant-admin R2, R7 (Dz2)
 * Tarea: B.4
 */
export class CrearRootUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly hashProvider: IHashProvider,
  ) {}

  async execute(dto: CrearRootDto): Promise<Result<UsuarioEntity, DomainError>> {
    // 1. AuthZ de aplicación — independiente del guard (R7).
    if (!dto.actor.isRoot) {
      return Result.fail(new RootRequeridoError());
    }

    // 2. Unicidad del email
    const existing = await this.usuarioRepo.findByEmail(dto.email);
    if (existing) {
      return Result.fail(new UsuarioConflictError(dto.email));
    }

    // 3. Entidad root: isGlobalAdmin=true, SIN rol RBAC (ortogonalidad, R1)
    const entity = UsuarioEntity.create({
      email: dto.email,
      nombre: dto.nombre,
      apellido: dto.apellido,
      passwordHash: '', // placeholder — sobreescrito por hashPassword()
      clienteId: dto.clienteId,
      activo: true,
      isGlobalAdmin: true,
      roles: [],
    });

    // 4. Hash argon2id
    await entity.hashPassword(dto.password, this.hashProvider);

    // 5. Persistir
    await this.usuarioRepo.create(entity);

    return Result.ok(entity);
  }
}
