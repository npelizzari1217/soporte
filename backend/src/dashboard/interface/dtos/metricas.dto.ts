/**
 * DTOs de entrada/salida de `DashboardController` (D1/D3 — agregaciones
 * read-only de métricas).
 *
 * Tarea: D6.
 */
import { IsOptional, IsUUID } from 'class-validator';
import { MetricasResult } from '../../application/use-cases/obtener-metricas.use-case';

/** Query params de `GET /dashboard/metricas` (D1). */
export class ObtenerMetricasQueryDto {
  /** Ciclo explícito (histórico). Sin valor → se resuelve el ciclo ACTIVO. */
  @IsOptional()
  @IsUUID()
  ciclo?: string;
}

/** Response de `GET /dashboard/metricas` — snapshot de KPIs (D1). */
export interface MetricasResponseDto {
  abiertos: number;
  cerrados: number;
  tiempoPromedioResolucionHoras: number | null;
  cargaPorAgente: { asignadoId: string; abiertos: number }[];
  cumplimientoSla: {
    cerradosConSla: number;
    cerradosATiempo: number;
    porcentaje: number | null;
  };
  cumplimientoPrimeraRespuesta: { conMeta: number; aTiempo: number; porcentaje: number | null };
  tiempoPromedioPrimeraRespuestaHoras: number | null;
  distribucionPorTipo: { tipoId: string; total: number }[];
  distribucionPorPrioridad: { prioridadId: string; total: number }[];
  /**
   * Tareas completadas por técnico en el período del ciclo (odd/tareas-con-tecnico T4), atribuidas
   * a quien las completó, en orden descendente. TECNICO recibe a lo sumo su propia fila.
   */
  tareasCompletadasPorTecnico: {
    usuarioId: string;
    nombre: string | null;
    apellido: string | null;
    completadas: number;
  }[];
  /**
   * Cumplimiento por técnico en el período del ciclo (odd/tasks/tiempo-tecnico.md, T4, S8): tramos
   * cerrados en RESUELTO con veredicto, `porcentaje` como fracción `0..1` y el promedio en segundos
   * hábiles del horario de cada técnico. TECNICO recibe a lo sumo su propia fila.
   */
  cumplimientoTecnico: {
    usuarioId: string;
    nombre: string | null;
    apellido: string | null;
    total: number;
    cumplidos: number;
    porcentaje: number;
    promedioHabilS: number;
  }[];
  /** KPI de satisfacción (WU9.1, ADR-C5). AUSENTE sin `CSAT:LECTURA`. */
  csatPromedio?: number | null;
  csatRespuestas?: number;
}

/** Convierte el `MetricasResult` de aplicación al shape de respuesta HTTP (identidad — mismo shape). */
export function toMetricasResponseDto(metricas: MetricasResult): MetricasResponseDto {
  return metricas;
}
