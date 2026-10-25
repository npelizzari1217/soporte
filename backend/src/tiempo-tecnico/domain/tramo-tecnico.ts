/**
 * Reglas de dominio de los tramos del técnico (odd/tasks/tiempo-tecnico.md, T3, S4-S7, diseño L9).
 *
 * Un tramo es el período en que un técnico tuvo un ticket. Este archivo decide cuándo se abre y
 * cuándo se cierra (`planificarTramo`), cuánto tiempo hábil cuenta (`medirSegundosHabiles`) y si
 * cumplió la meta (`evaluarCumplido`). Dominio puro: sin Prisma, sin NestJS, sin reloj propio.
 */
import { ESTADOS_RELOJ_CORRE } from '../../tickets/domain/state-machine/estados.constants';

/**
 * Causas de cierre de un tramo. Fuente única: la unión `MotivoFinTramo` se deriva de acá y el
 * CHECK `tramos_tecnico_ticket_motivo_fin_check` de la base enumera los mismos valores (un spec de
 * integración los compara contra `pg_get_constraintdef`).
 */
export const MOTIVOS_FIN_TRAMO = [
  'REASIGNADO',
  'DESASIGNADO',
  'RESUELTO',
  'CERRADO',
  'CANCELADO',
] as const;

/** Causa de cierre de un tramo. Derivado de `MOTIVOS_FIN_TRAMO`. */
export type MotivoFinTramo = (typeof MOTIVOS_FIN_TRAMO)[number];

const MOTIVOS: ReadonlySet<string> = new Set(MOTIVOS_FIN_TRAMO);

/**
 * Valida un motivo leído de la base.
 *
 * @param valor Texto de `motivo_fin`.
 * @returns `true` si es uno de `MOTIVOS_FIN_TRAMO`.
 */
export function esMotivoFinTramo(valor: string): valor is MotivoFinTramo {
  return MOTIVOS.has(valor);
}

/**
 * Estados del ticket que cierran el tramo abierto: el ticket deja de estar en manos del técnico.
 * Cada uno es también el motivo de cierre (S5: el tramo llega hasta RESUELTO).
 */
export const ESTADOS_QUE_CIERRAN_TRAMO = [
  'RESUELTO',
  'CERRADO',
  'CANCELADO',
] as const satisfies readonly MotivoFinTramo[];

type EstadoQueCierraTramo = (typeof ESTADOS_QUE_CIERRAN_TRAMO)[number];

const ESTADOS_CIERRE: ReadonlySet<string> = new Set(ESTADOS_QUE_CIERRAN_TRAMO);

function cierraTramo(estadoCodigo: string): estadoCodigo is EstadoQueCierraTramo {
  return ESTADOS_CIERRE.has(estadoCodigo);
}

/** Responsable y estado de un ticket, en el momento que interese (antes o después de guardarlo). */
export interface SituacionTicketTramo {
  readonly asignadoId: string | null;
  readonly estadoCodigo: string;
}

/** Tramo abierto de un ticket, con lo que hace falta para cerrarlo. */
export interface TramoAbierto {
  readonly id: string;
  readonly tecnicoId: string;
  readonly inicioAt: Date;
}

/** Qué hacer con los tramos de un ticket después de guardarlo. */
export interface PlanTramo {
  /** Tramo abierto que se cierra, con su motivo; `null` si ninguno. */
  readonly cerrar: { readonly tramo: TramoAbierto; readonly motivo: MotivoFinTramo } | null;
  /**
   * Tramo que se abre; `null` si ninguno. Con `cerrarAlAbrir` el ticket llegó a un estado que
   * cierra en el mismo guardado que lo asignó (por ejemplo, completar la última tarea de un ticket
   * NUEVO sin responsable): el tramo se abre y se cierra en el mismo instante, con 0 segundos.
   */
  readonly abrir: {
    readonly tecnicoId: string;
    readonly cerrarAlAbrir: MotivoFinTramo | null;
  } | null;
}

/**
 * Decide qué tramos abrir y cerrar al guardar un ticket (L9).
 *
 * Cierra el tramo abierto si cambió el asignado (`REASIGNADO`, o `DESASIGNADO` si quedó sin
 * responsable) o si el ticket llegó a RESUELTO, CERRADO o CANCELADO (el motivo es ese estado).
 *
 * Abre un tramo para el asignado solo si el guardado lo PRODUJO: el ticket es nuevo, cambió de
 * asignado, o se reabrió desde un estado que cierra. Un ticket que ya tenía responsable desde
 * antes del deploy no abre tramo con cualquier guardado (por ejemplo, editar el título): no se
 * sabe desde cuándo lo tiene, y el tramo mediría de menos. Por eso no hay backfill.
 *
 * @param previo Situación anterior al guardado; `null` si el ticket es nuevo.
 * @param actual Situación ya guardada.
 * @param abierto Tramo abierto del ticket antes del guardado, o `null`.
 * @returns El plan; con los dos campos en `null` no hay nada que escribir.
 */
export function planificarTramo(
  previo: SituacionTicketTramo | null,
  actual: SituacionTicketTramo,
  abierto: TramoAbierto | null,
): PlanTramo {
  let cerrar: PlanTramo['cerrar'] = null;
  if (abierto !== null) {
    if (abierto.tecnicoId !== actual.asignadoId) {
      cerrar = {
        tramo: abierto,
        motivo: actual.asignadoId === null ? 'DESASIGNADO' : 'REASIGNADO',
      };
    } else if (cierraTramo(actual.estadoCodigo)) {
      cerrar = { tramo: abierto, motivo: actual.estadoCodigo };
    }
  }

  const sigueAbierto = abierto !== null && cerrar === null;
  if (actual.asignadoId === null || sigueAbierto) {
    return { cerrar, abrir: null };
  }

  const cambioAsignado = previo === null || previo.asignadoId !== actual.asignadoId;
  const veniaCerrado = previo !== null && cierraTramo(previo.estadoCodigo);
  if (!cierraTramo(actual.estadoCodigo)) {
    const abre = cambioAsignado || veniaCerrado;
    return { cerrar, abrir: abre ? { tecnicoId: actual.asignadoId, cerrarAlAbrir: null } : null };
  }
  // Llegó a un estado que cierra en este mismo guardado y con un asignado nuevo. Asignar a otro un
  // ticket que YA estaba resuelto no abre nada: ese técnico no lo resolvió.
  const abre = cambioAsignado && !veniaCerrado;
  return {
    cerrar,
    abrir: abre ? { tecnicoId: actual.asignadoId, cerrarAlAbrir: actual.estadoCodigo } : null,
  };
}

/** Un cambio de estado del timeline (`CAMBIO_ESTADO`): a qué estado pasó el ticket y cuándo. */
export interface CambioEstadoTramo {
  readonly at: Date;
  readonly estadoCodigo: string;
}

/** Tiempo hábil entre dos instantes, en milisegundos, en el horario de quien se mide. */
export type MsHabilesEntre = (desde: Date, hasta: Date) => number;

/**
 * Segundos hábiles de un tramo (S5-S7): de `inicio` a `fin`, sumando solo los intervalos en que
 * el reloj del SLA corre (`ESTADOS_RELOJ_CORRE`: NUEVO, ASIGNADO, EN_PROCESO). Esperando cliente
 * pausa (S7).
 *
 * El estado al inicio es el del último cambio con `at <= inicio`; sin ninguno, el ticket está en
 * su estado de alta (NUEVO o ASIGNADO), que corre. Los cambios posteriores a `fin` se ignoran.
 *
 * @param inicio Apertura del tramo.
 * @param fin Cierre del tramo; si no es posterior a `inicio`, el tramo mide 0.
 * @param cambios Cambios de estado del ticket, en cualquier orden.
 * @param msHabiles Medición hábil en el horario del técnico, con los feriados.
 * @returns Segundos hábiles, redondeados.
 */
export function medirSegundosHabiles(
  inicio: Date,
  fin: Date,
  cambios: readonly CambioEstadoTramo[],
  msHabiles: MsHabilesEntre,
): number {
  if (fin.getTime() <= inicio.getTime()) return 0;

  const ordenados = [...cambios].sort((a, b) => a.at.getTime() - b.at.getTime());
  let estado: string | null = null;
  let cursor = inicio;
  let totalMs = 0;
  for (const cambio of ordenados) {
    if (cambio.at.getTime() <= inicio.getTime()) {
      estado = cambio.estadoCodigo;
      continue;
    }
    if (cambio.at.getTime() >= fin.getTime()) break;
    if (corre(estado)) totalMs += msHabiles(cursor, cambio.at);
    cursor = cambio.at;
    estado = cambio.estadoCodigo;
  }
  if (corre(estado)) totalMs += msHabiles(cursor, fin);
  return Math.round(totalMs / 1000);
}

function corre(estado: string | null): boolean {
  return estado === null || ESTADOS_RELOJ_CORRE.has(estado);
}

/**
 * Veredicto del tramo (S4, S6): solo el que cierra en RESUELTO se evalúa, y solo si hay meta y
 * medición. Espeja el CHECK `tramos_tecnico_ticket_cumplido_check`.
 *
 * @param motivo Motivo de cierre del tramo.
 * @param habilS Segundos hábiles medidos, o `null` si la medición falló.
 * @param metaS Meta de SLA del ticket al cerrar, o `null` si no tiene.
 * @returns `habilS <= metaS`, o `null` si el tramo no se evalúa.
 */
export function evaluarCumplido(
  motivo: MotivoFinTramo,
  habilS: number | null,
  metaS: number | null,
): boolean | null {
  if (motivo !== 'RESUELTO' || habilS === null || metaS === null) return null;
  return habilS <= metaS;
}
