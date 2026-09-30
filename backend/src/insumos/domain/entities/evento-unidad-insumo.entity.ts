import { BaseEntity } from '../../../shared/domain/base-entity';
import { normalizarMotivoMovimiento } from './movimiento-insumo.entity';
import { TipoEventoUnidad } from './unidad-insumo.entity';

/**
 * EventoUnidadInsumoProps — un asiento de la bitácora de una unidad
 * (`eventos_unidad_insumo`, ADR-9).
 */
export interface EventoUnidadInsumoProps {
  unidadId: string;
  tipo: TipoEventoUnidad;
  /** Movimiento que originó el evento (un movimiento origina a lo sumo uno). No se copian su cantidad ni su condición. */
  movimientoId: string | null;
  equipoId: string | null;
  /**
   * Componente involucrado. Sin FK a propósito: la instalación escribe el
   * evento antes que el componente (orden de locks, ADR-12), con el id que
   * `BaseEntity` ya generó en memoria. Lo llevan `INSTALACION`,
   * `ALTA_INSTALADA`, `RETIRO_A_DEPOSITO`, `DESCARTE` y `REACTIVACION`.
   */
  componenteId: string | null;
  serialAnterior: string | null;
  serialNuevo: string | null;
  /** Ya normalizado; `null` si el evento no lleva motivo. Obligatorio en la corrección de serial. */
  motivo: string | null;
  /** Soft ref → `master.usuarios.id` (la columna es NOT NULL). */
  usuarioId: string;
}

/** Props que acepta `create()`: los opcionales pueden faltar y el motivo llega crudo. */
export type CrearEventoUnidadInsumoProps = Pick<
  EventoUnidadInsumoProps,
  'unidadId' | 'tipo' | 'usuarioId'
> &
  Partial<Omit<EventoUnidadInsumoProps, 'unidadId' | 'tipo' | 'usuarioId'>>;

/**
 * EventoUnidadInsumoEntity — asiento APPEND-ONLY de la historia de una unidad.
 *
 * No tiene mutadores de negocio, y el puerto solo tendrá `insert` y
 * `listarPorUnidad`. Extiende `BaseEntity` por el mismo motivo que
 * `MovimientoInsumoEntity`: el id UUIDv7 se genera antes del INSERT y da
 * desempate monótono entre eventos con el mismo `created_at`. `reconstitute()`
 * espeja `updatedAt` de `createdAt` porque la tabla no guarda esa columna.
 */
export class EventoUnidadInsumoEntity extends BaseEntity<EventoUnidadInsumoProps> {
  /**
   * Crea un evento nuevo.
   *
   * Va como `throw` y no como `Result` porque la corrección de serial sin
   * motivo es una violación de contrato: quien llama
   * (`OperacionesUnidadInsumo`) ya la rechazó con un error de dominio antes de
   * escribir; esto es el backstop.
   *
   * @param props Campos del evento; el motivo llega crudo.
   * @param id Id explícito; si se omite lo genera `BaseEntity`. La instalación lo usa para fijar el `componenteId` de otros eventos.
   * @returns El evento creado, con el motivo normalizado.
   * @throws Error si es una `CORRECCION_SERIAL` sin motivo con contenido.
   */
  static create(props: CrearEventoUnidadInsumoProps, id?: string): EventoUnidadInsumoEntity {
    const motivo = normalizarMotivoMovimiento(props.motivo);
    if (props.tipo === 'CORRECCION_SERIAL' && motivo === null) {
      throw new Error('EventoUnidadInsumoEntity: CORRECCION_SERIAL exige un motivo con contenido.');
    }
    return new EventoUnidadInsumoEntity(
      {
        unidadId: props.unidadId,
        tipo: props.tipo,
        movimientoId: props.movimientoId ?? null,
        equipoId: props.equipoId ?? null,
        componenteId: props.componenteId ?? null,
        serialAnterior: props.serialAnterior ?? null,
        serialNuevo: props.serialNuevo ?? null,
        motivo,
        usuarioId: props.usuarioId,
      },
      id,
    );
  }

  /**
   * Rehidrata un evento desde persistencia. NO valida: la fila ya existe.
   *
   * @param props Campos leídos de la base.
   * @param id Id persistido.
   * @param createdAt Momento en que se asentó el evento.
   * @returns La entidad reconstituida.
   */
  static reconstitute(
    props: EventoUnidadInsumoProps,
    id: string,
    createdAt: Date,
  ): EventoUnidadInsumoEntity {
    const entity = new EventoUnidadInsumoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: createdAt });
    entity._deletedAt = null;
    return entity;
  }

  get unidadId(): string {
    return this.props.unidadId;
  }

  get tipo(): TipoEventoUnidad {
    return this.props.tipo;
  }

  get movimientoId(): string | null {
    return this.props.movimientoId;
  }

  get equipoId(): string | null {
    return this.props.equipoId;
  }

  get componenteId(): string | null {
    return this.props.componenteId;
  }

  get serialAnterior(): string | null {
    return this.props.serialAnterior;
  }

  get serialNuevo(): string | null {
    return this.props.serialNuevo;
  }

  get motivo(): string | null {
    return this.props.motivo;
  }

  get usuarioId(): string {
    return this.props.usuarioId;
  }
}
