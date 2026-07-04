import { BaseEntity } from '../../../shared/domain/base-entity';
import { CicloVigenteInvalidDatesError } from '../errors/clientes.errors';

/**
 * CicloVigenteProps — shape de las propiedades de dominio del CicloVigente.
 * Sin imports de Prisma ni NestJS.
 */
export interface CicloVigenteProps {
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
  activo: boolean;
}

/**
 * CicloVigenteEntity — entidad de dominio para ciclos de gestión globales.
 *
 * Un ciclo vigente define un período de gestión (ej. "Ejercicio 2026").
 * Los tenants referencian estos ciclos via soft ref desde ciclos_cliente.
 *
 * Invariante de dominio: fecha_fin > fecha_inicio (CHECK constraint en DB también).
 * Validación de no-solapamiento entre ciclos activos: en CrearCicloVigenteUseCase.
 *
 * Tarea: 1.A.2
 */
export class CicloVigenteEntity extends BaseEntity<CicloVigenteProps> {
  /**
   * Factory method para nuevas instancias.
   * Valida que fecha_fin > fecha_inicio — lanza CicloVigenteInvalidDatesError si no.
   */
  static create(props: CicloVigenteProps, id?: string): CicloVigenteEntity {
    if (props.fechaFin <= props.fechaInicio) {
      throw new CicloVigenteInvalidDatesError();
    }
    return new CicloVigenteEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (datos ya validados en DB).
   * Omite la validación de fechas — la DB tiene CHECK constraint.
   */
  static reconstitute(
    props: CicloVigenteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): CicloVigenteEntity {
    const entity = new CicloVigenteEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get nombre(): string {
    return this.props.nombre;
  }

  get fechaInicio(): Date {
    return this.props.fechaInicio;
  }

  get fechaFin(): Date {
    return this.props.fechaFin;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento (T2.1) ───────────────────────────────────────────────

  /**
   * Renombra el ciclo. Lanza error si el nombre es vacío o solo whitespace.
   */
  rename(nombre: string): void {
    if (nombre.trim().length === 0) {
      throw new Error('El nombre del ciclo vigente no puede estar vacío.');
    }
    this.props.nombre = nombre;
    this.touch();
  }

  /**
   * Reprograma las fechas del ciclo. Revalida el invariante fecha_fin > fecha_inicio.
   * @throws CicloVigenteInvalidDatesError si fechaFin <= fechaInicio.
   */
  reschedule(fechaInicio: Date, fechaFin: Date): void {
    if (fechaFin <= fechaInicio) {
      throw new CicloVigenteInvalidDatesError();
    }
    this.props.fechaInicio = fechaInicio;
    this.props.fechaFin = fechaFin;
    this.touch();
  }

  /** Marca el ciclo como activo. */
  activate(): void {
    this.props.activo = true;
    this.touch();
  }

  /** Marca el ciclo como inactivo. */
  deactivate(): void {
    this.props.activo = false;
    this.touch();
  }
}
