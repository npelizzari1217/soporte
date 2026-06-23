import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * CicloClienteProps — shape de las propiedades del ciclo de gestión de un tenant.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Nota sobre soft refs:
 * - cicloVigenteId es UUID de master.ciclos_vigentes — sin FK cross-DB.
 *   Multitenancy database-per-tenant: FK cross-DB es imposible en Postgres.
 *   La integridad se valida en la capa de aplicación si se necesita.
 */
export interface CicloClienteProps {
  /**
   * Soft ref → master.ciclos_vigentes.id (sin FK cross-DB).
   * UUID del ciclo vigente global al que corresponde este ciclo de tenant.
   * El dominio lo almacena como dato opaco — no valida su existencia.
   */
  cicloVigenteId: string;
  /** Nombre del ciclo en este tenant (puede diferir del nombre global). */
  nombre: string;
  /** Fecha de inicio efectiva para este tenant. */
  fechaInicio: Date;
  /** Fecha de fin efectiva para este tenant. */
  fechaFin: Date;
  /** Si el ciclo está activo en este tenant. */
  activo: boolean;
}

/**
 * CicloClienteEntity — entidad de dominio que representa un período de gestión
 * activo en el tenant.
 *
 * Modelo multitenancy: los tickets pueden pertenecer a un ciclo de cliente.
 * cicloVigenteId es una SOFT REF cross-DB al catálogo global (master.ciclos_vigentes).
 * No existe FK a nivel de DB tenant — el aislamiento es por separación de DB.
 *
 * Ref spec: [SPEC:tickets-core/Tabla ciclos_cliente]
 * Tarea: 3.A.2
 */
export class CicloClienteEntity extends BaseEntity<CicloClienteProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   */
  static create(props: CicloClienteProps, id?: string): CicloClienteEntity {
    return new CicloClienteEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: CicloClienteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): CicloClienteEntity {
    const entity = new CicloClienteEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  /**
   * UUID de master.ciclos_vigentes correspondiente (soft ref, sin FK).
   * El dominio almacena el ID tal como llega; la aplicación valida existencia.
   */
  get cicloVigenteId(): string {
    return this.props.cicloVigenteId;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get fechaInicio(): Date {
    return this.props.fechaInicio;
  }

  get fechaFin(): Date {
    return this.props.fechaFin;
  }

  get activo(): boolean {
    return this.props.activo;
  }
}
