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
 * EstadoEntity — entidad de dominio que representa un estado del ciclo de vida
 * de un ticket (ABIERTO, EN_PROGRESO, CERRADO, etc.).
 *
 * Es un catálogo sembrado en provisioning. El administrador del tenant puede
 * agregar estados propios si el modelo de negocio lo requiere.
 *
 * Ref spec: [SPEC:tickets-core/Tabla estados]
 * Tarea: 3.A.2
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
