import { medianocheArgentina } from '../../shared/domain/zona-horaria-argentina';

/** Una fecha sola, sin hora: lo que manda un `<input type="date">`. */
const FECHA_SOLA = /^\d{4}-\d{2}-\d{2}$/;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Borde inferior del filtro `fechaDesde` del listado de tickets (odd/autor-y-filtro-fechas, S2).
 *
 * Una fecha sola es un día argentino: empieza a las 00:00 ART, no a la medianoche UTC (que
 * dejaría afuera lo creado entre las 21:00 y las 23:59 ART del día anterior y metería lo de ese
 * día). Un instante ISO completo se respeta tal cual, como antes.
 *
 * @param valor Valor de la query, ya validado como fecha ISO.
 * @returns El instante desde el que se cuenta, o `undefined` sin filtro.
 */
export function instanteDesde(valor: string | undefined): Date | undefined {
  if (valor === undefined) return undefined;
  return FECHA_SOLA.test(valor) ? medianocheArgentina(new Date(valor)) : new Date(valor);
}

/**
 * Borde superior del filtro `fechaHasta`: con una fecha sola, incluye el día entero en Argentina
 * (hasta las 23:59:59.999 ART). Sin esto, «Hasta 31/12» cortaba a la medianoche UTC del 31 y
 * dejaba afuera casi todo ese día. Un instante ISO completo se respeta tal cual.
 *
 * @param valor Valor de la query, ya validado como fecha ISO.
 * @returns El último instante incluido (el repositorio compara con `<=`), o `undefined`.
 */
export function instanteHasta(valor: string | undefined): Date | undefined {
  if (valor === undefined) return undefined;
  if (!FECHA_SOLA.test(valor)) return new Date(valor);
  const diaSiguiente = new Date(new Date(valor).getTime() + UN_DIA_MS);
  return new Date(medianocheArgentina(diaSiguiente).getTime() - 1);
}
