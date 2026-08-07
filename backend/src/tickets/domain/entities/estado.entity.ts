import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * EstadoProps — shape de las propiedades del catálogo Estado.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface EstadoProps {
  codigo: string;
  nombre: string;
  color: string | null;
  orden: number;
  activo: boolean;
}

/**
 * EstadoEntity — entidad de dominio del catálogo FIJO de 6 estados del
 * ciclo de vida del ticket (NUEVO, ASIGNADO, EN_PROCESO, RESUELTO, CERRADO,
 * CANCELADO — ADR-1). NO editable por el admin del tenant: sin endpoints de
 * alta/baja/edición (spec T1). Sembrado en provisioning por
 * `TenantSeederAdapter` (Fase 1, ya realineado a los 6 códigos).
 *
 * Ref spec: sdd/tickets-core/spec T1. Ref design: ADR-1, ADR-3 (Firmas TS).
 * Tarea: T2.1
 */
export class EstadoEntity extends BaseEntity<EstadoProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * Genera UUIDv7 internamente (via BaseEntity) si no se provee id.
   */
  static create(props: EstadoProps, id?: string): EstadoEntity {
    return new EstadoEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: EstadoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): EstadoEntity {
    const entity = new EstadoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get codigo(): string {
    return this.props.codigo;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get color(): string | null {
    return this.props.color;
  }

  get orden(): number {
    return this.props.orden;
  }

  get activo(): boolean {
    return this.props.activo;
  }
}
