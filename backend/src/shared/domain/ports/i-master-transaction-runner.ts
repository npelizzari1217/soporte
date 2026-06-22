/**
 * IMasterTransactionRunner — puerto para transacciones atómicas en la DB MASTER.
 *
 * Análogo a ITenantTransactionRunner pero para tablas MASTER (usuarios, refresh_tokens).
 * Vive en shared/domain/ports para que la capa de aplicación pueda importarlo sin
 * violar la regla de dependencias (application → domain, never application → infrastructure).
 *
 * La implementación concreta (MasterTransactionRunner con Prisma $transaction) vive
 * en shared/infrastructure/persistence/master-transaction-runner.ts.
 *
 * Tarea: PR-06 (carried-over W2 — BajaUsuarioUseCase transactional)
 */
export interface IMasterTransactionRunner {
  /**
   * Ejecuta `fn` dentro de una transacción Prisma MASTER atómica.
   * Los repositorios MASTER dentro del callback usarán el cliente tx
   * vía MasterContext.getClient().
   *
   * @param fn Callback con las operaciones a ejecutar transaccionalmente.
   * @returns El valor retornado por `fn`.
   */
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/** Token DI para IMasterTransactionRunner en NestJS. */
export const MASTER_TRANSACTION_RUNNER = Symbol('MASTER_TRANSACTION_RUNNER');
