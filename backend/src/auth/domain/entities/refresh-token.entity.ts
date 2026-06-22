import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * RefreshTokenProps — shape de las propiedades de dominio del RefreshToken.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface RefreshTokenProps {
  /** ID del usuario propietario del token. */
  usuarioId: string;
  /** SHA-256 del token crudo. NUNCA se almacena el token en texto plano. */
  tokenHash: string;
  /** Fecha de expiración. Después de esta fecha el token es rechazado. */
  expiresAt: Date;
  /** NULL = token activo. NOT NULL = token explícitamente revocado. */
  revokedAt: Date | null;
}

/**
 * RefreshTokenEntity — entidad de dominio que representa un token de renovación.
 *
 * El token crudo (random hex) nunca se persiste. Solo se almacena su SHA-256
 * (`tokenHash`) para lookup por hash. Al renovar, el token anterior se revoca
 * y se emite uno nuevo (rotación).
 *
 * Tarea: 2.A.2
 */
export class RefreshTokenEntity extends BaseEntity<RefreshTokenProps> {
  /**
   * Factory method para nuevos tokens.
   */
  static create(props: RefreshTokenProps, id?: string): RefreshTokenEntity {
    return new RefreshTokenEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   * Acepta timestamps de la DB para hidratación completa, evitando que
   * createdAt/updatedAt/deletedAt sean sobreescritos por now().
   */
  static reconstitute(
    props: RefreshTokenProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): RefreshTokenEntity {
    const entity = new RefreshTokenEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get usuarioId(): string {
    return this.props.usuarioId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  // ─── Comportamiento de dominio ────────────────────────────────────────────

  /**
   * Indica si el token ha expirado (expiresAt <= now).
   */
  isExpired(): boolean {
    return this.props.expiresAt.getTime() <= Date.now();
  }

  /**
   * Indica si el token fue revocado explícitamente (revokedAt IS NOT NULL).
   */
  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  /**
   * Revoca el token: setea revokedAt al momento actual.
   * Es idempotente: una segunda llamada no cambia el valor ya seteado.
   */
  revoke(): void {
    if (this.props.revokedAt === null) {
      this.props.revokedAt = new Date();
    }
  }
}
