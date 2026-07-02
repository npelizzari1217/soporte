/**
 * Types compartidos del módulo admin (panel de administración multi-tenant).
 * Mirrors de los DTOs de respuesta del backend (camelCase, ver
 * backend/src/clientes/interface/dtos/{cliente,ciclo}-response.dto.ts).
 *
 * Spec: [SPEC:clientes-tenancy/GET /clientes], [SPEC:clientes-tenancy/GET /ciclos]
 * Introducido en: admin-general PR5
 */

/** Cliente (tenant) — GET /clientes. Solo accesible por el operador global. */
export type Cliente = {
  id: string;
  nombre: string;
  activo: boolean;
  dbName: string;
  createdAt: string;
};

/** Ciclo (tenant-level, ciclos_cliente) — GET /ciclos. */
export type Ciclo = {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
};

/**
 * Reportes — 4 agregaciones read-only por tenant+ciclo. Mirrors de los tipos de
 * respuesta del backend (ver backend/src/reportes/application/use-cases/*.use-case.ts).
 *
 * Spec: [SPEC:reportes] — todos los requirements.
 * Introducido en: admin-general PR6d (Grupo D — Pantalla Reportes)
 */

/** Entrada de GET /reportes/tickets-por-usuario. usuarioId null = ticket sin asignar. */
export type UsuarioConTickets = {
  usuarioId: string | null;
  nombre: string;
  totalTickets: number;
};

/** GET /reportes/tickets-por-usuario — dos vistas: solicitante y asignado. */
export type TicketsPorUsuarioReporte = {
  porSolicitante: UsuarioConTickets[];
  porAsignado: UsuarioConTickets[];
};

/** Entrada de GET /reportes/tickets-por-tipo. Catálogo completo, incl. tipos con 0 tickets. */
export type TipoConTickets = {
  tipo: string;
  totalTickets: number;
};

/** Entrada de GET /reportes/tickets-por-estado. Catálogo completo, incl. estados con 0 tickets. */
export type EstadoConTickets = {
  estado: string;
  totalTickets: number;
};

/** GET /reportes/tiempo-resolucion. promedioDias null = sin tickets resueltos con fecha_cierre. */
export type TiempoResolucionReporte = {
  promedioDias: number | null;
  totalResueltos: number;
};
