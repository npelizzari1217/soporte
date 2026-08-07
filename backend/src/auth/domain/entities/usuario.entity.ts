import { BaseEntity } from '../../../shared/domain/base-entity';
import { IHashProvider } from '../ports/i-hash.provider';

/**
 * UsuarioProps — shape de las propiedades de dominio del Usuario.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * ADR-1 (identidad global + membresías N:N): a diferencia de un modelo
 * single-tenant-per-user, acá el Usuario NO tiene `clienteId` ni `roles[]`
 * propios. La pertenencia a un cliente y el rol asignado viven en
 * `MembresiaEntity` (una fila por cada `(cliente, rol)` al que pertenece).
 * Esto permite que el mismo usuario sea TECNICO en el cliente A y USUARIO
 * en el cliente B.
 */
export interface UsuarioProps {
  /** Email de acceso — identidad global, único en `master.usuarios`. */
  email: string;
  /** Nombre de pila. */
  nombre: string;
  /** Apellido. */
  apellido: string;
  /** Hash argon2id de la contraseña. NUNCA plaintext. */
  passwordHash: string;
  /** false = cuenta suspendida; rechazada en login. */
  activo: boolean;
  /**
   * true si el usuario es ROOT: super-admin GLOBAL de la plataforma
   * (cross-tenant). Único autorizado a crear `clientes`/`ciclos_vigentes`.
   * NUNCA se deriva del rol de una membresía — un rol ADMINISTRADOR (que
   * vive DENTRO de `membresias`) no implica is_global_admin (ortogonalidad).
   * Un usuario ROOT puede no tener ninguna membresía.
   * Defaults to false.
   */
  isGlobalAdmin?: boolean;
}

/**
 * UsuarioEntity — entidad de dominio que representa la identidad global de
 * un usuario.
 *
 * Vive en master. La autenticación es global (join por email, sin
 * `cliente_id`); la resolución de a qué cliente(s) pertenece y con qué rol
 * se hace vía `IMembresiaRepository` en el LoginUseCase (PR3).
 *
 * Reglas de dominio:
 * - passwordHash nunca debe contener el plaintext; usar hashPassword().
 * - suspend() marca activo=false + soft delete simultáneamente.
 *
 * Tarea: T2.1 (PR2 — Auth domain + ports + hashing + token service)
 */
export class UsuarioEntity extends BaseEntity<UsuarioProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * El passwordHash DEBE estar ya hasheado al llegar aquí (usar hashPassword() después).
   */
  static create(props: UsuarioProps, id?: string): UsuarioEntity {
    return new UsuarioEntity({ ...props, isGlobalAdmin: props.isGlobalAdmin ?? false }, id);
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
    const entity = new UsuarioEntity({ ...props, isGlobalAdmin: props.isGlobalAdmin ?? false }, id);
    (entity as unknown as { _createdAt: Date })._createdAt = createdAt;
    (entity as unknown as { _updatedAt: Date })._updatedAt = updatedAt;
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

  get activo(): boolean {
    return this.props.activo;
  }

  get isGlobalAdmin(): boolean {
    return this.props.isGlobalAdmin ?? false;
  }

  // ─── Comportamiento de dominio ────────────────────────────────────────────

  /**
   * isRoot — alias de negocio de isGlobalAdmin (terminología "root").
   * Mismo valor que isGlobalAdmin; NUNCA se deriva del rol de una membresía.
   */
  isRoot(): boolean {
    return this.isGlobalAdmin;
  }

  /**
   * Suspende el usuario: setea activo=false y realiza soft delete.
   * El JwtAuthGuard rechazará futuros requests de este usuario.
   * Los refresh tokens deben revocarse en la misma operación de aplicación.
   */
  suspend(): void {
    this.props.activo = false;
    this.softDelete();
  }

  /**
   * Hashea el password y actualiza passwordHash usando el IHashProvider inyectado.
   * El proveedor concreto (argon2id) vive en infrastructure/.
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
}
