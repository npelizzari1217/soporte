import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * EncuestaTokenProps — shape de las propiedades de dominio del token de
 * encuesta (MASTER, `encuesta_tokens`). Sin imports de Prisma ni NestJS —
 * dominio puro.
 *
 * Nota sobre soft refs cross-DB: `ticketId` es un UUID de `tenant.tickets`,
 * sin FK (el token vive en MASTER, el ticket en el tenant).
 */
export interface EncuestaTokenProps {
  /** FK → master.clientes.id (misma DB, sí hay FK). */
  clienteId: string;
  /** Soft ref → tenant.tickets.id. Sin FK cross-DB. */
  ticketId: string;
  /** SHA-256 del token crudo. El token en texto plano NUNCA se persiste. */
  tokenHash: string;
  /** Emisión + 30 días. Después de esta fecha el link es inválido. */
  expiresAt: Date;
  /** NULL = no usado. NOT NULL = ya se registró una respuesta con este token (ADR-C2, CAS). */
  usedAt: Date | null;
  /** NULL = vigente. NOT NULL = revocado (reapertura del ticket, nuevo token emitido). */
  revokedAt: Date | null;
}

/**
 * EncuestaTokenEntity — entidad de dominio del token opaco de encuesta de
 * satisfacción (MASTER). Mismo patrón que `RefreshTokenEntity`
 * (auth/domain): `isExpired()`/`isRevoked()` comparan contra `Date.now()`,
 * `revoke()` es idempotente. Agrega `isUsed()` para el uso único por CAS
 * (ADR-C2 del design: `UPDATE ... SET used_at = now() WHERE used_at IS NULL`).
 *
 * Ref spec: sdd/csat/spec, Requirement "Emisión de token al cierre del
 * ticket", "Revocación de tokens previos en reapertura", "Validación del
 * token en el endpoint público". Ref design: ADR-C1, ADR-C2. Tarea: 4.1.
 */
export class EncuestaTokenEntity extends BaseEntity<EncuestaTokenProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * Genera UUIDv7 internamente (vía BaseEntity) si no se provee id.
   */
  static create(props: EncuestaTokenProps, id?: string): EncuestaTokenEntity {
    return new EncuestaTokenEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: EncuestaTokenProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): EncuestaTokenEntity {
    const entity = new EncuestaTokenEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get clienteId(): string {
    return this.props.clienteId;
  }

  get ticketId(): string {
    return this.props.ticketId;
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

  /** Indica si el token ya fue usado para registrar una respuesta (`usedAt IS NOT NULL`). */
  isUsed(): boolean {
    return this.props.usedAt !== null;
  }

  /** Indica si el token fue revocado explícitamente (`revokedAt IS NOT NULL`). */
  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  /**
   * Revoca el token: setea `revokedAt` al momento actual.
   * Idempotente: una segunda llamada no cambia el valor ya seteado — evita
   * que una revocación en bloque (`revocarVigentesDeTicket`) pise la fecha
   * original de un token ya revocado.
   */
  revoke(): void {
    if (this.props.revokedAt === null) {
      this.props.revokedAt = new Date();
    }
  }
}
