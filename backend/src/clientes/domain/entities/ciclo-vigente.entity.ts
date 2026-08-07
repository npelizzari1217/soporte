import { BaseEntity } from '../../../shared/domain/base-entity';
import { CicloVigenteInvalidDatesError } from '../errors/clientes.errors';

/**
 * CicloVigenteProps — shape de las propiedades de dominio del CicloVigente
 * (catálogo global de ciclos de gestión, master). Sin imports de Prisma ni
 * NestJS — dominio puro.
 */
export interface CicloVigenteProps {
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
  activo: boolean;
}

/**
 * CicloVigenteEntity — entidad de dominio del catálogo global de ciclos
 * (ej. "Ciclo 2026"). Alta exclusiva de ROOT (`is_global_admin`), enforced en
 * la capa de aplicación (`GlobalAdminGuard` + revalidación en el use case).
 *
 * Invariante estructural: `fechaFin > fechaInicio` (R20) — reforzado acá en
 * `create()` Y con un CHECK constraint en la migración SQL (defensa en
 * profundidad: la entidad falla rápido en memoria, el CHECK protege contra
 * cualquier escritura que no pase por este constructor).
 *
 * Los tenants referencian estos ciclos vía soft ref desde
 * `tenant.ciclos_cliente.ciclo_vigente_id` (cross-DB, sin FK física).
 *
 * Tarea: T9.1 (PR9 — Ciclos: catálogo master + adopción/activación)
 */
export class CicloVigenteEntity extends BaseEntity<CicloVigenteProps> {
  /**
   * Factory method para nuevas instancias.
   * @throws CicloVigenteInvalidDatesError si `fechaFin <= fechaInicio`.
   */
  static create(props: CicloVigenteProps, id?: string): CicloVigenteEntity {
    if (props.fechaFin <= props.fechaInicio) {
      throw new CicloVigenteInvalidDatesError();
    }
    return new CicloVigenteEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (datos ya validados por el CHECK de
   * la DB al momento del INSERT) — omite la revalidación de fechas.
   */
  static reconstitute(
    props: CicloVigenteProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): CicloVigenteEntity {
    const entity = new CicloVigenteEntity(props, id);
    (entity as unknown as { _createdAt: Date })._createdAt = createdAt;
    (entity as unknown as { _updatedAt: Date })._updatedAt = updatedAt;
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

  // ─── Mutaciones (ABM ROOT — ciclos-abm-root) ────────────────────────────

  /**
   * Renombra el ciclo. Sin validación de unicidad (R20 no la exige para el
   * catálogo global, igual que en `CrearCicloVigenteUseCase`).
   */
  rename(nombre: string): void {
    this.props.nombre = nombre;
    this.touch();
  }

  /**
   * Reprograma las fechas del ciclo.
   * @throws CicloVigenteInvalidDatesError si `fechaFin <= fechaInicio`
   *   (mismo invariante estructural de `create()`, R20).
   */
  reschedule(fechaInicio: Date, fechaFin: Date): void {
    if (fechaFin <= fechaInicio) {
      throw new CicloVigenteInvalidDatesError();
    }
    this.props.fechaInicio = fechaInicio;
    this.props.fechaFin = fechaFin;
    this.touch();
  }
}
