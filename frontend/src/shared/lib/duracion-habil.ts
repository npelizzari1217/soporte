/**
 * Duración en segundos hábiles como `h:mm` (odd/tasks/tiempo-tecnico.md, T4). La usan el detalle
 * del ticket (tiempo de cada tramo y su meta) y el dashboard (promedio por técnico): vive acá para
 * que las dos pantallas muestren el mismo número para la misma medición.
 *
 * Las horas no se cortan en 24: `30:00` son 30 horas hábiles, no un día y seis horas.
 * Redondea al minuto más cercano.
 *
 * @param segundos Segundos hábiles, no negativos.
 * @returns Por ejemplo `"2:05"`.
 */
export function formatearDuracionHabil(segundos: number): string {
  const minutos = Math.round(segundos / 60);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas}:${String(resto).padStart(2, "0")}`;
}
