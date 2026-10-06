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
  /** KPI de satisfacción (WU9.1, ADR-C5). AUSENTE sin `CSAT:LECTURA`. */
  csatPromedio?: number | null;
  csatRespuestas?: number;
}

/** Convierte el `MetricasResult` de aplicación al shape de respuesta HTTP (identidad — mismo shape). */
export function toMetricasResponseDto(metricas: MetricasResult): MetricasResponseDto {
  return metricas;
}
