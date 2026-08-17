/**
 * Fix post-verify W4/W5 (sdd/compras-tres-etapas-y-sectores): la versión
 * anterior usaba `new Date().getFullYear()/getMonth()/getDate()`, que
 * calculan "hoy" en el huso horario LOCAL del sistema operativo/navegador
 * del usuario — no necesariamente Argentina. El backend
 * (`fecha-argentina.ts:hoyArgentina`) valida las 3 fechas de etapa contra un
 * offset FIJO de Argentina (UTC-3), sin importar en qué huso corre el
 * servidor. Con reglas distintas, un usuario cuyo SO/navegador NO está en
 * huso Argentina podía ver un prellenado que el backend rechazaba con 422 al
 * enviarlo — el mismo "hoy" en pantalla no era el mismo "hoy" que validaba
 * el servidor.
 */
const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;

/**
 * Fecha de HOY tal como se ve en Argentina (UTC-3, offset fijo — MISMA regla
 * que `hoyArgentina()` del backend), formato "YYYY-MM-DD" para
 * `<input type="date">`. Desplaza el instante UTC actual por el offset fijo
 * ANTES de leer año/mes/día — nunca usa componentes locales del navegador.
 */
export function hoyISO(): string {
  const desplazada = new Date(Date.now() + OFFSET_ARGENTINA_MS);
  const anio = desplazada.getUTCFullYear();
  const mes = String(desplazada.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(desplazada.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}
