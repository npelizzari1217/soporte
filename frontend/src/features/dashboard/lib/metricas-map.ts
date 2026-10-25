/**
 * metricas-map — funciones PURAS que mapean `MetricasDashboard` (shape del
 * backend, solo IDs) al `ChartDatum[]`/número que consumen las primitivas de
 * `shared/charts/*` (Extract-Before-Mock: mismo patrón que
 * `buildTicketsQueryString`/`computeDonutSegments`).
 *
 * Ref spec: sdd/beta-frontend/spec R-M2. Tarea: T2.3, T2.4, T2.5.
 */
import type { ChartDatum } from "@/shared/charts/bar-chart";
import type { CumplimientoTecnico, MetricasDashboard, TareasCompletadasTecnico } from "../types";
import { formatearDuracionHabil } from "@/shared/lib/duracion-habil";

/** T2.3 — abiertos/cerrados como dos categorías del BarChart. */
export function toAbiertosCerradosChartData(
  metricas: Pick<MetricasDashboard, "abiertos" | "cerrados">,
): ChartDatum[] {
  return [
    { label: "Abiertos", value: metricas.abiertos },
    { label: "Cerrados", value: metricas.cerrados },
  ];
}

/**
 * T2.3 — tiempo promedio de resolución como único punto del LineChart.
 * `null` (sin cerrados con SLA aplicable, backend D2) → array vacío, NUNCA
 * un punto en 0 — 0 horas y "sin datos" son señales distintas.
 */
export function toTiempoPromedioChartData(horas: number | null): ChartDatum[] {
  if (horas === null) return [];
  return [{ label: "Promedio (h)", value: horas }];
}

/**
 * T2.4 — carga por agente (HBarChart). Resuelve `asignadoId → nombre` vía
 * el map de usuarios asignables (`GET /usuarios`, G2). Un id sin match
 * (usuario dado de baja entre la consulta de métricas y la de usuarios) usa
 * el id crudo como fallback — nunca rompe el render.
 */
export function toCargaPorAgenteChartData(
  cargaPorAgente: MetricasDashboard["cargaPorAgente"],
  usuarioNombreMap: Map<string, string>,
): ChartDatum[] {
  return cargaPorAgente.map((item) => ({
    label: usuarioNombreMap.get(item.asignadoId) ?? item.asignadoId,
    value: item.abiertos,
  }));
}

/** Etiqueta neutra para una fila cuyo usuario ya no está en master (nombre y apellido `null`). */
export const NOMBRE_USUARIO_AUSENTE = "Usuario";

/**
 * odd/tareas-con-tecnico T7 — tareas completadas por técnico (HBarChart).
 * El nombre viaja en la respuesta (T4), así que no hace falta el map de
 * usuarios. Respeta el orden del backend (descendente por `completadas`).
 * Un backend anterior a T4 omite el campo → `undefined` se trata como `[]`.
 */
export function toTareasCompletadasChartData(
  filas: TareasCompletadasTecnico[] | undefined,
): ChartDatum[] {
  return (filas ?? []).map((fila) => ({ label: nombreDeFila(fila), value: fila.completadas }));
}

/** Nombre y apellido de una fila con usuario de master, o la etiqueta neutra si no hay ninguno. */
function nombreDeFila(fila: { nombre: string | null; apellido: string | null }): string {
  const nombre = [fila.nombre, fila.apellido].filter((parte) => parte !== null && parte.trim() !== "").join(" ");
  return nombre || NOMBRE_USUARIO_AUSENTE;
}

/** Una fila de la tabla "Cumplimiento del técnico", lista para mostrar. */
export interface FilaCumplimientoTecnico {
  usuarioId: string;
  nombre: string;
  evaluados: number;
  cumplidos: number;
  /** Entero `0..100`, ya redondeado. */
  porcentaje: number;
  /** Promedio en horas hábiles, `h:mm`. */
  promedio: string;
}

/**
 * odd/tasks/tiempo-tecnico.md T4 — cumplimiento por técnico (tabla). Respeta
 * el orden del backend. Un backend sin el campo → `undefined` se trata como `[]`.
 */
export function toCumplimientoTecnicoFilas(
  filas: CumplimientoTecnico[] | undefined,
): FilaCumplimientoTecnico[] {
  return (filas ?? []).map((fila) => ({
    usuarioId: fila.usuarioId,
    nombre: nombreDeFila(fila),
    evaluados: fila.total,
    cumplidos: fila.cumplidos,
    porcentaje: Math.round(fila.porcentaje * 100),
    promedio: formatearDuracionHabil(fila.promedioHabilS),
  }));
}

/**
 * T2.4 — distribución por tipo/prioridad (DonutChart), genérica sobre el
 * campo de id (`tipoId`/`prioridadId`) vía `idSelector`. Mismo fallback que
 * `toCargaPorAgenteChartData` para ids sin match en el catálogo.
 */
export function toDistribucionChartData<T extends { total: number }>(
  items: T[],
  idSelector: (item: T) => string,
  nombreMap: Map<string, string>,
): ChartDatum[] {
  return items.map((item) => {
    const id = idSelector(item);
    return { label: nombreMap.get(id) ?? id, value: item.total };
  });
}

/**
 * T2.5 — % de cumplimiento (GaugeChart, escala 0-100) a partir de la fracción
 * `0..1` del backend (ADR-P5), redondeado a entero. `null` (sin datos, evita
 * división por cero) se devuelve como `null`: la vista lo muestra como "sin
 * datos", NUNCA como 0 % (sdd/sla-primera-respuesta-y-pausa, dashboard R3).
 */
export function toPorcentaje(fraccion: number | null): number | null {
  if (fraccion === null) return null;
  return Math.round(fraccion * 100);
}

/** Horas con un decimal y la unidad ("1,3 h"); `null` → `null` (sin datos). */
export function formatHoras(horas: number | null): string | null {
  if (horas === null) return null;
  return `${horas.toFixed(1).replace(".", ",")} h`;
}
