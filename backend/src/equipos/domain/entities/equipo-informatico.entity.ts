import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * EquipoInformaticoProps — shape de las propiedades de dominio del EquipoInformatico.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Nota sobre soft refs:
 * - asignado_a_id: UUID de master.usuarios — sin FK cross-DB.
 *   Su integridad se valida en la capa de aplicación (AsignarEquipoUseCase).
 *
 * Ref spec: [SPEC:equipos/Tabla equipos_informaticos]
 * Tarea: 6.A.2
 */
export interface EquipoInformaticoProps {
  /** Nombre o identificador descriptivo del equipo. Ej: "PC Contabilidad 03". */
  nombre: string;
  /** Número de serie del fabricante. NULL si no disponible. UNIQUE parcial WHERE NOT NULL. */
  numeroSerie: string | null;
  /** Fabricante. Ej: Dell, HP, Lenovo. */
  marca: string | null;
  /** Modelo comercial. */
  modelo: string | null;
  /** Fecha de compra o incorporación al inventario. */
  fechaAdquisicion: Date | null;
  /** UUID de la ubicación física del equipo (FK → ubicaciones.id). NULL si sin ubicar. */
  ubicacionId: string | null;
  /**
   * Soft ref → master.usuarios.id. Usuario que usa el equipo.
   * NULL si sin asignar. El dominio NO valida la existencia de este UUID
   * cross-DB — eso es responsabilidad de AsignarEquipoUseCase (application layer).
   */
  asignadoAId: string | null;
  /**
   * Estado activo del equipo en el inventario.
   * TRUE = equipo disponible; FALSE = equipo dado de baja del inventario.
   * DISTINTO de deleted_at (soft-delete): un equipo puede estar inactivo
   * pero aún presente en la DB para conservar el historial de tickets.
   * Default: true.
   */
  activo: boolean;
}

/**
 * EquipoInformaticoEntity — inventario de equipos del tenant.
 *
 * Cada equipo puede tener componentes asociados (ComponenteEquipo) y
 * puede ser referenciado en tickets de soporte (TicketSoporte).
 *
 * Reglas de dominio:
 * - activo = true por defecto al crear.
 * - deactivate(): baja lógica del inventario. Setea activo=false SIN tocar deleted_at.
 *   Distinto de softDelete() (BaseEntity) que setea deleted_at.
 * - Los tickets de soporte existentes NO se ven afectados por deactivate() ni softDelete().
 * - asignadoAId es un soft ref cross-DB. El dominio solo lo almacena.
 *
 * Ref spec: [SPEC:equipos/Tabla equipos_informaticos, Soft delete de equipo]
 * Tarea: 6.A.2
 */
export class EquipoInformaticoEntity extends BaseEntity<EquipoInformaticoProps> {
  /**
   * Factory method para un nuevo equipo en el inventario.
   * activo = true por defecto.
   *
   * @param props Propiedades del equipo.
   * @param id    UUID opcional. Si no se provee, se genera UUIDv7.
   */
  static create(props: EquipoInformaticoProps, id?: string): EquipoInformaticoEntity {
    return new EquipoInformaticoEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: EquipoInformaticoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): EquipoInformaticoEntity {
    const entity = new EquipoInformaticoEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
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

  get asignadoAId(): string | null {
    return this.props.asignadoAId;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Da de baja lógica el equipo del inventario activo.
   *
   * Setea activo = false. NO setea deleted_at — ese es el rol de softDelete()
   * (heredado de BaseEntity). Ambos conceptos son independientes:
   * - activo=false: equipo inactivo, no disponible para nuevos tickets.
   * - deleted_at: eliminación lógica del registro (historial preservado).
   *
   * Los tickets de soporte que referencian este equipo permanecen intactos.
   */
  deactivate(): void {
    this.props.activo = false;
  }

  /**
   * Asigna el equipo a un usuario del tenant.
   *
   * asignadoAId es un soft ref cross-DB a master.usuarios.id.
   * La validación de existencia y pertenencia al tenant es responsabilidad
   * de AsignarEquipoUseCase (application layer).
   *
   * @param usuarioId UUID del usuario de master.usuarios.
   */
  asignarA(usuarioId: string | null): void {
    this.props.asignadoAId = usuarioId;
  }

  /**
   * Actualiza la ubicación física del equipo.
   *
   * @param ubicacionId UUID de la nueva ubicación (o null para desasociar).
   */
  actualizarUbicacion(ubicacionId: string | null): void {
    this.props.ubicacionId = ubicacionId;
  }

  /**
   * Actualiza los campos editables del equipo informático.
   *
   * Usado por EditarEquipoUseCase. Todos los campos son opcionales en el DTO;
   * solo se actualizan los provistos (undefined = sin cambio).
   *
   * Nota: asignadoAId no se actualiza acá — tiene su propio use case (AsignarEquipo).
   *
   * @param campos Subconjunto de props a actualizar.
   */
  actualizar(campos: {
    nombre?: string;
    numeroSerie?: string | null;
    marca?: string | null;
    modelo?: string | null;
    fechaAdquisicion?: Date | null;
    ubicacionId?: string | null;
  }): void {
    if (campos.nombre !== undefined) this.props.nombre = campos.nombre;
    if (campos.numeroSerie !== undefined) this.props.numeroSerie = campos.numeroSerie;
    if (campos.marca !== undefined) this.props.marca = campos.marca;
    if (campos.modelo !== undefined) this.props.modelo = campos.modelo;
    if (campos.fechaAdquisicion !== undefined)
      this.props.fechaAdquisicion = campos.fechaAdquisicion;
    if (campos.ubicacionId !== undefined) this.props.ubicacionId = campos.ubicacionId;
  }
}
