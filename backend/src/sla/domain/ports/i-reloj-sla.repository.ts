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
   */
  guardarSiVersion(ticketId: string, version: number, reloj: RelojSlaResultado): Promise<boolean>;

  /** Ids de los tickets con `sla_reloj_pendiente`. */
  findPendientes(): Promise<string[]>;
}

export const RELOJ_SLA_REPOSITORY = Symbol('RELOJ_SLA_REPOSITORY');
