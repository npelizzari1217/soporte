/**
 * Tipos del dominio Dashboard — espejo de los DTOs reales del backend
 * (`backend/src/dashboard/interface/dtos/metricas.dto.ts` y
 * `backend/src/clientes/interface/dtos/ciclo.dto.ts`).
 *
 * Prohibido `any` (regla base). Estos tipos son la única fuente de verdad
 * de forma en el front — los hooks (`features/dashboard/hooks`) los usan
 * como genérico de `apiFetch<T>()`.
 *
 * Ref spec: sdd/beta-frontend/spec R-M2. Ref design: ADR-3. Tarea: T2.1.
 */

/** Respuesta de `GET /dashboard/metricas` — snapshot de KPIs (D1, backend). */
export interface MetricasDashboard {
  abiertos: number;
  cerrados: number;
  /** `null` si no hay tickets cerrados en el ciclo (evita división por cero en el backend). */
  tiempoPromedioResolucionHoras: number | null;
  cargaPorAgente: { asignadoId: string; abiertos: number }[];
  cumplimientoSla: {
    cerradosConSla: number;
    cerradosATiempo: number;
    /** Fracción `0..1`; `null` si `cerradosConSla=0`. */
    porcentaje: number | null;
  };
  /** `aTiempo / conMeta`; `porcentaje` es `null` si `conMeta=0`. */
  cumplimientoPrimeraRespuesta: {
    conMeta: number;
    aTiempo: number;
    /** Fracción `0..1`; `null` sin datos. */
    porcentaje: number | null;
  };
  /** Horas HÁBILES entre la creación y la primera respuesta; `null` sin datos. */
  tiempoPromedioPrimeraRespuestaHoras: number | null;
  distribucionPorTipo: { tipoId: string; total: number }[];
  distribucionPorPrioridad: { prioridadId: string; total: number }[];
  /**
   * KPI de satisfacción (WU9.2, backend ADR-C5). AUSENTE (no `undefined`
   * explícito: la clave no viene) sin `CSAT:LECTURA` — el gateo real ya lo
   * hizo el backend; la UI ADEMÁS lo esconde tras `useCan("CSAT:LECTURA")`
   * como defensa en profundidad.
   */
  csatPromedio?: number | null;
  csatRespuestas?: number;
}

/** Un ciclo de gestión del tenant (espejo de `CicloResponseDto`). */
export interface CicloTenant {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
  cicloVigenteId: string;
}

/** Respuesta de `GET /ciclos` (G4) — todos los ciclos del tenant + el activo. */
export interface ListarCiclosResponse {
  ciclos: CicloTenant[];
  cicloActivoId: string | null;
}
