/**
 * almanaque.ts — helpers de fecha puros para el almanaque mensual de
 * feriados (WU1, sdd/feriados-almanaque). Operan sobre cadenas
 * `YYYY-MM-DD` y números de año/mes, y construyen instantes solo con
 * `Date.UTC(...)` + métodos `getUTC*`. NUNCA `new Date(cadena)`: ese
 * parseo corre un día de calendario para cualquiera al oeste de UTC —
 * misma trampa que `formatearFechaCalendario` (`shared/lib/formato-fecha.ts`)
 * y el incidente `corregir-fecha-cierre-tickets`.
 */
import { hoyFechaCalendario } from "@/shared/lib/formato-fecha";

/** Año + mes, 1-indexado (`mes: 1` = enero ... `mes: 12` = diciembre). */
export interface AnioMes {
  anio: number;
  mes: number;
}

/** Una celda del almanaque. */
export interface DiaAlmanaque {
  fecha: string; // YYYY-MM-DD
  diaMes: number; // día del mes mostrado (1-31)
  esDelMesActual: boolean; // false en las celdas de relleno del mes anterior/siguiente
  esFinDeSemana: boolean; // true para sábado y domingo
}

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

/** Encabezados de columna del almanaque, lunes a domingo. */
export const NOMBRES_DIA_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

// Día 0 del mes siguiente (0-indexado, como pide `Date.UTC`) es el último
// día de `mes` (1-indexado): desborda hacia atrás dentro del mismo cálculo
// UTC, sin pasar por el reloj local.
function cantidadDeDias(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Día de la semana ISO (0 = lunes ... 6 = domingo) del día 1 del mes. */
function diaSemanaISODelPrimero(anio: number, mes: number): number {
  const diaSemanaDomingoIndex = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay();
  return (diaSemanaDomingoIndex + 6) % 7;
}

// `Date.UTC` normaliza un día fuera de rango (0, o mayor a los días del
// mes) desbordando hacia el mes adyacente correcto — así se arman las
// celdas de relleno sin aritmética manual de "mes anterior/siguiente".
function construirDia(anio: number, mes: number, offsetDesdeDia1: number): DiaAlmanaque {
  const instante = new Date(Date.UTC(anio, mes - 1, 1 + offsetDesdeDia1));
  const anioReal = instante.getUTCFullYear();
  const mesReal = instante.getUTCMonth() + 1;
  const diaReal = instante.getUTCDate();
  const diaSemana = instante.getUTCDay();
  return {
    fecha: `${String(anioReal).padStart(4, "0")}-${String(mesReal).padStart(2, "0")}-${String(diaReal).padStart(2, "0")}`,
    diaMes: diaReal,
    esDelMesActual: mesReal === mes,
    esFinDeSemana: diaSemana === 0 || diaSemana === 6,
  };
}

// Semanas del mes como filas de 7 celdas, lunes primero. Las celdas de
// relleno del mes anterior/siguiente se incluyen con `esDelMesActual:
// false`, para que el grid siempre tenga semanas completas (5 o 6 filas).
export function obtenerSemanasDelMes(anio: number, mes: number): DiaAlmanaque[][] {
  const inicio = diaSemanaISODelPrimero(anio, mes);
  const totalCeldas = Math.ceil((inicio + cantidadDeDias(anio, mes)) / 7) * 7;
  const dias: DiaAlmanaque[] = [];
  for (let celda = 0; celda < totalCeldas; celda++) {
    dias.push(construirDia(anio, mes, celda - inicio));
  }
  const semanas: DiaAlmanaque[][] = [];
  for (let i = 0; i < dias.length; i += 7) {
    semanas.push(dias.slice(i, i + 7));
  }
  return semanas;
}

/** Mes siguiente, con acarreo de año (diciembre → enero del año siguiente). */
export function mesSiguiente({ anio, mes }: AnioMes): AnioMes {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

/** Mes anterior, con acarreo de año (enero → diciembre del año anterior). */
export function mesAnterior({ anio, mes }: AnioMes): AnioMes {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

/** Etiqueta del mes en español, p. ej. `"Octubre 2026"`. */
export function etiquetaMes(anio: number, mes: number): string {
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}

/** `true` si la fecha de calendario (`YYYY-MM-DD`) cae en sábado o domingo. */
export function esFinDeSemana(fecha: string): boolean {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return diaSemana === 0 || diaSemana === 6;
}

/** Año y mes de una fecha (`YYYY-MM-DD`), para fijar el mes inicial del almanaque. */
export function anioMesDeFecha(fecha: string): AnioMes {
  const [anio, mes] = fecha.split("-").map(Number);
  return { anio, mes };
}

// `YYYY-MM-DD` de hoy, delegado a `hoyFechaCalendario()` (WU2, fix sobre
// WU1) — única función acá que lee el reloj en vez de operar sobre una
// cadena recibida. Default de la prop `hoy` del componente, inyectable en
// tests. NUNCA el reloj local del navegador: `hoyFechaCalendario` usa el
// offset fijo de Argentina, el mismo "hoy" que el backend valida
// (`hoyArgentina()`) — ver la nota sobre `OFFSET_ARGENTINA_MS` en
// `shared/lib/formato-fecha.ts`.
export function fechaDeHoy(): string {
  return hoyFechaCalendario();
}
