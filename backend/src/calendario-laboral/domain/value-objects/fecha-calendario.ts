import { Result } from '../../../shared/domain/result';
import { FechaCalendarioInvalidaError } from '../errors/feriados.errors';
import { FECHA_CALENDARIO_REGEX } from '../feriados.constants';

/**
 * FechaCalendario — VO de una fecha de calendario real, `'YYYY-MM-DD'`.
 * La usan tanto el feriado global como el de cliente (WU1, foundation).
 *
 * Auto-validante: el regex solo NO alcanza — `2026-02-30` lo pasa igual —,
 * así que `crear()` arma la fecha con `Date.UTC` y verifica que los
 * componentes leídos coincidan con los recibidos. Un mes/día fuera de rango
 * hace que `Date.UTC` "ruede" en silencio; esa desviación delata la fecha inexistente.
 */
export class FechaCalendario {
  private constructor(private readonly _clave: string) {}

  /**
   * Construye una `FechaCalendario` validada. `Result.fail(FechaCalendarioInvalidaError)`
   * si `iso` no matchea `'YYYY-MM-DD'` o no es una fecha real.
   */
  static crear(iso: string): Result<FechaCalendario, FechaCalendarioInvalidaError> {
    if (typeof iso !== 'string' || !FECHA_CALENDARIO_REGEX.test(iso)) {
      return Result.fail(new FechaCalendarioInvalidaError(iso));
    }

    const [anioStr, mesStr, diaStr] = iso.split('-');
    const anio = Number(anioStr);
    const mes = Number(mesStr);
    const dia = Number(diaStr);
    const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));

    const esFechaCalendarioReal =
      fechaUtc.getUTCFullYear() === anio &&
      fechaUtc.getUTCMonth() === mes - 1 &&
      fechaUtc.getUTCDate() === dia;

    if (!esFechaCalendarioReal) {
      return Result.fail(new FechaCalendarioInvalidaError(iso));
    }

    return Result.ok(new FechaCalendario(iso));
  }

  /** Clave `'YYYY-MM-DD'`, la representación canónica de esta fecha. */
  aClave(): string {
    return this._clave;
  }

  /**
   * Medianoche UTC del día calendario, para escribir en una columna
   * `@db.Date` (`Feriado.fecha` / `FeriadoCliente.fecha`, WU3). NUNCA
   * aplicarle `desplazarAArgentina` — ver la trampa documentada en
   * `prisma-calendario-laboral.mapper.ts` (D2).
   */
  aDateUtc(): Date {
    return new Date(`${this._clave}T00:00:00.000Z`);
  }

  /** Comparación por valor. */
  equals(otra: FechaCalendario): boolean {
    return this._clave === otra._clave;
  }
}
