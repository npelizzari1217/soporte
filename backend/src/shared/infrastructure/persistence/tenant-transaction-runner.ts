import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../tenancy/tenant-context';

/**
 * ITenantTransactionRunner — puerto para transacciones atómicas multi-tenant.
 *
 * El dominio y la capa de aplicación dependen de este puerto (interface),
 * no de la implementación concreta que usa Prisma.
 */
export interface ITenantTransactionRunner {
  /**
   * Ejecuta `fn` dentro de una transacción Prisma del tenant activo.
   * Dentro del callback, `TenantContext.getClient()` retorna el cliente
   * transaccional (`tx`), no el cliente normal.
   *
   * @param fn Callback que ejecuta operaciones dentro de la transacción.
   * @returns El valor retornado por `fn`.
   */
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/** Token de inyección de dependencias para ITenantTransactionRunner. */
export const TENANT_TRANSACTION_RUNNER = Symbol('TENANT_TRANSACTION_RUNNER');

/**
 * TenantTransactionRunner — implementación de ITenantTransactionRunner.
 *
 * Abre `client.$transaction(tx => ...)` con el cliente Prisma activo del
 * TenantContext y re-bindea el contexto con `tx` para que los repositorios
 * que llamen a `TenantContext.getClient()` dentro del callback obtengan
 * automáticamente el cliente transaccional.
 *
 * Tarea: 0.C.6
 */
@Injectable()
export class TenantTransactionRunner implements ITenantTransactionRunner {
  constructor(private readonly tenantContext: TenantContext) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Recupera el contexto activo (lanza si no hay TenantContext)
    const ctx = this.tenantContext.get();
    if (!ctx) {
      throw new Error('No hay TenantContext activo. ¿Falta TenantGuard o TenantMiddleware?');
    }

    const client = ctx.prismaClient as {
      $transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T>;
    };

    return client.$transaction(async (tx: unknown) => {
      // Re-bindea el TenantContext con el cliente transaccional.
      // Así los repos que llamen getClient() dentro del callback
      // obtienen el tx en lugar del client normal.
      const txCtx = { ...ctx, prismaClient: tx };
      return this.tenantContext.run(txCtx, fn);
    });
  }
}
