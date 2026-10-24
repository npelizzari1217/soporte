/**
 * dia-calendario.ts — formato de un DÍA CALENDARIO (columna `@db.Date`) para mostrarlo a una
 * persona, sin pasar por ninguna zona horaria.
 *
 * Prisma devuelve un `@db.Date` como la medianoche UTC del día que guarda: no es un instante.
 * Leerlo con la zona de Argentina lo corre a las 21:00 del día ANTERIOR, así que acá se leen los
 * componentes UTC crudos (mismo criterio que `fechaCsv` de las exportaciones). Para el día
 * argentino de un instante real (`timestamptz`) corresponde `desplazarAArgentina`.
 */

/**
 * Formatea un día calendario como `dd/mm/aaaa`.
 *
 * @param fecha Día calendario (típicamente una columna `@db.Date`, medianoche UTC).
 * @returns El día en formato `dd/mm/aaaa`.
 */
export function formatearDiaCalendario(fecha: Date): string {
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getUTCFullYear()}`;
}
