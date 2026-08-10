import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * EquipoInformaticoProps — shape de las propiedades del inventario de
 * equipos IT del tenant. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1 (Tabla equipos_informaticos).
 * Tarea: T10.1, T10.2.
 */
export interface EquipoInformaticoProps {
  /** Nombre/etiqueta del equipo. */
  nombre: string;
  /** Único en el tenant cuando NO es null (índice único parcial, PR1/Fase1). */
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  fechaAdquisicion: Date | null;
  /** FK → ubicaciones.id. NULL = sin ubicación asignada. */
  ubicacionId: string | null;
  /**
   * `true` = disponible/en uso; `false` = dado de baja (fuera de servicio).
   * DISTINTO de `deletedAt` (soft delete): un equipo `activo=false`
   * permanece en el historial y sigue siendo referenciable por
   * `ticket_soporte` existentes.
   */
  activo: boolean;
}

/**
 * EquipoInformaticoEntity — entidad de dominio del inventario de equipos IT
 * (F3-Q1, ADR-9).
 *
 * DECISIÓN CLAVE (ADR-9): `deactivate()` (activo=false, historial
 * preservado) es DISTINTO de `softDelete()` heredado de `BaseEntity`
 * (deletedAt, baja lógica completa). Ambos NO rompen tickets de soporte que
 * referencian el equipo (`ticket_soporte.equipoId` no tiene ON DELETE
 * restrictivo a nivel de dominio).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Ref design: ADR-9, "Firmas
 * TS clave" (EquipoInformaticoEntity). Tarea: T10.1, T10.2.
 */
export class EquipoInformaticoEntity extends BaseEntity<EquipoInformaticoProps> {
  private constructor(props: EquipoInformaticoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para un nuevo equipo. `activo` se inicializa siempre en
   * `true` — la baja se hace explícitamente vía `deactivate()`.
   */
  static create(
    props: Omit<EquipoInformaticoProps, 'activo'>,
    id?: string,
  ): EquipoInformaticoEntity {
    return new EquipoInformaticoEntity({ ...props, activo: true }, id);
  }

  /** Reconstitución desde persistencia (mappers de infraestructura). */
  static reconstitute(
    props: EquipoInformaticoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): EquipoInformaticoEntity {
    const entity = new EquipoInformaticoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get nombre(): string {
    return this.props.nombre;
  }

  get numeroSerie(): string | null {
    return this.props.numeroSerie;
  }

  get marca(): string | null {
    return this.props.marca;
  }

  get modelo(): string | null {
    return this.props.modelo;
  }

  get fechaAdquisicion(): Date | null {
    return this.props.fechaAdquisicion;
  }

  get ubicacionId(): string | null {
    return this.props.ubicacionId;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Da de baja el equipo (fuera de servicio). NO es soft delete: el
   * registro permanece visible en el historial y sigue siendo referenciable
   * por `ticket_soporte` existentes. Ver diferencia con `softDelete()` en
   * el JSDoc de la clase (ADR-9).
   */
  deactivate(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Reactiva un equipo previamente dado de baja. */
  activate(): void {
    this.props.activo = true;
    this.touch();
  }

  /** Cambia la ubicación física del equipo. La validación de existencia es responsabilidad del use case. */
  actualizarUbicacion(ubicacionId: string | null): void {
    this.props.ubicacionId = ubicacionId;
    this.touch();
  }

  /**
   * Actualiza los campos editables de datos (PATCH semántico, mismo
   * criterio que `UbicacionEntity.actualizar`): campos `undefined` NO se
   * tocan; los campos nullable en `null` limpian el valor explícitamente.
   */
  actualizar(datos: {
    nombre?: string;
    numeroSerie?: string | null;
    marca?: string | null;
    modelo?: string | null;
    fechaAdquisicion?: Date | null;
    ubicacionId?: string | null;
  }): void {
    if (datos.nombre !== undefined) {
      this.props.nombre = datos.nombre;
    }
    if (datos.numeroSerie !== undefined) {
      this.props.numeroSerie = datos.numeroSerie;
    }
    if (datos.marca !== undefined) {
      this.props.marca = datos.marca;
    }
    if (datos.modelo !== undefined) {
      this.props.modelo = datos.modelo;
    }
    if (datos.fechaAdquisicion !== undefined) {
      this.props.fechaAdquisicion = datos.fechaAdquisicion;
    }
    if (datos.ubicacionId !== undefined) {
      this.props.ubicacionId = datos.ubicacionId;
    }
    this.touch();
  }
}
