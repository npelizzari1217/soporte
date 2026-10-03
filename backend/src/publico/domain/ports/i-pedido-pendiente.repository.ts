import { PedidoPendienteEntity } from '../entities/pedido-pendiente.entity';

/**
 * IPedidoPendienteRepository — puerto de persistencia del pedido público pendiente (TENANT,
 * `pedidos_publicos_pendientes`). Sin imports de Prisma ni NestJS: la implementación toma el
 * cliente de `TenantContext`, así que participa de la transacción del `txRunner` cuando la hay.
 *
 * Ref design: ADR-7. Tarea: 11.3.
 */
export interface IPedidoPendienteRepository {
  /** Inserta el pendiente. Su id es el mismo del token de master. */
  save(pedido: PedidoPendienteEntity): Promise<void>;

  /**
   * `DELETE ... WHERE id = $1 RETURNING *`: borra y devuelve el pendiente en una sola sentencia.
   * Dos llamadas concurrentes se serializan sobre la fila: una recibe el pedido y la otra null.
   * Dentro de una transacción que luego hace ROLLBACK, la fila vuelve (el link sigue válido).
   * No filtra por vigencia: el caller valida `isExpired()` sobre lo devuelto.
   */
  consumir(id: string): Promise<PedidoPendienteEntity | null>;

  /**
   * Borra los pendientes vencidos (`expires_at <= ahora`) del tenant activo, que son PII sin
   * verificar. No hay scheduler: lo invoca cada solicitud nueva. Devuelve la cantidad borrada.
   */
  purgarVencidos(ahora?: Date): Promise<number>;
}

/** Token de inyección de dependencias para IPedidoPendienteRepository en NestJS. */
export const PEDIDO_PENDIENTE_REPOSITORY = Symbol('PEDIDO_PENDIENTE_REPOSITORY');
