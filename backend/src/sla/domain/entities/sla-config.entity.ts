import { BaseEntity } from '../../../shared/domain/base-entity';
import { HorasInvalidasError } from '../errors/sla.errors';

/**
 * SlaConfigProps — shape de las propiedades de dominio de `SlaConfig`.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface SlaConfigProps {
  /** FK → prioridades.id (UNIQUE — una fila por prioridad, S1). */
  prioridadId: string;
  /** Horas de SLA para esta prioridad. Invariante: entero > 0. */
  horas: number;
  activo: boolean;
}

function assertHorasValidas(horas: number): void {
  if (!Number.isFinite(horas) || horas <= 0) {
    throw new HorasInvalidasError(horas);
  }
}

/**
 * SlaConfigEntity — configuración de SLA por prioridad (S1), editable por
 * ADMINISTRADOR (`catalogo:gestionar`). Una fila por prioridad del catálogo
 * FIJO (no se crean/eliminan filas — solo edición de `horas`/`activo`,
 * sembrada en provisioning con defaults CRITICA=4h/ALTA=8h/MEDIA=24h/BAJA=48h).
 *
 * Ref spec: sdd/premium/spec S1. Ref design: ADR-P1. Tarea: SA2.
 */
export class SlaConfigEntity extends BaseEntity<SlaConfigProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * @throws HorasInvalidasError si `props.horas` no es un entero > 0.
   */
  static create(props: SlaConfigProps, id?: string): SlaConfigEntity {
    assertHorasValidas(props.horas);
    return new SlaConfigEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). No
   * revalida `horas` — se asume que la fila persistida ya es válida.
   */
  static reconstitute(
    props: SlaConfigProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): SlaConfigEntity {
    const entity = new SlaConfigEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get prioridadId(): string {
    return this.props.prioridadId;
  }

  get horas(): number {
    return this.props.horas;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio (S1) ────────────────────────────────────

  /**
   * Edita las horas de SLA de esta configuración.
   * @throws HorasInvalidasError si `horas` no es un entero > 0 — NO muta en ese caso.
   */
  editarHoras(horas: number): void {
    assertHorasValidas(horas);
    this.props.horas = horas;
    this.touch();
  }

  /** Desactiva esta configuración (S1: `activo=false` → sin SLA aplicable). */
  desactivar(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Reactiva esta configuración. */
  activar(): void {
    this.props.activo = true;
    this.touch();
  }
}
