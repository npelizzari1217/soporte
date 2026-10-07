import type { RelojSlaFila, RelojSlaResultado, TransicionReloj } from '../entities/reloj-sla';

/**
 * IRelojSlaRepository — puerto del reloj de SLA (sdd/sla-primera-respuesta-y-pausa, ADR-3).
 * Dominio puro: la implementación Prisma vive en `infrastructure/`.
 */
export interface IRelojSlaRepository {
  /** Fila del reloj del ticket (versión incluida), o `null` si no existe o está borrado. */
  leer(ticketId: string): Promise<RelojSlaFila | null>;

  /** Historial `CAMBIO_ESTADO` sin secuencia, por `created_at, id`. Solo para incorporar un previo. */
  historialSinSecuencia(ticketId: string): Promise<TransicionReloj[]>;

  /** Operaciones `CAMBIO_ESTADO` con `sla_reloj_seq > seqHasta`, ordenadas por `sla_reloj_seq`. */
  transicionesDesde(ticketId: string, seqHasta: number): Promise<TransicionReloj[]>;

  /**
   * CAS: escribe el reloj solo si `sla_reloj_version` sigue siendo `version`; deja el cursor en
   * `version` y limpia el pendiente. `false` si entró otra transición (0 filas afectadas).
   *
   * Con `prioridadAplicadaId` (la escritura de `AplicarSla`, issue #429) el CAS exige además que esa
   * sea la prioridad vigente del ticket y, en la MISMA escritura, baja `sla_meta_pendiente`. Si
   * repriorizaron mientras tanto, no escribe, devuelve `false` y la marca queda puesta: la meta de la
   * prioridad vieja nunca se escribe ni consume la marca que la repriorización nueva necesita.
   * Sin `prioridadAplicadaId` (la consolidación del pendiente) no toca la marca.
   *
   * Con `rearmarVencido` (issue #432) la misma escritura baja `vencido`: la repriorización dejó el
   * vencimiento en el futuro y el aviso de "SLA vencido" debe poder enviarse otra vez. Sin él (o con
   * `false`, vencimiento todavía pasado) `vencido` no se toca, para no repetir el mail.
   */
  guardarSiVersion(
    ticketId: string,
    version: number,
    reloj: RelojSlaResultado,
    meta?: { prioridadAplicadaId: string; rearmarVencido?: boolean },
  ): Promise<boolean>;

  /** Baja `sla_meta_pendiente` sin otra escritura: el ticket es terminal y nada se aplicará nunca. */
  limpiarMetaPendiente(ticketId: string): Promise<void>;

  /** Ids de los tickets con `sla_reloj_pendiente`. */
  findPendientes(): Promise<string[]>;

  /**
   * Ids de los tickets con `sla_meta_pendiente` y no borrados, acotado a un lote por barrido (issue
   * #429): la meta de SLA que el alta o la repriorización marcaron y `AplicarSla` no llegó a aplicar.
   */
  findMetaPendiente(): Promise<string[]>;
}

export const RELOJ_SLA_REPOSITORY = Symbol('RELOJ_SLA_REPOSITORY');
