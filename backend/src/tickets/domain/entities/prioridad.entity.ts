import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * PrioridadProps — shape de las propiedades del catálogo Prioridad.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface PrioridadProps {
  codigo: string;
  nombre: string;
  color: string | null;
  orden: number;
  activo: boolean;
}

/**
 * PrioridadEntity — entidad de dominio que representa un nivel de prioridad
 * operativa de un ticket (BAJA, MEDIA, ALTA, CRITICA).
 *
 * Es un catálogo sembrado en provisioning.
 *
 * Ref spec: [SPEC:tickets-core/Tabla prioridades]
 * Tarea: 3.A.2
 */
export class PrioridadEntity extends BaseEntity<PrioridadProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   */
  static create(props: PrioridadProps, id?: string): PrioridadEntity {
    return new PrioridadEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: PrioridadProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): PrioridadEntity {
    const entity = new PrioridadEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
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
