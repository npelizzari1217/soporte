import { Result } from '../../../shared/domain/result';
import {
  CalendarioLaboralSemanal,
  VentanaLaboral,
} from '../services/calcular-sla-habil-vence.service';
import {
  DIAS_POR_SEMANA,
  MINUTOS_POR_DIA,
  MINUTO_MINIMO_DIA,
} from '../constants/horario-laboral.constants';
import {
  HorarioLaboralDiasInvalidosError,
  HorarioLaboralInvalidoError,
  HorarioLaboralSinDiasAbiertosError,
  VentanaLaboralInvalidaError,
} from '../errors/horario-laboral.errors';

/** Entrada cruda de un día de horario laboral, tal como la arma el caso de uso a partir del DTO. */
export interface DiaHorarioEntrada {
  readonly diaSemana: number;
  readonly aperturaMinuto: number | null;
  readonly cierreMinuto: number | null;
}

/**
 * HorarioLaboralSemanal — VO/agregado que valida el horario laboral completo
 * de un cliente (sdd/horario-laboral-por-cliente, D7 de `design.md`). Sin
 * identidad propia: hay un horario por tenant y se reemplaza entero (WU-5) —
 * mismo criterio que `FechaCalendario`.
 *
 * Reusa `VentanaLaboral`/`CalendarioLaboralSemanal` de
 * `calcular-sla-habil-vence.service.ts` sin tocarlos: `aCalendario()`
 * produce exactamente el tipo que ese servicio ya consume.
 */
export class HorarioLaboralSemanal {
  private constructor(private readonly _dias: CalendarioLaboralSemanal) {}

  /**
   * Construye un `HorarioLaboralSemanal` validado. Orden de validación fijo
   * (D7, `design.md`):
   * 1. `dias.length === 7`.
   * 2. Cada `diaSemana` es un entero en `0..6`, sin repetir (cubre
   *    exactamente ese rango una vez cada uno).
   * 3. Por día: ambos extremos `null` (cerrado), o ambos enteros con
   *    `0 <= aperturaMinuto < cierreMinuto <= 1440`.
   * 4. Al menos un día queda abierto.
   */
  static crear(
    dias: readonly DiaHorarioEntrada[],
  ): Result<HorarioLaboralSemanal, HorarioLaboralInvalidoError> {
    if (dias.length !== DIAS_POR_SEMANA) {
      return Result.fail(
        new HorarioLaboralDiasInvalidosError(`Se recibieron ${dias.length} días.`),
      );
    }

    const diasVistos = new Set<number>();
    for (const dia of dias) {
      if (!Number.isInteger(dia.diaSemana) || dia.diaSemana < 0 || dia.diaSemana > 6) {
        return Result.fail(
          new HorarioLaboralDiasInvalidosError(
            `"${dia.diaSemana}" no es un día de semana válido (debe ser un entero entre 0 y 6).`,
          ),
        );
      }
      if (diasVistos.has(dia.diaSemana)) {
        return Result.fail(
          new HorarioLaboralDiasInvalidosError(`El día ${dia.diaSemana} está repetido.`),
        );
      }
      diasVistos.add(dia.diaSemana);
    }

    const porDia = new Map<number, DiaHorarioEntrada>();
    for (const dia of dias) {
      porDia.set(dia.diaSemana, dia);

      const { aperturaMinuto, cierreMinuto } = dia;
      const ambosCerrados = aperturaMinuto === null && cierreMinuto === null;
      const ventanaValida =
        aperturaMinuto !== null &&
        cierreMinuto !== null &&
        Number.isInteger(aperturaMinuto) &&
        Number.isInteger(cierreMinuto) &&
        aperturaMinuto >= MINUTO_MINIMO_DIA &&
        cierreMinuto <= MINUTOS_POR_DIA &&
        aperturaMinuto < cierreMinuto;

      if (!ambosCerrados && !ventanaValida) {
        return Result.fail(new VentanaLaboralInvalidaError(dia.diaSemana));
      }
    }

    const hayAlMenosUnDiaAbierto = dias.some((dia) => dia.aperturaMinuto !== null);
    if (!hayAlMenosUnDiaAbierto) {
      return Result.fail(new HorarioLaboralSinDiasAbiertosError());
    }

    // `diasVistos` cubrió exactamente 0..6 sin repetir (validado arriba), así
    // que `porDia.get(n)` está garantizado para cada `n` de 0 a 6.
    const obtenerVentana = (diaSemana: number): VentanaLaboral => {
      const dia = porDia.get(diaSemana) as DiaHorarioEntrada;
      return { aperturaMinuto: dia.aperturaMinuto, cierreMinuto: dia.cierreMinuto };
    };

    const calendario: CalendarioLaboralSemanal = [
      obtenerVentana(0),
      obtenerVentana(1),
      obtenerVentana(2),
      obtenerVentana(3),
      obtenerVentana(4),
      obtenerVentana(5),
      obtenerVentana(6),
    ];

    return Result.ok(new HorarioLaboralSemanal(calendario));
  }

  /**
   * Tupla de 7 ventanas indexada por `diaSemana` (0 = domingo … 6 = sábado),
   * lista para `CalcularSlaHabilVenceService.venceAt()`.
   */
  aCalendario(): CalendarioLaboralSemanal {
    return this._dias;
  }
}
