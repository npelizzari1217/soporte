import { uuidv7 } from 'uuidv7';

/**
 * BaseEntity — clase abstracta base de todas las entidades de dominio.
 *
 * Principios:
 * - Sin imports de Prisma, NestJS ni ninguna dependencia de infraestructura.
 * - Auditoría obligatoria: createdAt, updatedAt, deletedAt.
 * - Soft delete: la baja física (DELETE) está prohibida en este sistema.
 * - IDs: UUIDv7, generados en el backend antes del INSERT.
 *
 * @template TProps  Shape de las propiedades específicas de la entidad concreta.
 */
export abstract class BaseEntity<TProps> {
  private readonly _id: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  // Hacemos _deletedAt accesible para los mappers de infraestructura
  _deletedAt: Date | null;

  /** Propiedades específicas de la subclase; accesibles por las subclases. */
  protected readonly props: TProps;

  /**
   * @param props  Propiedades del dominio específicas de la entidad.
   * @param id     ID opcional. Si no se provee, se genera un UUIDv7 nuevo.
   *               Los mappers de infraestructura pasan el id almacenado en la DB.
   */
  constructor(props: TProps, id?: string) {
    this._id = id ?? uuidv7();
    const now = new Date();
    this._createdAt = now;
    this._updatedAt = now;
    this._deletedAt = null;
    this.props = props;
  }

  /** ID único de la entidad (UUIDv7). Inmutable. */
  get id(): string {
    return this._id;
  }

  /** Timestamp de creación. Inmutable. */
  get createdAt(): Date {
    return this._createdAt;
  }

  /** Timestamp de última modificación. */
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /** NULL si la entidad está activa; fecha de baja lógica si fue soft-deleted. */
  get deletedAt(): Date | null {
    return this._deletedAt;
  }

  /**
   * Baja lógica de la entidad (soft delete).
   * Setea deletedAt al momento actual y actualiza updatedAt.
   * NO elimina la fila de la DB — eso lo hace el repositorio.
   *
   * @param at  Fecha de baja. Defaults a now() si no se provee (útil para tests).
   */
  softDelete(at?: Date): void {
    const now = at ?? new Date();
    this._deletedAt = now;
    this._updatedAt = now;
  }

  /**
   * Indica si la entidad fue dada de baja lógicamente.
   */
  isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  /**
   * Actualiza updatedAt al momento actual.
   * Llamado por subclases al mutar propiedades que deben reflejarse en el timestamp.
   */
  protected touch(at?: Date): void {
    this._updatedAt = at ?? new Date();
  }
}
