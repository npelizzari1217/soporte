import {
  CalcularSlaHabilVenceService,
  CalendarioLaboralSemanal,
  FeriadosLaborales,
} from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { MedidorTiempoSla } from './medidor-tiempo-sla';

/**
 * MedidorHabil — mide y suma tiempo HÁBIL con el calendario laboral y los
 * feriados vigentes que recibe al construirse (D11: se usa el vigente al
 * plegar, no el de cuando ocurrió cada tramo).
 */
export class MedidorHabil implements MedidorTiempoSla {
  constructor(
    private readonly calculo: CalcularSlaHabilVenceService,
    private readonly calendario: CalendarioLaboralSemanal,
    private readonly feriados: FeriadosLaborales,
  ) {}

  entre(a: Date, b: Date): number {
    return this.calculo.msHabilesEntre(a, b, this.calendario, this.feriados);
  }

  sumar(a: Date, ms: number): Date {
    return this.calculo.sumarMsHabiles(a, ms, this.calendario, this.feriados);
  }
}
