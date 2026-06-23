import { BaseEntity } from '../../../shared/domain/base-entity';
import { TipoComponenteIdRequeridoError } from '../errors/equipos.errors';

/**
 * ComponenteEquipoProps — shape de las propiedades de dominio del ComponenteEquipo.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:equipos/Tabla componentes_equipo]
 * Tarea: 6.A.2
 */
export interface ComponenteEquipoProps {
  /** UUID del equipo al que pertenece este componente (FK → equipos_informaticos.id). */
  equipoId: string;
  /**
   * UUID del tipo de componente (FK → tipos_componente.id). REQUERIDO.
   * Validado en create(): no puede estar vacío.
   */
  tipoComponenteId: string;
  /** Descripción adicional: modelo, especificación técnica. Ej: "Intel Core i7-12700". */
  descripcion: string | null;
  /** Número de serie del componente individual (no del equipo). */
  numeroSerie: string | null;
  /** Capacidad o especificación. Ej: "16GB DDR4", "1TB NVMe". */
  capacidad: string | null;
}

/**
 * ComponenteEquipoEntity — componente de hardware instalado en un equipo.
 *
 * Un equipo puede tener múltiples componentes del mismo tipo
 * (ej. dos módulos RAM con el mismo tipo pero distintos id).
 *
 * Reglas de dominio:
 * - tipoComponenteId es OBLIGATORIO: create() rechaza strings vacíos.
 * - Un tipo de componente inactivo impide crear NUEVOS componentes de ese tipo.
 *   Esa validación ocurre en la capa de aplicación (GestionarComponenteUseCase).
 * - Soft delete del componente NO afecta el equipo ni los demás componentes.
 *
 * Ref spec: [SPEC:equipos/Tabla componentes_equipo, Múltiples componentes del mismo tipo]
 * Tarea: 6.A.2
 */
export class ComponenteEquipoEntity extends BaseEntity<ComponenteEquipoProps> {
  /**
   * Factory method para un nuevo componente de equipo.
   *
   * @param props Propiedades del componente. tipoComponenteId es OBLIGATORIO.
   * @param id    UUID opcional. Si no se provee, se genera UUIDv7.
   * @throws TipoComponenteIdRequeridoError si tipoComponenteId está vacío.
   */
  static create(props: ComponenteEquipoProps, id?: string): ComponenteEquipoEntity {
    if (!props.tipoComponenteId) {
      throw new TipoComponenteIdRequeridoError();
    }
    return new ComponenteEquipoEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   * Omite la validación de tipoComponenteId (datos ya validados en DB).
   */
  static reconstitute(
    props: ComponenteEquipoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ComponenteEquipoEntity {
    const entity = new ComponenteEquipoEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get equipoId(): string {
    return this.props.equipoId;
  }

  get tipoComponenteId(): string {
    return this.props.tipoComponenteId;
  }

  get descripcion(): string | null {
    return this.props.descripcion;
  }

  get numeroSerie(): string | null {
    return this.props.numeroSerie;
  }

  get capacidad(): string | null {
    return this.props.capacidad;
  }
}
