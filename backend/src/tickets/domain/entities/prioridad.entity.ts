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
 * PrioridadEntity — entidad de dominio del catálogo FIJO de 4 prioridades
 * (BAJA, MEDIA, ALTA, CRITICA). Sembrado en provisioning por
 * `TenantSeederAdapter` (Fase 1). Usado por el módulo SLA (fases futuras)
 * para calcular `sla_vence_at`.
 *
 * Ref spec: sdd/tickets-core/spec (Área A — Catálogos). Tarea: T2.1
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

  // ─── Comportamiento de dominio (T2, CRUD editable — PR11) ────────────────

  /**
   * Actualiza los campos editables del catálogo (T2): `codigo`, `nombre`,
   * `color`, `orden`. La unicidad de `codigo` se valida en la capa de
   * aplicación (`EditarPrioridadUseCase`), no acá.
   *
   * Campos `undefined` NO se tocan (PATCH semántico); `color: null` limpia
   * el valor explícitamente.
   *
   * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
   */
  actualizar(datos: {
    codigo?: string;
    nombre?: string;
    color?: string | null;
    orden?: number;
  }): void {
    if (datos.codigo !== undefined) {
      this.props.codigo = datos.codigo;
    }
    if (datos.nombre !== undefined) {
      this.props.nombre = datos.nombre;
    }
    if (datos.color !== undefined) {
      this.props.color = datos.color;
    }
    if (datos.orden !== undefined) {
      this.props.orden = datos.orden;
    }
    this.touch();
  }

  /**
   * Da de baja la prioridad (T2): soft delete (`deletedAt`) + setea
   * `activo=false`. NO rompe tickets existentes que la referencian.
   *
   * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
   */
  desactivar(): void {
    this.props.activo = false;
    this.softDelete();
  }

  /**
   * Reactiva la prioridad dada de baja: limpia `deletedAt` y setea
   * `activo=true`.
   *
   * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
   */
  activar(): void {
    this.props.activo = true;
    this._deletedAt = null;
    this.touch();
  }
}
