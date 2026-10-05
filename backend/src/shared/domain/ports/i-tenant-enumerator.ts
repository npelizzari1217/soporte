/** Fila mínima de tenant activo retornada por `listActiveTenants` (S5). */
export interface TenantActivo {
  clienteId: string;
  dbName: string;
}

/**
 * Fila de `listTenantsConBase`. `vivo` es `activo=true` y no soft-deleted: el mismo criterio de
 * `listActiveTenants`. `scripts/migrate-tenants.js` solo migra tenants vivos, así que uno dado de
 * baja puede tener el esquema atrasado.
 */
export interface TenantConBase extends TenantActivo {
  vivo: boolean;
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

  /**
   * Lista TODO cliente de `master.clientes` cuya base de tenant se conserva: activos, inactivos y
   * soft-deleted. Dar de baja un cliente NO dropea su base (es reversible vía reactivar), así que
   * los datos siguen ahí. Existe para las purgas que deben alcanzar también a los tenants
   * suspendidos (p. ej. PII de solicitantes sin confirmar). Los schedulers que actúan sobre
   * trabajo vivo (SLA, preventivo) deben seguir usando `listActiveTenants`.
   */
  listTenantsConBase(): Promise<TenantConBase[]>;
}

/** Token de inyección de dependencias para ITenantEnumerator en NestJS. */
export const TENANT_ENUMERATOR = Symbol('TENANT_ENUMERATOR');
