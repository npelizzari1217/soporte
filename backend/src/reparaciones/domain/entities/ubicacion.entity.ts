import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * UbicacionProps — shape de las propiedades de una ubicación física.
 * Modela la jerarquía de locaciones del tenant (árbol N niveles vía
 * self-ref `padreId`). Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Tarea: T6.5.
 */
export interface UbicacionProps {
  /** Nombre del espacio físico (ej. "Edificio Central", "Piso 3"). */
  nombre: string;
  /** Descripción adicional del espacio. Null si no se provee. */
  descripcion: string | null;
  /** ID del nodo padre en la jerarquía. Null = nodo raíz. FK → ubicaciones.id (self-ref). */
  padreId: string | null;
  /** Ubicaciones inactivas no están disponibles para nuevos tickets. Default: true. */
  activo: boolean;
}

/**
 * UbicacionEntity — entidad de dominio para locaciones físicas del tenant
 * (catálogo, F3-E2).
 *
 * Reglas de dominio:
 * - padreId = null indica nodo raíz.
 * - activo = true por defecto; las inactivas no pueden usarse en nuevos
 *   tickets edilicios (validado por `CrearTicketEdilicioUseCase`).
 * - Soft delete: la baja lógica en cascada del subárbol es responsabilidad
 *   del use case (`EliminarUbicacionUseCase`, CTE `findSubtree`), no de
 *   esta entidad.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Ref design: "Firmas TS
 * clave" (UbicacionEntity), riesgo técnico #3 (findSubtree CTE). Tarea: T6.5.
 */
export class UbicacionEntity extends BaseEntity<UbicacionProps> {
  private constructor(props: UbicacionProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para una nueva ubicación.
   *
   * @param params.nombre      Nombre del espacio físico.
   * @param params.padreId     UUID del nodo padre (null/omitido = raíz).
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
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
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

  /** Desactiva la ubicación. Las inactivas no pueden usarse en nuevos tickets edilicios. */
  desactivar(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Reactiva la ubicación. */
  activar(): void {
    this.props.activo = true;
    this.touch();
  }

  /**
   * Actualiza los campos editables de datos (PATCH semántico, mismo criterio
   * que `TicketEntity.actualizarDatos`): campos `undefined` NO se tocan;
   * `descripcion`/`padreId` en `null` limpian el valor explícitamente. La
   * validación de existencia del nuevo `padreId` es responsabilidad del use
   * case (`EditarUbicacionUseCase`).
   */
  actualizar(datos: {
    nombre?: string;
    descripcion?: string | null;
    padreId?: string | null;
  }): void {
    if (datos.nombre !== undefined) {
      this.props.nombre = datos.nombre;
    }
    if (datos.descripcion !== undefined) {
      this.props.descripcion = datos.descripcion;
    }
    if (datos.padreId !== undefined) {
      this.props.padreId = datos.padreId;
    }
    this.touch();
  }
}
