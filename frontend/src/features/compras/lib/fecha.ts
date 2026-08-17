/** Fecha de HOY en horario LOCAL del navegador, formato "YYYY-MM-DD" para `<input type="date">`. Mismo criterio que `features/equipos/depreciacion.ts:hoyISO`. */
export function hoyISO(): string {
  const d = new Date();
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}
