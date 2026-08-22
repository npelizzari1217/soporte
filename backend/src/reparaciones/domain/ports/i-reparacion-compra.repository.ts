import { CompraVinculada } from '../services/bloqueo-reparacion';

/**
 * IReparacionCompraRepository — puerto de persistencia del vínculo
 * REPARACIÓN ↔ COMPRA (`reparacion_compra`).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaReparacionCompraRepository`, WU2) obtiene
 * su cliente vía `TenantContext.getClient()`.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra, D2/D3/D4/D5. Tarea: WU1.5.
 */
export interface IReparacionCompraRepository {
  /**
   * Crea el vínculo entre una reparación y una compra. IDEMPOTENTE: vincular
   * el mismo par dos veces (doble clic, reintento de red) no crea una
   * segunda fila ni falla — la UNIQUE de la tabla lo resuelve vía
   * `ON CONFLICT DO NOTHING` (D4), sin check-then-insert.
   */
  vincular(ticketEdiliciaId: string, compraId: string): Promise<void>;

  /**
   * Elimina el vínculo entre una reparación y una compra. HARD DELETE real
   * (D5) — un vínculo equivocado es un error de dato, no un hecho a
   * preservar.
   */
  desvincular(ticketEdiliciaId: string, compraId: string): Promise<void>;

  /**
   * Resuelve, por LOTE, las compras vinculadas a varias reparaciones a la
   * vez y devuelve `Map<ticketEdiliciaId, CompraVinculada[]>`.
   *
   * POR LOTE A PROPÓSITO, no por conveniencia: su único consumidor es
   * `ListarReparacionesUseCase` (WU3), cuyo costo en consultas es CONSTANTE
   * — mismo criterio que `IComentarioReparacionRepository.contarPorTicketEdilicia`.
   * Una firma de un solo id invitaría a llamarla dentro del loop y
   * devolvería el listado a una consulta por fila.
   *
   * Las reparaciones sin ninguna compra vinculada NO aparecen en el Map (la
   * ausencia se resuelve como `[]`, nunca `undefined`). Con
   * `ticketEdiliciaIds` vacío no consulta nada y devuelve un Map vacío.
   *
   * Excluye compras con `deleted_at IS NOT NULL` (D6): una compra borrada es
   * invisible en `/compras`, así que no puede figurar como la causa de un
   * bloqueo que el usuario no puede abrir.
   */
  findComprasVinculadasByTicketEdiliciaIds(
    ticketEdiliciaIds: string[],
  ): Promise<Map<string, CompraVinculada[]>>;
}

/** Token de inyección de dependencias para IReparacionCompraRepository en NestJS. */
export const REPARACION_COMPRA_REPOSITORY = Symbol('REPARACION_COMPRA_REPOSITORY');
