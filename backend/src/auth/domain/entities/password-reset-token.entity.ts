import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * PasswordResetTokenProps — shape de las propiedades de dominio del token de
 * reseteo de contraseña por olvido (MASTER, `password_reset_tokens`). Sin
 * imports de Prisma ni NestJS — dominio puro.
 *
 * Molde: `EncuestaTokenEntity` (csat/domain/entities). Difiere en que acá
 * ambos extremos, `usuarioId` y `clienteId`, tienen FK real en MASTER — no
 * hay soft ref cross-DB como `ticketId` en CSAT.
 */
export interface PasswordResetTokenProps {
  /** FK → master.usuarios.id. Dueño del token; `ON DELETE CASCADE` en la migración. */
  usuarioId: string;
  /** FK → master.clientes.id. Tenant que emitió el token (el de la única membresía activa). */
  clienteId: string;
  /** SHA-256 del token crudo. El token en texto plano NUNCA se persiste. */
  tokenHash: string;
  /** Emisión + TTL fijado en diseño (60 min). Después de esta fecha el link es inválido. */
  expiresAt: Date;
  /** NULL = no usado. NOT NULL = ya se consumió este token vía CAS (`consumirSiVigente`). */
  usedAt: Date | null;
  /** NULL = vigente. NOT NULL = revocado (nueva solicitud del mismo usuario). */
  revokedAt: Date | null;
}

/**
 * PasswordResetTokenEntity — entidad de dominio del token opaco de reseteo de
 * contraseña por olvido (MASTER). Mismo patrón que `EncuestaTokenEntity`:
 * `isExpired()`/`isUsed()`/`isRevoked()` comparan contra `Date.now()` /
 * `props`, sin mutación — la revocación en bloque
 * (`revocarVigentesDeUsuario`) y el consumo (`consumirSiVigente`) son UPDATE
 * directos del repositorio (design ADR-5/ADR-6), no pasan por `save()`.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "El token es opaco
 * y solo su hash se persiste", "Confirmar con un token inválido responde
 * igual sin importar la causa". Ref design: ADR-6. Tarea: 1.3.
 */
export class PasswordResetTokenEntity extends BaseEntity<PasswordResetTokenProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * Genera UUIDv7 internamente (vía BaseEntity) si no se provee id.
   */
  static create(props: PasswordResetTokenProps, id?: string): PasswordResetTokenEntity {
    return new PasswordResetTokenEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: PasswordResetTokenProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): PasswordResetTokenEntity {
    const entity = new PasswordResetTokenEntity(props, id);
    (entity as unknown as { _createdAt: Date })._createdAt = createdAt;
    (entity as unknown as { _updatedAt: Date })._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get usuarioId(): string {
    return this.props.usuarioId;
  }

  get clienteId(): string {
    return this.props.clienteId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null {
    return this.props.usedAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  // ─── Comportamiento de dominio ──────────────────────────────────────────

  /** Indica si el token ha expirado (`expiresAt <= now`). */
  isExpired(): boolean {
    return this.props.expiresAt.getTime() <= Date.now();
  }

  /** Indica si el token ya fue consumido (`usedAt IS NOT NULL`). */
  isUsed(): boolean {
    return this.props.usedAt !== null;
  }

  /** Indica si el token fue revocado explícitamente (`revokedAt IS NOT NULL`). */
  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }
}
