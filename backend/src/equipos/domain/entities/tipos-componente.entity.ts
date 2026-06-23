import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TipoComponenteProps — shape de las propiedades del catálogo TipoComponente.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:equipos/Tabla tipos_componente]
 * Tarea: 6.A.2
 */
export interface TipoComponenteProps {
  /** Código corto del tipo: CPU, RAM, DISCO, MONITOR, TECLADO, MOUSE, GPU, FUENTE, IMPRESORA, RED. */
  codigo: string;
  /** Label human-readable. */
  nombre: string;
  /**
   * Indica si el tipo está disponible para nuevos componentes.
   * Un tipo inactivo no puede usarse en nuevas inserciones de ComponenteEquipo,
   * pero los componentes existentes de ese tipo NO se ven afectados.
   * Default: true.
   */
  activo: boolean;
}

/**
 * TipoComponenteEntity — catálogo de tipos de hardware para componentes de equipo.
 *
 * Sembrado en el provisioning de cada tenant (10 tipos base).
 * El administrador puede agregar tipos propios y desactivar los existentes.
 *
 * Ref spec: [SPEC:equipos/Tabla tipos_componente, Seeds de tipos_componente]
 * Tarea: 6.A.2
 */
export class TipoComponenteEntity extends BaseEntity<TipoComponenteProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * Genera UUIDv7 internamente (via BaseEntity) si no se provee id.
   *
   * @param params  Propiedades del tipo de componente.
   * @param id      UUID opcional. Si no se provee, se genera UUIDv7.
   */
  static create(
    params: { codigo: string; nombre: string; activo?: boolean },
    id?: string,
  ): TipoComponenteEntity {
    return new TipoComponenteEntity(
      {
        codigo: params.codigo,
        nombre: params.nombre,
        activo: params.activo ?? true,
      },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: TipoComponenteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TipoComponenteEntity {
    const entity = new TipoComponenteEntity(props, id);
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

  get activo(): boolean {
    return this.props.activo;
  }
}
