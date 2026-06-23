import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * UbicacionProps — shape de las propiedades de una ubicación física.
 *
 * Modela la jerarquía de locaciones (árbol N niveles via self-ref padre_id).
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:reparaciones/Tabla ubicaciones]
 * Tarea: 5.A.2
 */
export interface UbicacionProps {
  /** Nombre del espacio físico (ej. "Edificio Central", "Piso 3"). */
  nombre: string;
  /** Descripción adicional del espacio. Null si no se provee. */
  descripcion: string | null;
  /**
   * ID del nodo padre en la jerarquía. Null = nodo raíz.
   * FK → ubicaciones.id (self-reference).
   */
  padreId: string | null;
  /**
   * Ubicaciones inactivas no están disponibles para nuevos tickets.
   * Default: true.
   */
  activo: boolean;
}

/**
 * UbicacionEntity — entidad de dominio para locaciones físicas.
 *
 * Modela un árbol de ubicaciones físicas mediante self-reference padre_id.
 * Ejemplos: Edificio Central → Piso 3 → Sala de Servidores.
 *
 * Reglas de dominio:
 * - padre_id = null indica nodo raíz.
 * - activo = true por defecto; las inactivas no pueden usarse en nuevos tickets.
 * - Soft delete: la baja lógica propaga en cascada lógica a los hijos
 *   (responsabilidad del use case, no de la entidad).
 *
 * Ref spec: [SPEC:reparaciones/Tabla ubicaciones, Ubicaciones jerárquicas]
 * Tarea: 5.A.2
 */
export class UbicacionEntity extends BaseEntity<UbicacionProps> {
  /**
   * Factory method para una nueva ubicación.
   *
   * @param params.nombre      Nombre del espacio físico.
   * @param params.padreId     UUID del nodo padre (null = raíz).
   * @param params.descripcion Descripción adicional (opcional).
   * @param id                 UUID opcional. Si no se provee, se genera UUIDv7.
   */
  static create(
    params: { nombre: string; padreId?: string | null; descripcion?: string | null },
    id?: string,
  ): UbicacionEntity {
    return new UbicacionEntity(
      {
        nombre: params.nombre,
        descripcion: params.descripcion ?? null,
        padreId: params.padreId ?? null,
        activo: true,
      },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: UbicacionProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): UbicacionEntity {
    const entity = new UbicacionEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get nombre(): string {
    return this.props.nombre;
  }

  get descripcion(): string | null {
    return this.props.descripcion;
  }

  get padreId(): string | null {
    return this.props.padreId;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Desactiva la ubicación. Las ubicaciones inactivas no pueden usarse en
   * nuevos tickets edilicios.
   */
  desactivar(): void {
    this.props.activo = false;
  }

  /**
   * Reactiva la ubicación.
   */
  activar(): void {
    this.props.activo = true;
  }
}
