import { BaseEntity } from '../../../shared/domain/base-entity';
import { PermisoCodigoInvalidoError } from '../errors/auth.errors';

/**
 * PermisoProps — shape de las propiedades de dominio del Permiso.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface PermisoProps {
  /** Acción atómica con convención "recurso:accion" (ej. "ticket:crear"). */
  codigo: string;
  /** Descripción legible del permiso. Nullable. */
  descripcion: string | null;
}

/**
 * PermisoEntity — entidad de dominio que representa un permiso atómico del RBAC.
 *
 * Convención de código: "recurso:accion" en minúsculas (ej. "ticket:crear",
 * "compra:aprobar"). El código identifica semánticamente el permiso; el id es
 * la PK técnica.
 *
 * Invariante: el código DEBE contener exactamente un ":" con recurso y acción
 * no vacíos.
 *
 * Tarea: T2.1 (PR2 — Auth domain + ports + hashing + token service)
 */
export class PermisoEntity extends BaseEntity<PermisoProps> {
  /**
   * Factory method para nuevas instancias.
   * Valida el formato "recurso:accion" — lanza PermisoCodigoInvalidoError si inválido.
   */
  static create(props: PermisoProps, id?: string): PermisoEntity {
    PermisoEntity.validateCodigo(props.codigo);
    return new PermisoEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (datos ya validados en DB).
   * Omite la validación del código.
   * Acepta timestamps de la DB para hidratación completa, evitando que
   * createdAt/updatedAt/deletedAt sean sobreescritos por now().
   */
  static reconstitute(
    props: PermisoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): PermisoEntity {
    const entity = new PermisoEntity(props, id);
    (entity as unknown as { _createdAt: Date })._createdAt = createdAt;
    (entity as unknown as { _updatedAt: Date })._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Validación interna ──────────────────────────────────────────────────

  private static validateCodigo(codigo: string): void {
    // Formato "recurso:accion": ambas partes no vacías, exactamente un ":"
    const parts = codigo.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new PermisoCodigoInvalidoError(codigo);
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get codigo(): string {
    return this.props.codigo;
  }

  get descripcion(): string | null {
    return this.props.descripcion;
  }
}
