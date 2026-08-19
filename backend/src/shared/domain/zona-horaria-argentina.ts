/**
 * zona-horaria-argentina.ts — constante ÚNICA de offset horario del sistema.
 *
 * Existe en `shared/domain` (no en un módulo funcional) porque más de un
 * módulo necesita el mismo offset: la validación de fechas de etapa de
 * compras (`compras/domain/services/fecha-argentina.ts`) y el formateo de
 * timestamps de las exportaciones (`shared/infrastructure/csv/csv.ts`). Dos
 * copias del número `-3` en dos capas distintas es exactamente el tipo de
 * duplicación que sobrevive a un cambio de criterio y deja la mitad del
 * sistema en una zona horaria y la otra mitad en otra.
 *
 * Por qué alcanza una constante y no un modelo de zonas horarias: el sistema
 * ya asume Argentina en todo (CUIT, idioma, dominio), y Argentina no observa
 * horario de verano desde 2009 — el offset es fijo, sin DST que calcular.
 */

/** Offset horario de Argentina respecto de UTC, en milisegundos (UTC-3, fijo, sin DST). */
export const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;

/**
 * Desplaza un instante para que sus componentes UTC (`getUTCHours()`,
 * `getUTCDate()`, …) sean los que un observador en Argentina lee en ese
 * momento.
 *
 * **El resultado NO es el mismo instante**: es un `Date` deliberadamente
 * corrido cuya única finalidad es que leer sus componentes UTC devuelva la
 * hora local argentina. Sirve para FORMATEAR y para truncar al día local;
 * nunca para persistir ni para comparar contra otro instante real.
 *
 * Aplicar esto a una columna `@db.Date` es un ERROR y corre el día para
 * atrás: Prisma devuelve esas columnas como medianoche UTC del día
 * calendario, así que restarle 3 horas cae en las 21:00 del día ANTERIOR.
 * Para esas columnas hay que leer los componentes UTC crudos.
 *
 * @param instante Momento real (típicamente una columna `timestamptz`).
 */
export function desplazarAArgentina(instante: Date): Date {
  return new Date(instante.getTime() + OFFSET_ARGENTINA_MS);
}
