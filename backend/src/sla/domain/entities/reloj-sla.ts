/**
 * RelojSla — pliegue puro del reloj de SLA de resolución por tiempo activo
 * (sdd/sla-primera-respuesta-y-pausa, ADR-1, ADR-3, ADR-4). Sin Prisma ni Nest.
 *
 * Recibe la fila del reloj y las transiciones `CAMBIO_ESTADO` posteriores al
 * cursor (ordenadas por `sla_reloj_seq`), y devuelve el estado nuevo. Reglas:
 * - Si el reloj corre lo decide siempre el estado (`ESTADOS_RELOJ_CORRE`), nunca `correDesde`.
 * - `acumuladoS === null` es la ÚNICA prueba de ticket previo: se incorpora con
 *   `acumulado = 0`, `correDesde = createdAt` y `meta = entre(createdAt, slaVenceAt)`.
 * - El tiempo de cada transición se recorta a monótono: `t_i = max(created_at_i, t_{i-1}, corre_desde)`.
 * - Cada tramo se redondea a segundos con `Math.round(ms / 1000)`.
 */
import { ESTADOS_RELOJ_CORRE } from '../../../tickets/domain/state-machine/estados.constants';
import { CalcularSlaHabilVenceService } from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import type {
  CalendarioLaboralSemanal,
  FeriadosLaborales,
} from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { MedidorCorrido } from '../services/medidor-corrido';
import { MedidorHabil } from '../services/medidor-habil';
import type { MedidorTiempoSla } from '../services/medidor-tiempo-sla';

/** Fila del reloj tal como la lee el repositorio. */
export interface RelojSlaFila {
  readonly ticketId: string;
  readonly estadoCodigo: string;
  readonly slaRegla: string;
  readonly createdAt: Date;
  readonly slaVenceAt: Date | null;
  readonly acumuladoS: number | null;
  readonly metaS: number | null;
  readonly correDesde: Date | null;
  readonly seqHasta: number;
  readonly version: number;
  readonly cumplido: boolean | null;
}

/** Una operación `CAMBIO_ESTADO` a plegar. */
export interface TransicionReloj {
  readonly createdAt: Date;
  readonly estadoAnteriorCodigo: string | null;
  readonly estadoNuevoCodigo: string;
}

/** Estado nuevo del reloj. `slaVenceAt` es `undefined` cuando el pliegue no lo reescribe. */
export interface RelojSlaResultado {
  readonly acumuladoS: number;
  readonly metaS: number | null;
  readonly correDesde: Date | null;
  readonly cumplido: boolean | null;
  readonly slaVenceAt?: Date | null;
}

export interface PlegarParams {
  readonly fila: RelojSlaFila;
  readonly medidor: MedidorTiempoSla;
  /** Historial sin secuencia: solo se usa al incorporar un previo; se pliega antes que `transiciones`. */
  readonly historialSinSecuencia: readonly TransicionReloj[];
  readonly transiciones: readonly TransicionReloj[];
}

const segundos = (ms: number): number => Math.round(ms / 1000);

export class RelojSla {
  /** Elige el medidor por cohorte: `CORRIDO` mide tiempo de pared, el resto tiempo hábil. */
  static medidorPara(
    slaRegla: string,
    calculo: CalcularSlaHabilVenceService,
    calendario: CalendarioLaboralSemanal,
    feriados: FeriadosLaborales,
  ): MedidorTiempoSla {
    return slaRegla === 'CORRIDO'
      ? new MedidorCorrido()
      : new MedidorHabil(calculo, calendario, feriados);
  }

  static plegar({
    fila,
    medidor,
    historialSinSecuencia,
    transiciones,
  }: PlegarParams): RelojSlaResultado {
    const previo = fila.acumuladoS === null;
    let acumuladoS = fila.acumuladoS ?? 0;
    let correDesde: Date | null = previo ? fila.createdAt : fila.correDesde;
    let metaS = fila.metaS;
    if (previo) {
      const meta = fila.slaVenceAt ? segundos(medidor.entre(fila.createdAt, fila.slaVenceAt)) : 0;
      metaS = meta > 0 ? meta : null;
    }
    let cumplido = fila.cumplido;
    let corre = correDesde !== null;
    let reanudo = false;
    let tPrev: Date | null = correDesde;

    const ops = previo ? [...historialSinSecuencia, ...transiciones] : transiciones;
    for (const op of ops) {
      let t = op.createdAt;
      if (tPrev && tPrev > t) t = tPrev;
      if (correDesde && correDesde > t) t = correDesde;
      tPrev = t;

      const correNuevo = ESTADOS_RELOJ_CORRE.has(op.estadoNuevoCodigo);
      if (corre && !correNuevo && correDesde) {
        acumuladoS += segundos(medidor.entre(correDesde, t));
        correDesde = null;
      } else if (!corre && correNuevo) {
        correDesde = t;
        reanudo = true;
      }
      corre = correNuevo;

      if (op.estadoNuevoCodigo === 'RESUELTO') {
        cumplido = metaS === null ? null : acumuladoS <= metaS;
      } else if (correNuevo && op.estadoAnteriorCodigo === 'RESUELTO') {
        cumplido = null;
      }
    }

    // El estado actual del ticket manda sobre lo que dejó el pliegue (ADR-1).
    const correActual = ESTADOS_RELOJ_CORRE.has(fila.estadoCodigo);
    if (!correActual && correDesde) {
      acumuladoS += segundos(medidor.entre(correDesde, tPrev ?? correDesde));
      correDesde = null;
    } else if (correActual && !correDesde) {
      correDesde = tPrev ?? fila.createdAt;
    }

    const resultado: RelojSlaResultado = { acumuladoS, metaS, correDesde, cumplido };
    if (!(correActual && reanudo && metaS !== null && correDesde)) return resultado;

    // Vencimiento derivado (ADR-4): lo que falta desde el inicio del tramo, o el exceso ya consumido.
    const restanteS = metaS - acumuladoS;
    const slaVenceAt =
      restanteS > 0
        ? medidor.sumar(correDesde, restanteS * 1000)
        : fila.slaVenceAt && fila.slaVenceAt < correDesde
          ? fila.slaVenceAt
          : correDesde;
    return { ...resultado, slaVenceAt };
  }
}
