import { MedidorTiempoSla } from './medidor-tiempo-sla';

/**
 * MedidorCorrido — tiempo de pared (24/7) para la cohorte `CORRIDO`: 48 h de
 * pared valen 48 h, sin calendario ni feriados.
 */
export class MedidorCorrido implements MedidorTiempoSla {
  entre(a: Date, b: Date): number {
    return Math.max(0, b.getTime() - a.getTime());
  }

  sumar(a: Date, ms: number): Date {
    return new Date(a.getTime() + ms);
  }
}
