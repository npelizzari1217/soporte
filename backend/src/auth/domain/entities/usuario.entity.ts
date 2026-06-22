import { BaseEntity } from '../../../shared/domain/base-entity';
import { IHashProvider } from '../ports/i-hash.provider';
import { RoleEntity } from './role.entity';

/**
 * UsuarioProps — shape de las propiedades de dominio del Usuario.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface UsuarioProps {
  /** Email de acceso — identificador de login único. */
  email: string;
  /** Nombre de pila. */
  nombre: string;
  /** Apellido. */
  apellido: string;
  /** Hash argon2id de la contraseña. NUNCA plaintext. */
  passwordHash: string;
  /** ID del cliente (tenant de origen) en master. */
  clienteId: string;
  /** false = cuenta suspendida; rechazada en login. */
  activo: boolean;
  /**
   * Roles asignados al usuario.
   * Poblado por IUsuarioRepository (JOIN con usuarios_roles + roles + permisos).
   * El LoginUseCase lo usa para calcular los permisos efectivos.
   */
  roles: RoleEntity[];
}

/**
 * UsuarioEntity — entidad de dominio que representa la identidad de un usuario.
 *
 * Vive en master (no en tenant). El usuario pertenece a un único cliente
 * (clienteId), pero la autenticación es global.
 *
 * Reglas de dominio:
 * - passwordHash nunca debe contener el plaintext; usar hashPassword().
 * - suspend() marca activo=false + soft delete simultáneamente.
 * - Los permisos efectivos = unión de los permisos de todos los roles (calculado en LoginUseCase).
 *
 * Tarea: 2.A.2
 */
export class UsuarioEntity extends BaseEntity<UsuarioProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * El passwordHash DEBE estar ya hasheado al llegar aquí (usar hashPassword() después).
   */
  static create(props: UsuarioProps, id?: string): UsuarioEntity {
    return new UsuarioEntity({ ...props, roles: [...props.roles] }, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: UsuarioProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): UsuarioEntity {
    const entity = new UsuarioEntity({ ...props, roles: [...props.roles] }, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get email(): string {
    return this.props.email;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get apellido(): string {
    return this.props.apellido;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get clienteId(): string {
    return this.props.clienteId;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get roles(): RoleEntity[] {
    return this.props.roles;
  }

  // ─── Comportamiento de dominio ────────────────────────────────────────────

  /**
   * Suspende el usuario: setea activo=false y realiza soft delete.
   * El TenantGuard/JwtAuthGuard rechazará futuros requests de este usuario.
   * Los refresh tokens deben revocarse en la misma operación (BajaUsuarioUseCase).
   */
  suspend(): void {
    this.props.activo = false;
    this.softDelete();
  }

  /**
   * Hashea el password y actualiza passwordHash usando el IHashProvider inyectado.
   * El proveedor concreto (argon2id) vive en infrastructure/ → PR-06.
   *
   * NUNCA almacena el plaintext — solo el hash resultante del provider.
   *
   * @param plaintext    Contraseña en texto plano.
   * @param hashProvider Puerto de hashing (inyectado por el use case).
   */
  async hashPassword(plaintext: string, hashProvider: IHashProvider): Promise<void> {
    this.props.passwordHash = await hashProvider.hash(plaintext);
  }

  /**
   * Verifica que el plaintext dado corresponde al passwordHash almacenado.
   * Delega completamente al IHashProvider para independencia del algoritmo.
   *
   * @param plaintext    Contraseña en texto plano a verificar.
   * @param hashProvider Puerto de hashing (inyectado por el use case).
   * @returns            true si la contraseña es correcta, false si no.
   */
  async verifyPassword(plaintext: string, hashProvider: IHashProvider): Promise<boolean> {
    return hashProvider.verify(plaintext, this.props.passwordHash);
  }

  /**
   * Agrega un rol al usuario si no está ya asignado (deduplicación por id).
   * Usado por AsignarRolUseCase.
   */
  addRol(role: RoleEntity): void {
    const alreadyHas = this.props.roles.some((r) => r.id === role.id);
    if (!alreadyHas) {
      this.props.roles.push(role);
    }
  }
}
