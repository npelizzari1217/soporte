/** Fila mínima de tenant activo retornada por `listActiveTenants` (S5). */
export interface TenantActivo {
  clienteId: string;
  dbName: string;
}

/**
 * ITenantEnumerator — puerto de enumeración de tenants activos (S5),
 * consumido por `SlaSweepScheduler` para recorrer `master.clientes` y
 * ejecutar el barrido de vencimiento en la DB de cada uno.
 *
 * Ref spec: sdd/premium/spec S5. Ref design: ADR-P3. Tarea: SB5/SB6.
 */
export interface ITenantEnumerator {
  /** Lista los clientes ACTIVOS (no soft-deleted, `activo=true`) desde `master.clientes`. */
  listActiveTenants(): Promise<TenantActivo[]>;
}

/** Token de inyección de dependencias para ITenantEnumerator en NestJS. */
export const TENANT_ENUMERATOR = Symbol('TENANT_ENUMERATOR');
