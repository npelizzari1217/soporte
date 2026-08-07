import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * CicloClienteProps — shape de las propiedades del período de gestión de un
 * tenant. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Nota sobre soft refs:
 * - `cicloVigenteId` es UUID de master.ciclos_vigentes — sin FK cross-DB
 *   (database-per-tenant: una FK cross-DB es imposible en Postgres). El
 *   dominio lo almacena como dato opaco; la integridad se valida en la
 *   capa de aplicación si se necesita.
 */
export interface CicloClienteProps {
  /** Soft ref → master.ciclos_vigentes.id. Sin FK cross-DB. */
  cicloVigenteId: string;
  /** Nombre del ciclo en este tenant (puede diferir del nombre global). */
  nombre: string;
  /** Fecha de inicio efectiva para este tenant. */
  fechaInicio: Date;
  /** Fecha de fin efectiva para este tenant. */
  fechaFin: Date;
  /** Si el ciclo está activo en este tenant. Un tenant tiene a lo sumo uno. */
  activo: boolean;
}

/**
 * CicloClienteEntity — período de gestión activo en el tenant.
 *
 * `ResolverCicloActivoParaCreacion` (application) resuelve el único ciclo
 * `activo=true` del tenant para estampar `ticket.cicloId` al crear (T4).
 *
 * Ref spec: sdd/tickets-core/spec T4, T7 (tabla ciclos_cliente). Ref
 * design: "Archivos afectados" PR5. Tarea: T5.6.
 */
export class CicloClienteEntity extends BaseEntity<CicloClienteProps> {
  /** Factory method para nuevas instancias de dominio. */
  static create(props: CicloClienteProps, id?: string): CicloClienteEntity {
    return new CicloClienteEntity(props, id);
  }

  /** Reconstitución desde persistencia (mappers de infraestructura). */
  static reconstitute(
    props: CicloClienteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): CicloClienteEntity {
    const entity = new CicloClienteEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

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
