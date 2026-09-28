/**
 * Conversión pura HH:MM ↔ minutos desde medianoche, para el form de
 * `horario-laboral` (D14, design.md). El `<Input type="time">` del form
 * (WU-8a) trabaja con strings `HH:MM`; el DTO (`types.ts`) trabaja con
 * minutos `[0, 1440]`.
 *
 * `esCierre` distingue las dos columnas porque `1440` (fin del día) y `0`
 * (inicio del día) comparten la misma representación `"00:00"` en
 * `type="time"`, que no puede expresar `"24:00"`. En APERTURA, `"00:00"`
 * significa 0 (inicio de día): nunca aparece 1440 ahí porque
 * `apertura < cierre` ya lo excluye (D1, `design.md`). En CIERRE,
 * `"00:00"` significa 1440 (fin de día) — la única lectura posible, porque
 * `cierre` nunca puede ser 0 por la misma desigualdad.
 */
export function minutosAHhmm(minutos: number, esCierre = false): string {
  if (esCierre && minutos === 1440) return "00:00";
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return `${String(horas).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function hhmmAMinutos(hhmm: string, esCierre = false): number {
  const [horasStr, minsStr] = hhmm.split(":");
  const horas = Number(horasStr);
  const mins = Number(minsStr);
  if (esCierre && horas === 0 && mins === 0) return 1440;
  return horas * 60 + mins;
}
