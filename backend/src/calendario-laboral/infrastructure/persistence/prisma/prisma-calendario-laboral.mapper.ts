/**
 * PrismaCalendarioLaboralMapper — convierte las filas Prisma de MASTER
 * (`CalendarioLaboralDia`, `Feriado`) a los tipos de dominio que
 * `CalcularSlaHabilVenceService` (WU-1) ya espera.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 *
 * TRAMPA DE `Feriado.fecha` (`@db.Date`): Prisma la devuelve como medianoche
 * UTC del día calendario. `toFeriados` lee los componentes UTC crudos
 * (`getUTCFullYear/getUTCMonth/getUTCDate`) — NUNCA `desplazarAArgentina`,
 * que restaría 3hs y correría el día para atrás. Ver
 * `prisma_master/schema.prisma:479-484` y `shared/domain/zona-horaria-argentina.ts`.
 */
import type { CalendarioLaboralDia, Feriado } from '.prisma/master';
import {
  CalendarioLaboralSemanal,
  FeriadosLaborales,
  VentanaLaboral,
} from '../../../domain/services/calcular-sla-habil-vence.service';

type FilaCalendarioLaboralDia = Pick<
  CalendarioLaboralDia,
  'diaSemana' | 'aperturaMinuto' | 'cierreMinuto'
>;
type FilaFeriado = Pick<Feriado, 'fecha'>;

export class PrismaCalendarioLaboralMapper {
  /**
   * Mapea las filas de `calendario_laboral_dias` a la tupla semanal.
   *
   * @throws Error si falta alguna fila 0..6 — un calendario incompleto nunca
   *               se completa en silencio con un valor por defecto.
   */
  static toCalendarioSemanal(filas: readonly FilaCalendarioLaboralDia[]): CalendarioLaboralSemanal {
    const porDia = new Map<number, VentanaLaboral>();
    for (const fila of filas) {
      porDia.set(fila.diaSemana, {
        aperturaMinuto: fila.aperturaMinuto,
        cierreMinuto: fila.cierreMinuto,
      });
    }

    const obtenerVentana = (diaSemana: number): VentanaLaboral => {
      const ventana = porDia.get(diaSemana);
      if (ventana === undefined) {
        throw new Error(
          `PrismaCalendarioLaboralMapper: falta en calendario_laboral_dias la fila del día de ` +
            `semana ${diaSemana} — un calendario incompleto no se completa en silencio.`,
        );
      }
      return ventana;
    };

    return [
      obtenerVentana(0),
      obtenerVentana(1),
      obtenerVentana(2),
      obtenerVentana(3),
      obtenerVentana(4),
      obtenerVentana(5),
      obtenerVentana(6),
    ];
  }

  /** Mapea las filas de `feriados` a claves de día LOCAL `'YYYY-MM-DD'`. */
  static toFeriados(filas: readonly FilaFeriado[]): FeriadosLaborales {
    const claves = new Set<string>();
    for (const fila of filas) {
      claves.add(this.claveDiaUtcDe(fila.fecha));
    }
    return claves;
  }

  /**
   * Clave `'YYYY-MM-DD'` a partir de los componentes UTC crudos de la
   * medianoche que Prisma devuelve para una columna `@db.Date`.
   */
  private static claveDiaUtcDe(fecha: Date): string {
    const anio = String(fecha.getUTCFullYear()).padStart(4, '0');
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getUTCDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }
}
