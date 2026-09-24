import { BaseEntity } from '../../../shared/domain/base-entity';
import { FERIADO_DESCRIPCION_MAX_LENGTH } from '../feriados.constants';
import { FechaCalendario } from '../value-objects/fecha-calendario';

/**
 * Precondición de largo de `descripcion`. `throw`, no `Result`: el borde
 * (DTO, WU2) ya rechazó con 400 una descripción excedida, así que llegar
 * hasta acá es violación de contrato del caller (mismo criterio que
 * `tipos-componente/domain/entities/tipo-componente.entity.ts`). No se
 * aplica en `reconstitute()`: una fila existente se lee, no se revalida.
 */
function validarDescripcion(descripcion: string): void {
  if (descripcion.length > FERIADO_DESCRIPCION_MAX_LENGTH) {
    throw new Error(
      `FeriadoEntity: descripcion excede ${FERIADO_DESCRIPCION_MAX_LENGTH} caracteres.`,
    );
  }
}

/** Shape de las propiedades de un feriado (global o de cliente). Dominio puro. */
export interface FeriadoProps {
  fecha: FechaCalendario;
  descripcion: string;
}

/**
 * FeriadoEntity — feriado global (master `feriados`) O feriado de cliente
 * (tenant `feriados_cliente`, WU3a): mismo shape `{ fecha, descripcion }` y
 * mismo hard delete en las dos tablas (D1, sin `clienteId` ni soft-delete),
 * así que una sola entidad de dominio respalda a `IFeriadoGlobalRepository`
 * y `IFeriadoClienteRepository`. El repositorio de cada capa hace el DELETE
 * físico; sin `softDelete()`.
 */
export class FeriadoEntity extends BaseEntity<FeriadoProps> {
  private constructor(props: FeriadoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory para un feriado nuevo. `fecha` ya debe venir validada por
   * `FechaCalendario.crear()` — esta entidad no revalida el formato.
   */
  static crear(props: { fecha: FechaCalendario; descripcion: string }, id?: string): FeriadoEntity {
    validarDescripcion(props.descripcion);
    return new FeriadoEntity({ fecha: props.fecha, descripcion: props.descripcion }, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). Los
   * datos ya fueron validados al persistir — no re-valida.
   */
  static reconstitute(
    props: FeriadoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): FeriadoEntity {
    const entity = new FeriadoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get fecha(): FechaCalendario {
    return this.props.fecha;
  }

  get descripcion(): string {
    return this.props.descripcion;
  }

  // ─── Comportamiento de dominio ───────────────────────────────────────────

  /** Edita fecha y descripción del feriado. */
  editar(props: { fecha: FechaCalendario; descripcion: string }): void {
    validarDescripcion(props.descripcion);
    this.props.fecha = props.fecha;
    this.props.descripcion = props.descripcion;
    this.touch();
  }
}
