import { PedidoPublicoTokenEntity } from '../entities/pedido-publico-token.entity';

/**
 * IPedidoPublicoTokenRepository — puerto de persistencia del token de verificación del pedido
 * público (MASTER, `pedido_publico_tokens`). Sin imports de Prisma ni NestJS.
 *
 * Ref design: ADR-7. Tarea: 11.3.
 */
export interface IPedidoPublicoTokenRepository {
  /** Inserta el token. El id lo genera el dominio y es el mismo de la fila pendiente del tenant. */
  save(token: PedidoPublicoTokenEntity): Promise<void>;

  /** Busca por el sha256 del token. Null si no existe. No filtra por vigencia: eso es del caller. */
  findByHash(tokenHash: string): Promise<PedidoPublicoTokenEntity | null>;

  /**
   * Marca `used_at` solo si seguía en NULL. Devuelve `true` si ESTA llamada lo marcó. Es el paso
   * post-commit y best-effort de la confirmación: la atomicidad la da el DELETE del pendiente.
   */
  marcarUsado(id: string): Promise<boolean>;
}

/** Token de inyección de dependencias para IPedidoPublicoTokenRepository en NestJS. */
export const PEDIDO_PUBLICO_TOKEN_REPOSITORY = Symbol('PEDIDO_PUBLICO_TOKEN_REPOSITORY');
