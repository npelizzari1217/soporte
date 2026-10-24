import { CompraVinculada } from '../services/bloqueo-reparacion';

/**
 * IReparacionCompraRepository — puerto de persistencia del vínculo TICKET ↔ COMPRA
 * (`ticket_compra`).
 *
 * Desde odd/ticket-unificado (S1) el vínculo es del ticket, de cualquier tipo, y no del satélite
 * de Edilicia: las firmas reciben ids de ticket. El nombre del puerto es el heredado de
 * `reparacion_compra`, que quedó congelada; T4 lo renombra junto con el retiro del satélite.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La implementación concreta
 * (`PrismaReparacionCompraRepository`) obtiene su cliente vía `TenantContext.getClient()`.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra, D2/D3/D4/D5.
 */
export interface IReparacionCompraRepository {
  /**
   * Crea el vínculo entre un ticket y una compra. IDEMPOTENTE: vincular el mismo par dos veces
   * (doble clic, reintento de red) no crea una segunda fila ni falla — la UNIQUE de la tabla lo
   * resuelve vía `ON CONFLICT DO NOTHING` (D4), sin check-then-insert.
   */
  vincular(ticketId: string, compraId: string): Promise<void>;

  /**
   * Elimina el vínculo entre un ticket y una compra. HARD DELETE real (D5) — un vínculo
   * equivocado es un error de dato, no un hecho a preservar.
   */
  desvincular(ticketId: string, compraId: string): Promise<void>;

  /**
   * Resuelve, por LOTE, las compras vinculadas a varios tickets a la vez y devuelve
   * `Map<ticketId, CompraVinculada[]>`, cada lista ordenada por número de compra.
   *
   * POR LOTE A PROPÓSITO: su consumidor principal es `ListarReparacionesUseCase`, cuyo costo en
   * consultas es CONSTANTE. Una firma de un solo id invitaría a llamarla dentro del loop.
   *
   * Los tickets sin compras vinculadas NO aparecen en el Map (la ausencia se resuelve como `[]`,
   * nunca `undefined`). Con `ticketIds` vacío no consulta nada y devuelve un Map vacío.
   *
   * Excluye compras con `deleted_at IS NOT NULL` (D6): una compra borrada es invisible en
   * `/compras`, así que no puede figurar como la causa de un bloqueo que el usuario no puede abrir.
   */
  findComprasVinculadasByTicketIds(ticketIds: string[]): Promise<Map<string, CompraVinculada[]>>;
}

/** Token de inyección de dependencias para IReparacionCompraRepository en NestJS. */
export const REPARACION_COMPRA_REPOSITORY = Symbol('REPARACION_COMPRA_REPOSITORY');
