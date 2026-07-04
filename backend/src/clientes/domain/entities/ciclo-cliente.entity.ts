import { BaseEntity } from '../../../shared/domain/base-entity';
import { CicloVigenteInvalidDatesError } from '../errors/clientes.errors';

/**
 * CicloClienteProps — shape de las propiedades de dominio del ciclo de gestión de un tenant.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Nota: distinto del CicloClienteEntity de tickets/domain que incluye cicloVigenteId
 * (soft-ref a master). Este entity es para las operaciones administrativas del panel
 * (crear, listar, activar ciclos de un tenant), y no expone el soft-ref master.
 *
 * Tarea: T2.6
 */
export interface CicloClienteAdminProps {
  /** Nombre descriptivo del ciclo (ej. "Ejercicio 2026"). */
  nombre: string;
  /** Fecha de inicio del ciclo. */
  fechaInicio: Date;
  /** Fecha de fin del ciclo (debe ser > fechaInicio). */
  fechaFin: Date;
  /**
   * Si el ciclo está activo en este tenant.
   * Solo UN ciclo puede estar activo por tenant a la vez.
   */
  activo: boolean;
  /**
   * Link real al `CicloVigenteEntity` (catálogo master) del que este ciclo
   * fue elegido (ADR-5). Referencia, no join — nombre/fechas son snapshot.
   */
  cicloVigenteId: string;
}

/**
 * CicloClienteEntity (admin) — entidad de dominio para operaciones de gestión
 * de ciclos del tenant en el panel de administración.
 *
 * Invariante de dominio: fecha_fin > fecha_inicio.
 * Activación: solo un ciclo activo por tenant (invariante mantenido por ActivarCicloUseCase).
 *
 * Tarea: T2.6
 */
export class CicloClienteEntity extends BaseEntity<CicloClienteAdminProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * Valida que fecha_fin > fecha_inicio — lanza CicloVigenteInvalidDatesError si no.
   */
  static create(props: CicloClienteAdminProps, id?: string): CicloClienteEntity {
    if (props.fechaFin <= props.fechaInicio) {
      throw new CicloVigenteInvalidDatesError();
    }
    return new CicloClienteEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (datos ya validados en DB).
   * Omite la validación de fechas — la DB tiene CHECK constraint.
   */
  static reconstitute(
    props: CicloClienteAdminProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): CicloClienteEntity {
    const entity = new CicloClienteEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

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

  get cicloVigenteId(): string {
    return this.props.cicloVigenteId;
  }

  // ─── Comportamiento ───────────────────────────────────────────────────────

  /** Activa este ciclo. El repositorio es responsable de desactivar los demás. */
  activate(): void {
    this.props.activo = true;
  }

  /** Desactiva este ciclo. */
  deactivate(): void {
    this.props.activo = false;
  }
}
