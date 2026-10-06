/**
 * Estado SLA derivado (sdd/sla-primera-respuesta-y-pausa, ADR-8). Funciones puras: lo que se muestra
 * se deriva del reloj y del cumplimiento, no de la marca `vencido` del barrido (que queda como
 * deduplicador del mail). Dominio puro, sin imports de Prisma ni NestJS.
 */
import { ESTADOS_RELOJ_CORRE } from '../state-machine/estados.constants';

export type EstadoSlaDerivado = 'SIN_SLA' | 'AL_DIA' | 'EN_PAUSA' | 'VENCIDO';

export type EstadoPrimeraRespuestaDerivado = 'SIN_META' | 'PENDIENTE' | 'CUMPLIDA' | 'VENCIDA';

export interface EntradaEstadoSla {
  readonly slaVenceAt: Date | null;
  readonly fechaCierre: Date | null;
  /** `null` mientras el reloj corre, en tickets previos sin incorporar y en los preventivos. */
  readonly cumplido: boolean | null;
}

export interface EntradaPrimeraRespuesta {
  readonly venceAt: Date | null;
  readonly at: Date | null;
}

const ESTADO_ESPERA = 'ESPERANDO_CLIENTE';

/**
 * - sin vencimiento (preventivo o sin SLA): `SIN_SLA`;
 * - ESPERANDO_CLIENTE: `EN_PAUSA` (el vencimiento guardado no es vigente);
 * - reloj corriendo (por `ESTADOS_RELOJ_CORRE`, nunca por `sla_corre_desde`): `VENCIDO` si
 *   `slaVenceAt < ahora`, si no `AL_DIA`;
 * - resuelto o cerrado: `VENCIDO` si `cumplido === false`; en un previo sin cumplimiento,
 *   `fechaCierre > slaVenceAt`.
 */
export function derivarEstadoSla(
  entrada: EntradaEstadoSla,
  estadoCodigo: string,
  ahora: Date,
): EstadoSlaDerivado {
  const { slaVenceAt, fechaCierre, cumplido } = entrada;
  if (slaVenceAt === null) {
    return 'SIN_SLA';
  }
  if (estadoCodigo === ESTADO_ESPERA) {
    return 'EN_PAUSA';
  }
  if (ESTADOS_RELOJ_CORRE.has(estadoCodigo)) {
    return slaVenceAt.getTime() < ahora.getTime() ? 'VENCIDO' : 'AL_DIA';
  }
  if (cumplido === false) {
    return 'VENCIDO';
  }
  if (cumplido === null && fechaCierre !== null && fechaCierre.getTime() > slaVenceAt.getTime()) {
    return 'VENCIDO';
  }
  return 'AL_DIA';
}

/**
 * Sin `venceAt` (preventivo o prioridad sin meta): `SIN_META`. Sin respuesta: `VENCIDA` si ya pasó
 * el vencimiento, `PENDIENTE` si no. Con respuesta: `CUMPLIDA` si `at <= venceAt`; una respuesta
 * tardía cuenta como `VENCIDA`.
 */
export function derivarEstadoPrimeraRespuesta(
  entrada: EntradaPrimeraRespuesta,
  ahora: Date,
): EstadoPrimeraRespuestaDerivado {
  const { venceAt, at } = entrada;
  if (venceAt === null) {
    return 'SIN_META';
  }
  if (at === null) {
    return venceAt.getTime() < ahora.getTime() ? 'VENCIDA' : 'PENDIENTE';
  }
  return at.getTime() <= venceAt.getTime() ? 'CUMPLIDA' : 'VENCIDA';
}
