/**
 * utc-connection-string.ts — helper `conUtc()` (ADR-1, sdd/sesion-utc-y-backfill-de-fechas).
 *
 * Único lugar autorizado a construir un `pg.Pool` de producción. La fitness
 * rule de ESLint (`no-restricted-syntax`, `eslint.config.js`) prohíbe
 * `new Pool(` fuera de este archivo — así ningún adapter futuro puede abrir
 * una sesión Postgres sin pasar por acá.
 *
 * Garantía que agrega: toda sesión que abra un Pool construido con `conUtc()`
 * arranca en `TimeZone = 'UTC'`, sin importar el TimeZone configurado a
 * nivel de rol o de base (`ALTER DATABASE ... SET timezone`, la segunda
 * garantía independiente de ADR-1). El mecanismo es el parámetro de conexión
 * estándar de libpq `options=-c TimeZone=UTC`, que `pg` traduce al paquete de
 * arranque de la conexión — tiene MAYOR precedencia que cualquier default de
 * rol o de base.
 *
 * `pg.Pool` es lazy (no abre conexiones TCP al construirse), así que este
 * helper es seguro de invocar en el constructor de cualquier servicio sin
 * costo de conexión hasta la primera query.
 *
 * Ref spec: sdd/sesion-utc-y-backfill-de-fechas §"Round-trip de fecha
 * correcto en sesión no-UTC". Ref design: ADR-1, ADR-7. Tarea: 1.2.
 */
import { Pool, type PoolConfig } from 'pg';

const NOMBRE_PARAMETRO_OPTIONS = 'options';
const FLAG_TIMEZONE_UTC = '-c TimeZone=UTC';

/** ¿El valor del parámetro `options` ya incluye el flag `-c TimeZone=UTC`? */
function incluyeFlagTimezoneUtc(valorOptions: string): boolean {
  return /(^|\s)-c\s+TimeZone=UTC(\s|$)/i.test(valorOptions);
}

/**
 * Agrega `options=-c TimeZone=UTC` a una connection string Postgres,
 * preservando usuario, clave, host, puerto, path (nombre de DB) y cualquier
 * query param previo.
 *
 * Si ya existe un `options` previo (por ejemplo `-c search_path=foo`), el
 * flag se APPENDEA en vez de pisarlo — libpq admite múltiples `-c` separados
 * por espacio dentro de un único valor de `options`.
 *
 * Idempotente: si el flag ya está presente (por ejemplo, al aplicar esta
 * función dos veces sobre la misma URL), no lo duplica.
 *
 * @param connectionString URL de conexión Postgres (`postgresql://...`).
 * @returns La misma URL con el parámetro `options` aumentado.
 */
export function agregarTimezoneUtc(connectionString: string): string {
  const url = new URL(connectionString);
  const valorActual = url.searchParams.get(NOMBRE_PARAMETRO_OPTIONS);

  if (valorActual !== null && incluyeFlagTimezoneUtc(valorActual)) {
    return url.toString();
  }

  const nuevoValor =
    valorActual === null || valorActual.trim() === ''
      ? FLAG_TIMEZONE_UTC
      : `${valorActual} ${FLAG_TIMEZONE_UTC}`;

  url.searchParams.set(NOMBRE_PARAMETRO_OPTIONS, nuevoValor);
  return url.toString();
}

/**
 * Construye un `pg.Pool` con la sesión forzada a `TimeZone = 'UTC'`
 * (ADR-1). Único punto de construcción de `Pool` autorizado en el repo —
 * ver el comment de cabecera de este archivo y la fitness rule de ESLint.
 *
 * @param connectionString URL de conexión Postgres (`postgresql://...`).
 * @param poolConfig Config adicional de `pg.Pool` (ej. `max`). No debe traer
 *   `connectionString` propio: se pisaría con el aumentado por este helper.
 */
export function conUtc(
  connectionString: string,
  poolConfig: Omit<PoolConfig, 'connectionString'> = {},
): Pool {
  return new Pool({ ...poolConfig, connectionString: agregarTimezoneUtc(connectionString) });
}
