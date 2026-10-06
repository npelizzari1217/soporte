/**
 * MetricaFiltro — filtro combinable (AND) para todas las agregaciones de
 * `IDashboardRepository` (D1). `cicloId` lo resuelve siempre el use case
 * (ciclo explícito o el ACTIVO por default, mismo criterio que
 * `ListarTicketsUseCase`, T7); `asignadoId` lo fuerza el use case a
 * `actor.sub` cuando el rol es TECNICO (D2) — `undefined` = todo el tenant.
 */
export interface MetricaFiltro {
  cicloId?: string;
  asignadoId?: string;
}

/** Conteo de tickets abiertos (`fechaCierre IS NULL`) vs cerrados (`fechaCierre IS NOT NULL`). */
export interface ConteoAbiertosCerrados {
  abiertos: number;
  cerrados: number;
}

/** Carga (tickets abiertos) de un agente puntual — excluye tickets sin asignar. */
export interface CargaAgente {
  asignadoId: string;
  abiertos: number;
}

/**
 * Insumos crudos del % de cumplimiento SLA (D1): `cumplimiento =
 * cerradosATiempo / cerradosConSla`. El cociente lo calcula el use case
 * (repo retorna los conteos crudos, testeables por separado).
 *
 * sdd/sla-primera-respuesta-y-pausa (`dashboard-metricas-sla` R1): el universo son los resueltos o
 * cerrados con meta, y "a tiempo" sale del cumplimiento fijado en cada resolución (`sla_cumplido`)
 * o, en los previos que nunca se incorporaron, de `fechaCierre <= slaVenceAt`. Nunca de `vencido`.
 * Los preventivos no entran.
 */
export interface CumplimientoSlaCrudo {
  /** Resueltos o cerrados con meta y cumplimiento determinable. */
  cerradosConSla: number;
  /** De los anteriores, los que cumplieron. */
  cerradosATiempo: number;
}

/**
 * Insumos crudos del % de primera respuesta (`dashboard-metricas-sla` R2): tickets con meta que ya
 * respondieron o ya vencieron, y de ellos los respondidos en o antes del vencimiento.
 */
export interface CumplimientoPrimeraRespuestaCrudo {
  conMeta: number;
  aTiempo: number;
}

/** Distribución de tickets por tipo de ticket. */
export interface DistribucionPorTipo {
  tipoId: string;
  total: number;
}

/** Distribución de tickets por prioridad. */
export interface DistribucionPorPrioridad {
  prioridadId: string;
  total: number;
}

/**
 * IDashboardRepository — puerto de agregaciones read-only sobre `tickets`
 * (D1). Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * Todos los métodos aplican el MISMO `MetricaFiltro` (AND) — el scope por
 * rol (D2) es responsabilidad del use case, que arma `asignadoId` antes de
 * llamar al repo.
 *
 * Ref spec: sdd/premium/spec D1, D2. Ref design: ADR-P5. Tarea: D2.
 */
export interface IDashboardRepository {
  /** Abiertos vs cerrados del ciclo/scope filtrado. */
  conteoPorEstadoAgrupado(filtro: MetricaFiltro): Promise<ConteoAbiertosCerrados>;

  /**
   * Promedio en horas de `fechaCierre - createdAt` sobre los tickets
   * cerrados del scope filtrado. `null` si no hay ningún cerrado (evita
   * dividir por cero / NaN engañoso).
   */
  tiempoPromedioResolucionHoras(filtro: MetricaFiltro): Promise<number | null>;

  /**
   * Carga (tickets abiertos) por agente, agrupado por `asignadoId`. Excluye
   * tickets sin asignar. Con `filtro.asignadoId` fijo (scope TECNICO, D2)
   * retorna como máximo una fila (la propia).
   */
  cargaPorAgente(filtro: MetricaFiltro): Promise<CargaAgente[]>;

  /** Insumos crudos del % de cumplimiento SLA (D1). */
  cumplimientoSla(filtro: MetricaFiltro): Promise<CumplimientoSlaCrudo>;

  /** Insumos crudos del % de cumplimiento de primera respuesta. Excluye preventivos. */
  cumplimientoPrimeraRespuesta(filtro: MetricaFiltro): Promise<CumplimientoPrimeraRespuestaCrudo>;

  /**
   * Tiempo medio de primera respuesta en horas HÁBILES del calendario del cliente, entre la creación
   * y la primera respuesta, sobre todos los tickets con respuesta (incluidos los rellenados sin
   * meta). `null` si no hay ninguno. Excluye preventivos.
   */
  tiempoPromedioPrimeraRespuestaHoras(filtro: MetricaFiltro): Promise<number | null>;

  /** Distribución de tickets (cualquier estado) por tipo. */
  distribucionPorTipo(filtro: MetricaFiltro): Promise<DistribucionPorTipo[]>;

  /** Distribución de tickets (cualquier estado) por prioridad. */
  distribucionPorPrioridad(filtro: MetricaFiltro): Promise<DistribucionPorPrioridad[]>;
}

/** Token de inyección de dependencias para IDashboardRepository en NestJS. */
export const DASHBOARD_REPOSITORY = Symbol('DASHBOARD_REPOSITORY');
