import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * PrioridadProps — shape de las propiedades del catálogo Prioridad.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * `slaHoras`/`slaActivo` (antes vivían en la entidad separada `SlaConfig`,
 * eliminada — el SLA es un atributo de la prioridad, no una entidad propia):
 * horas objetivo de resolución de SLA para tickets de esta prioridad.
 * `slaHoras: null` = sin SLA aplicable (mismo significado que "sin fila en
 * sla_config" antes de la migración).
 *
 * `slaPrimeraRespuestaHoras`: meta opcional de primera respuesta, en horas
 * hábiles. `null` = sin meta. Es independiente de `slaActivo`.
 */
export interface PrioridadProps {
  codigo: string;
  nombre: string;
  color: string | null;
  orden: number;
  activo: boolean;
  slaHoras: number | null;
  slaActivo: boolean;
  slaPrimeraRespuestaHoras: number | null;
}

/**
 * Props aceptadas por `create()`/`reconstitute()`: `slaHoras`/`slaActivo`
 * son OPCIONALES en la llamada (default `null`/`true`, "sin SLA configurado
 * aún") para no romper los call sites existentes de otros módulos
 * (tickets, catálogos) que no manipulan SLA — sigue siendo imposible leer
 * `prioridad.slaHoras`/`prioridad.slaActivo` como `undefined` una vez
 * construida la entidad (`PrioridadProps` los exige).
 */
export type PrioridadCreateProps = Omit<
  PrioridadProps,
  'slaHoras' | 'slaActivo' | 'slaPrimeraRespuestaHoras'
> &
  Partial<Pick<PrioridadProps, 'slaHoras' | 'slaActivo' | 'slaPrimeraRespuestaHoras'>>;

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
  static create(props: PrioridadCreateProps, id?: string): PrioridadEntity {
    return new PrioridadEntity(
      { slaHoras: null, slaActivo: true, slaPrimeraRespuestaHoras: null, ...props },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: PrioridadCreateProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): PrioridadEntity {
    const entity = new PrioridadEntity(
      { slaHoras: null, slaActivo: true, slaPrimeraRespuestaHoras: null, ...props },
      id,
    );
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

  /** Horas objetivo de resolución de SLA. `null` = sin SLA aplicable a esta prioridad. */
  get slaHoras(): number | null {
    return this.props.slaHoras;
  }

  /** SLA activo/inactivo. Sin efecto si `slaHoras` es `null` (mismo criterio que antes en `sla_config.activo`). */
  get slaActivo(): boolean {
    return this.props.slaActivo;
  }

  /** Meta de primera respuesta en horas hábiles. `null` = sin meta; no depende de `slaActivo`. */
  get slaPrimeraRespuestaHoras(): number | null {
    return this.props.slaPrimeraRespuestaHoras;
  }

  // ─── Comportamiento de dominio (T2, CRUD editable — PR11) ────────────────

  /**
   * Actualiza los campos editables del catálogo (T2, ampliado con SLA):
   * `codigo`, `nombre`, `color`, `orden`, `slaHoras`, `slaActivo`. La
   * unicidad de `codigo` se valida en la capa de aplicación
   * (`EditarPrioridadUseCase`), no acá.
   *
   * Campos `undefined` NO se tocan (PATCH semántico); `color: null` y
   * `slaHoras: null` limpian el valor explícitamente ("sin SLA aplicable").
   *
   * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
   */
  actualizar(datos: {
    codigo?: string;
    nombre?: string;
    color?: string | null;
    orden?: number;
    slaHoras?: number | null;
    slaActivo?: boolean;
    slaPrimeraRespuestaHoras?: number | null;
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
    if (datos.slaHoras !== undefined) {
      this.props.slaHoras = datos.slaHoras;
    }
    if (datos.slaActivo !== undefined) {
      this.props.slaActivo = datos.slaActivo;
    }
    if (datos.slaPrimeraRespuestaHoras !== undefined) {
      this.props.slaPrimeraRespuestaHoras = datos.slaPrimeraRespuestaHoras;
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
