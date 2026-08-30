/**
 * Formato numérico es-AR de TODA la app: miles con punto, decimales con coma,
 * SIEMPRE 2 decimales (`1.234.567,89`).
 *
 * Nació en Compras, donde `formatearTotalesPorMoneda` y el detalle de ítems
 * repetían el mismo `toLocaleString`. Vive acá —y no en `features/compras`—
 * porque Equipos también muestra y edita importes: un único formato de plata
 * en la app es lo que evita que cada módulo reinvente su variante.
 *
 * Incluye la inversa (`parsearNumeroEsAr`), que `MontoInput` necesita para
 * volver de la cadena formateada al número crudo que consume el schema.
 */

const OPCIONES_ES_AR: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

/** `1234567.89` → `"1.234.567,89"`. Presentación pura: no valida ni redondea reglas de negocio. */
export function formatearNumeroEsAr(valor: number): string {
  return valor.toLocaleString("es-AR", OPCIONES_ES_AR);
}

/** `("ARS", 1234.5)` → `"ARS 1.234,50"`. Único formato de monto de la app. */
export function formatearMontoConMoneda(moneda: string, monto: number): string {
  return `${moneda} ${formatearNumeroEsAr(monto)}`;
}

/**
 * Adelanta el `@IsNumber({ maxDecimalPlaces: 2 })` del backend: sin esto el
 * usuario se entera del problema recién al enviar, con un 400.
 *
 * NO es un espejo exacto, y la diferencia es deliberada. Para la escala de dos
 * decimales el criterio coincide; para la notación exponencial esta función es
 * MÁS ESTRICTA que el backend, en las dos direcciones y por buenas razones:
 * `1e21` allá pasa (`1e21 % 1 === 0` → cero decimales) y acá se rechaza; y
 * `1e-7` allá ni siquiera llega a validar — `"1e-7".split(".")[1]` es
 * `undefined` y leerle `.length` tira un TypeError, o sea 500 en vez de 400.
 * Rechazar exponenciales acá es protección, no espejo. Ningún monto ni
 * cantidad real las usa.
 *
 * Recibe el número YA PARSEADO, no la cadena cruda: `"1000,50"` tiene una coma
 * donde este chequeo espera un punto.
 *
 * Cuenta decimales sobre la representación en texto y NO con aritmética
 * (`n * 100`): la app ya se tropezó una vez con el sesgo del punto flotante, y
 * `0.1 * 100` no da exactamente `10`.
 *
 * Vive acá y no en el schema de una feature porque es un predicado puro sin
 * acoplamiento a ninguna. Es la ÚNICA definición: la usan `features/equipos`
 * y `features/compras`, que hasta el 2026-08-30 mantenían cada uno su copia
 * local.
 *
 * La duplicación es deuda vieja, anterior a este archivo: ambas copias ya
 * convivían y la de Equipos había perdido el guard de `Number.isFinite` que
 * la de Compras sí tiene. Era inofensivo ahí porque el llamador filtraba
 * antes, pero es exactamente la deriva que justifica tener una sola versión.
 */
export function conDosDecimales(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  const texto = String(n);
  if (texto.includes("e") || texto.includes("E")) return false;
  const punto = texto.indexOf(".");
  return punto === -1 || texto.length - punto - 1 <= 2;
}

/**
 * Inversa de `formatearNumeroEsAr`, tolerante al valor CRUDO que se tipea en
 * el input (`"1234567.89"`) además de la cadena formateada
 * (`"1.234.567,89"`). Devuelve `null` cuando no hay número —  cadena vacía,
 * espacios o texto no numérico— para que quien la use decida qué mostrar en
 * vez de recibir un `NaN` o un `0` fantasma.
 *
 * Regla de desambiguación del punto: sólo se lo trata como separador de
 * miles cuando ADEMÁS hay una coma decimal. Sin coma, `"1234.5"` es el valor
 * crudo que el usuario está tipeando y el punto es decimal. `formatear`
 * nunca emite miles sin decimales (siempre agrega `,00`), así que el caso
 * ambiguo `"1.234"` no proviene de esta librería.
 */
export function parsearNumeroEsAr(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;

  const normalizado = limpio.includes(",") ? limpio.replaceAll(".", "").replace(",", ".") : limpio;

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}
