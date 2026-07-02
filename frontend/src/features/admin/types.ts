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
