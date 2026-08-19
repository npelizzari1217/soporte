/**
 * fecha-argentina.ts — constante ÚNICA de zona horaria para las tres fechas
 * de etapa (`compras-tres-etapas-y-sectores`, R5/S53).
 *
 * **Resolución que manda sobre ADR-T4** (`resoluciones-pre-apply`): la spec
 * (S53) exige rechazar CUALQUIER fecha posterior a hoy. Validar contra
 * `hoyUTC()` es permisivo por un día entre las 21:00 y las 24:00 de
 * Argentina (UTC-3) — a esa hora UTC ya está en D+1, así que "hoy" en UTC
 * adelanta al día local. Eso era un artefacto técnico de comparar contra
 * UTC, no una decisión de producto: por eso acá se valida contra la fecha
 * LOCAL de Argentina, no contra UTC.
 *
 * El offset ya no vive acá: es `OFFSET_ARGENTINA_MS` de
 * `shared/domain/zona-horaria-argentina.ts`, compartido con el formateo de
 * las exportaciones a CSV. Tener el número `-3` escrito en dos módulos era
 * la forma segura de que un cambio de criterio quedara aplicado en la mitad
 * del sistema. Este archivo conserva lo que SÍ es propio de compras: el
 * truncado a día y la noción de "hoy" que valida las fechas de etapa.
 */

import { desplazarAArgentina } from '../../../shared/domain/zona-horaria-argentina';

/**
 * Trunca una fecha a medianoche UTC, descartando la hora — mismo criterio
 * con el que Prisma serializa una columna `@db.Date`: solo importa
 * año/mes/día, nunca la hora. Toda comparación de fechas de etapa pasa por
 * acá para no comparar contra componentes de hora fantasma.
 */
export function soloFecha(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

/**
 * Fecha de HOY tal como se ve en Argentina (UTC-3), truncada a medianoche
 * UTC de ese día local — no el día UTC del servidor. Se calcula desplazando
 * el instante actual por el offset fijo ANTES de truncar, así que el
 * resultado es siempre el día calendario que un usuario en Argentina ve en
 * este momento, sin importar en qué zona horaria corre el proceso Node.
 */
export function hoyArgentina(): Date {
  const desplazada = desplazarAArgentina(new Date());
  return new Date(
    Date.UTC(desplazada.getUTCFullYear(), desplazada.getUTCMonth(), desplazada.getUTCDate()),
  );
}
